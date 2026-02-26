import 'dotenv/config';
import express from 'express';
import { VapiClient } from '@vapi-ai/server-sdk';
import { classifyLead, translateToRussian } from './services/classifier.js';
import { createLead } from './services/amo-client.js';
import { createDeal } from './services/bitrix-client.js';
import { saveCall, updateCall, listCalls, getStats, updateCallByPhone } from './services/storage.js';
import { loadSettings, saveSettings } from './services/settings.js';
import { createStoredCall } from './schemas/call.js';

const app = express();
app.use(express.json());
app.use(express.static('public'));

const vapi = process.env.VAPI_API_KEY
  ? new VapiClient({ token: process.env.VAPI_API_KEY })
  : null;

/**
 * Extracts transcript from call artifact (messages or transcript array).
 * @param {Object} artifact - VAPI call artifact
 * @returns {string} Transcript as text
 */
function transcriptToText(artifact) {
  if (!artifact) return '';
  const messages = artifact.messages || artifact.transcript || artifact.messagesOpenAIFormatted || [];
  return messages
    .map((m) => {
      const role = m.role || (m.speaker === 'user' ? 'user' : 'assistant');
      const msg = m.message || m.content || '';
      return `[${role}]: ${msg}`;
    })
    .join('\n');
}

/**
 * Handles VAPI end-of-call-report webhook.
 */
app.post('/webhook/vapi', async (req, res) => {
  res.sendStatus(200); // Respond immediately to avoid timeout

  const msg = req.body?.message;
  if (!msg || msg.type !== 'end-of-call-report') {
    return;
  }

  const call = msg.call || {};
  const callId = call.id || call.callId || call.call?.id;
  const summary = msg.summary || '';

  console.log('[WEBHOOK DEBUG] msg keys:', Object.keys(msg).join(', '),
    '| call keys:', Object.keys(call).join(', '),
    '| msg.artifact keys:', msg.artifact ? Object.keys(msg.artifact).join(', ') : 'none',
    '| msg.transcript type:', typeof msg.transcript, '| msg.transcript length:', (msg.transcript || '').length,
    '| call.artifact keys:', call.artifact ? Object.keys(call.artifact).join(', ') : 'none',
    '| callId:', callId, '| duration:', call.duration,
    '| startedAt:', call.startedAt, '| endedAt:', call.endedAt);

  const from =
    call.customer?.number ||
    call.from?.phoneNumber ||
    call.phoneNumberId ||
    call.customer?.phoneNumber ||
    '';
  const callerName =
    call.customer?.name || call.from?.name || call.customer?.firstName || '';

  let duration = 0;
  if (typeof call.duration === 'number' && call.duration >= 0) {
    duration = call.duration;
  } else if (typeof msg.duration === 'number' && msg.duration >= 0) {
    duration = msg.duration;
  } else {
    const startedAt = (call.startedAt || msg.startedAt) ? new Date(call.startedAt || msg.startedAt).getTime() : null;
    const endedAt = (call.endedAt || msg.endedAt) ? new Date(call.endedAt || msg.endedAt).getTime() : null;
    if (startedAt && endedAt && endedAt > startedAt) {
      duration = Math.round((endedAt - startedAt) / 1000);
    } else if (call.createdAt && call.updatedAt) {
      const created = new Date(call.createdAt).getTime();
      const updated = new Date(call.updatedAt).getTime();
      duration = Math.max(0, Math.round((updated - created) / 1000));
    }
  }
  const callType =
    call.direction === 'outbound' || call.type === 'outbound' ? 'outbound' : 'inbound';
  const recordingUrl =
    call.artifact?.recording?.url ||
    call.artifact?.recording?.mono?.url ||
    call.recordingUrl ||
    null;

  // VAPI puts artifact at message level (msg.artifact), not call level
  const artifact = msg.artifact || call.artifact || {};
  let transcript = transcriptToText(artifact);
  // msg.transcript is a plain-text fallback VAPI also provides
  if (!transcript && typeof msg.transcript === 'string' && msg.transcript.trim()) {
    transcript = msg.transcript.trim();
  }
  let transcriptForStorage = artifact.messages || artifact.transcript || [];

  // VAPI API requires callId to be a valid UUID; webhook may send other formats
  const isValidUuid = callId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(callId));

  function extractMessages(obj) {
    if (!obj) return [];
    return obj.artifact?.messages
      || obj.artifact?.transcript
      || obj.messages
      || obj.transcript
      || obj.artifact?.messagesOpenAIFormatted
      || obj.artifactPlan?.messages
      || [];
  }

  // Fetch full call from VAPI API to fill in missing data (transcript, duration)
  if (vapi && isValidUuid && (!transcript || duration === 0 || transcriptForStorage.length === 0)) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (attempt > 0) await new Promise(r => setTimeout(r, 5000));
        const fullCall = await vapi.calls.get(callId);
        const msgs = extractMessages(fullCall);
        console.log(`[VAPI attempt ${attempt + 1}] keys:`, Object.keys(fullCall).join(', '),
          '| artifact keys:', fullCall.artifact ? Object.keys(fullCall.artifact).join(', ') : 'none',
          '| msgs found:', msgs.length,
          '| startedAt:', fullCall.startedAt, '| endedAt:', fullCall.endedAt);

        if (!transcript && msgs.length > 0) {
          transcript = msgs.map(m => {
            const role = m.role || 'unknown';
            const text = m.message || m.content || m.text || '';
            return text ? `[${role}]: ${text}` : '';
          }).filter(Boolean).join('\n');
        }

        if (transcriptForStorage.length === 0 && msgs.length > 0) {
          transcriptForStorage = msgs;
        }

        if (duration === 0) {
          if (typeof fullCall.duration === 'number' && fullCall.duration >= 0) {
            duration = fullCall.duration;
          } else {
            const started = fullCall.startedAt ? new Date(fullCall.startedAt).getTime() : null;
            const ended = fullCall.endedAt ? new Date(fullCall.endedAt).getTime() : null;
            if (started && ended && ended > started) {
              duration = Math.round((ended - started) / 1000);
            } else if (fullCall.createdAt && fullCall.updatedAt) {
              const created = new Date(fullCall.createdAt).getTime();
              const updated = new Date(fullCall.updatedAt).getTime();
              duration = Math.max(0, Math.round((updated - created) / 1000));
            }
          }
        }

        if (transcript && transcriptForStorage.length > 0 && duration > 0) break;
      } catch (err) {
        console.error(`VAPI fetch failed (attempt ${attempt + 1}):`, err.message);
        break;
      }
    }
  }
  console.log('[RESULT] callId:', callId, '| duration:', duration, 'sec | transcript msgs:', transcriptForStorage.length);

  let temperature = 'cold';
  let reason = '';
  try {
    const classified = await classifyLead(transcript || summary, summary);
    temperature = classified.temperature;
    reason = classified.reason || '';
  } catch (err) {
    console.error('Lead classification failed (call will be saved as cold):', err.message);
  }

  // Translate summary to Russian if it came in English from VAPI
  let summaryRu = summary;
  if (summary) {
    try {
      summaryRu = await translateToRussian(summary);
    } catch { summaryRu = summary; }
  }

  try {
    const storedCall = createStoredCall({
      callId: callId || `unknown-${Date.now()}`,
      timestamp: new Date().toISOString(),
      callType,
      callerPhone: from,
      callerName: callerName || null,
      duration,
      recordingUrl,
      transcript: transcriptForStorage,
      summary: summaryRu,
      leadTemperature: temperature,
      classificationReason: reason || '',
      crmId: null,
      crmProvider: null,
    });

    await saveCall(storedCall);

    // Push to CRM if configured
    const crmProvider = process.env.CRM_PROVIDER;
    if (crmProvider === 'amo') {
      if (
        process.env.AMO_SUBDOMAIN &&
        process.env.AMO_ACCESS_TOKEN &&
        process.env.AMO_PIPELINE_ID
      ) {
        try {
          const { leadId } = await createLead({
            phone: from || 'unknown',
            name: callerName || undefined,
            temperature,
            duration: storedCall.duration,
            recordingUrl: storedCall.recordingUrl,
            summary,
            customFields: {},
          });
          storedCall.crmId = String(leadId);
          storedCall.crmProvider = 'amo';
          await updateCall(storedCall.callId, { crmId: String(leadId), crmProvider: 'amo' });
        } catch (err) {
          console.error('Amo CRM sync failed:', err.message);
        }
      }
    } else if (crmProvider === 'bitrix') {
      if (process.env.BITRIX24_DOMAIN && process.env.BITRIX24_WEBHOOK_CODE) {
        try {
          const { dealId } = await createDeal({
            phone: from || 'unknown',
            name: callerName || undefined,
            temperature,
            summary,
            duration: storedCall.duration,
            recordingUrl: storedCall.recordingUrl,
          });
          storedCall.crmId = String(dealId);
          storedCall.crmProvider = 'bitrix';
          await updateCall(storedCall.callId, { crmId: String(dealId), crmProvider: 'bitrix' });
        } catch (err) {
          console.error('Bitrix24 CRM sync failed:', err.message);
        }
      }
    }

    console.log(`Call ${storedCall.callId} processed: ${temperature} lead`);
  } catch (err) {
    console.error('Webhook processing error:', err);
  }
});

/**
 * Receives lead classification from VAPI (tool/function webhook).
 * Payload: { name, phone, interestLevel, notes, interestedActivities, wantsCallback }
 * Updates the most recent call for that phone with the classification.
 */
app.post('/webhook/lead-classification', (req, res) => {
  res.sendStatus(200);

  const { name, phone, interestLevel, notes, interestedActivities, wantsCallback } = req.body || {};
  if (!phone) {
    console.warn('Lead classification webhook: missing phone');
    return;
  }

  const updates = {
    leadTemperature: ['cold', 'warm', 'hot'].includes(String(interestLevel || '').toLowerCase())
      ? String(interestLevel).toLowerCase()
      : undefined,
    classificationReason: notes ? `VAPI: ${notes}` : undefined,
    callerName: name || undefined,
  };
  if (Array.isArray(interestedActivities) && interestedActivities.length > 0) {
    updates.interestedActivities = interestedActivities;
  }
  if (typeof wantsCallback === 'boolean') {
    updates.wantsCallback = wantsCallback;
  }

  const clean = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));

  updateCallByPhone(phone, clean)
    .then((ok) => {
      if (ok) console.log(`Lead classification updated for ${phone}: ${interestLevel || 'N/A'}`);
      else console.warn(`Lead classification: no call found for phone ${phone}`);
    })
    .catch((err) => console.error('Lead classification webhook error:', err));
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * Config for the web call widget (public key + assistant ID).
 * Used by /call.html - VAPI public key is safe to expose client-side.
 */
app.get('/api/config', (req, res) => {
  const publicKey = process.env.VAPI_PUBLIC_API_KEY || '';
  const assistantId = process.env.VAPI_ASSISTANT_ID || '';
  res.json({ vapiPublicKey: publicKey, vapiAssistantId: assistantId });
});

app.get('/api/settings', async (req, res) => {
  try {
    const settings = await loadSettings();
    // If local settings are empty, try to load from VAPI assistant
    const assistantId = process.env.VAPI_ASSISTANT_ID;
    if (vapi && assistantId && !settings._synced) {
      try {
        const assistant = await vapi.assistants.get(assistantId);
        const vapiPrompt = assistant.model?.messages?.find(m => m.role === 'system')?.content;
        if (vapiPrompt && !settings.systemPrompt) settings.systemPrompt = vapiPrompt;
        if (assistant.firstMessage && !settings.firstMessage) settings.firstMessage = assistant.firstMessage;
      } catch (_) { /* ignore */ }
    }
    res.json(settings);
  } catch (err) {
    console.error('Load settings error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    const { systemPrompt, firstMessage } = req.body || {};
    const updates = {};
    if (typeof systemPrompt === 'string') updates.systemPrompt = systemPrompt;
    if (typeof firstMessage === 'string') updates.firstMessage = firstMessage;
    const saved = await saveSettings(updates);

    // Sync to VAPI assistant via REST API so changes apply to all calls
    const assistantId = process.env.VAPI_ASSISTANT_ID;
    const vapiKey = process.env.VAPI_API_KEY;
    if (vapiKey && assistantId && (saved.systemPrompt || saved.firstMessage)) {
      try {
        // Get current assistant to preserve model config
        const getRes = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
          headers: { Authorization: `Bearer ${vapiKey}` },
        });
        if (!getRes.ok) throw new Error(`GET assistant failed: ${getRes.status}`);
        const current = await getRes.json();

        const patch = {};
        if (saved.firstMessage) patch.firstMessage = saved.firstMessage;
        if (saved.systemPrompt && current.model) {
          patch.model = {
            provider: current.model.provider,
            model: current.model.model,
            messages: [{ role: 'system', content: saved.systemPrompt }],
          };
          if (current.model.temperature != null) patch.model.temperature = current.model.temperature;
          if (current.model.maxTokens != null) patch.model.maxTokens = current.model.maxTokens;
        }

        console.log('[VAPI SYNC] Sending patch:', JSON.stringify(patch).slice(0, 300));

        const patchRes = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${vapiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(patch),
        });

        if (!patchRes.ok) {
          const errBody = await patchRes.text();
          throw new Error(`PATCH failed ${patchRes.status}: ${errBody}`);
        }

        console.log('VAPI assistant updated successfully');
        saved._vapiSynced = true;
      } catch (vapiErr) {
        console.error('Failed to sync settings to VAPI:', vapiErr.message);
        saved._vapiError = vapiErr.message;
      }
    }

    res.json(saved);
  } catch (err) {
    console.error('Save settings error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/calls', async (req, res) => {
  try {
    const opts = {
      from: req.query.from || undefined,
      to: req.query.to || undefined,
      status: req.query.status || undefined,
      type: req.query.type || undefined,
      durationMin: req.query.durationMin != null ? parseInt(req.query.durationMin, 10) : undefined,
      durationMax: req.query.durationMax != null ? parseInt(req.query.durationMax, 10) : undefined,
      phone: req.query.phone || undefined,
      limit: parseInt(req.query.limit, 10) || 20,
      offset: parseInt(req.query.offset, 10) || 0,
    };
    const calls = await listCalls(opts);
    res.json(calls);
  } catch (err) {
    console.error('List calls error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const opts = {
      from: req.query.from || undefined,
      to: req.query.to || undefined,
    };
    const stats = await getStats(opts);
    res.json(stats);
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Start an outbound call via VAPI.
 * Body: { phoneNumber, customerName?, assistantId? }
 * Requires VAPI_API_KEY, VAPI_PHONE_NUMBER_ID; uses VAPI_ASSISTANT_ID if assistantId not provided.
 */
app.post('/api/calls/outbound', async (req, res) => {
  if (!vapi) {
    return res.status(503).json({ error: 'VAPI не настроен. Укажите VAPI_API_KEY.' });
  }
  const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;
  const assistantId = req.body?.assistantId || process.env.VAPI_ASSISTANT_ID;
  if (!phoneNumberId || !assistantId) {
    return res.status(400).json({
      error: 'Не указаны VAPI_PHONE_NUMBER_ID и VAPI_ASSISTANT_ID.',
    });
  }
  const phoneNumber = req.body?.phoneNumber?.trim();
  if (!phoneNumber) {
    return res.status(400).json({ error: 'Укажите номер телефона' });
  }
  const customer = { number: phoneNumber };
  if (req.body?.customerName?.trim()) {
    customer.name = req.body.customerName.trim();
  }
  try {
    const settings = await loadSettings();
    const callParams = {
      assistantId,
      phoneNumberId,
      customer,
    };
    // Override assistant settings if custom systemPrompt or firstMessage are set
    if (settings.systemPrompt || settings.firstMessage) {
      callParams.assistantOverrides = {};
      if (settings.firstMessage) {
        callParams.assistantOverrides.firstMessage = settings.firstMessage;
      }
      if (settings.systemPrompt) {
        callParams.assistantOverrides.model = {
          messages: [{ role: 'system', content: settings.systemPrompt }],
        };
      }
    }
    const result = await vapi.calls.create(callParams);
    const callId = result?.id ?? result?.callId ?? null;
    const status = result?.status ?? 'started';
    res.status(201).json({ callId, status });
  } catch (err) {
    console.error('Outbound call error:', err);
    res.status(500).json({ error: err.message || 'Не удалось запустить звонок' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
