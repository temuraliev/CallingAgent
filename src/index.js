import 'dotenv/config';
import express from 'express';
import { VapiClient } from '@vapi-ai/server-sdk';
import { classifyLead } from './services/classifier.js';
import { createLead } from './services/amo-client.js';
import { createDeal } from './services/bitrix-client.js';
import { saveCall, updateCall, listCalls, getStats, updateCallByPhone } from './services/storage.js';
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
  const from =
    call.customer?.number ||
    call.from?.phoneNumber ||
    call.phoneNumberId ||
    call.customer?.phoneNumber ||
    '';
  const callerName =
    call.customer?.name || call.from?.name || call.customer?.firstName || '';
  // VAPI does not send call.duration; calculate from timestamps
  let duration = 0;
  if (typeof call.duration === 'number' && call.duration >= 0) {
    duration = call.duration;
  } else {
    const startedAt = call.startedAt ? new Date(call.startedAt).getTime() : null;
    const endedAt = call.endedAt ? new Date(call.endedAt).getTime() : null;
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

  let transcript = transcriptToText(call.artifact);

  // VAPI API requires callId to be a valid UUID; webhook may send other formats
  const isValidUuid = callId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(callId));

  // Fetch full call from VAPI API when we need transcript or duration (webhook payload often lacks timestamps)
  if (vapi && isValidUuid && (!transcript || duration === 0)) {
    try {
      const fullCall = await vapi.calls.get(callId);
      if (!transcript) transcript = transcriptToText(fullCall.artifact);
      if (duration === 0 && (fullCall.startedAt || fullCall.endedAt)) {
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
    } catch (err) {
      console.error('Failed to fetch call from VAPI:', err.message);
    }
  }

  const transcriptForStorage = call.artifact?.messages || call.artifact?.transcript || [];

  let temperature = 'cold';
  let reason = '';
  try {
    const classified = await classifyLead(transcript || summary, summary);
    temperature = classified.temperature;
    reason = classified.reason || '';
  } catch (err) {
    console.error('Lead classification failed (call will be saved as cold):', err.message);
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
      summary,
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
    return res.status(503).json({ error: 'VAPI not configured. Set VAPI_API_KEY.' });
  }
  const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;
  const assistantId = req.body?.assistantId || process.env.VAPI_ASSISTANT_ID;
  if (!phoneNumberId || !assistantId) {
    return res.status(400).json({
      error: 'Missing config. Set VAPI_PHONE_NUMBER_ID and VAPI_ASSISTANT_ID (or pass assistantId in body).',
    });
  }
  const phoneNumber = req.body?.phoneNumber?.trim();
  if (!phoneNumber) {
    return res.status(400).json({ error: 'phoneNumber is required' });
  }
  const customer = { number: phoneNumber };
  if (req.body?.customerName?.trim()) {
    customer.name = req.body.customerName.trim();
  }
  try {
    const result = await vapi.calls.create({
      assistantId,
      phoneNumberId,
      customer,
    });
    const callId = result?.id ?? result?.callId ?? null;
    const status = result?.status ?? 'started';
    res.status(201).json({ callId, status });
  } catch (err) {
    console.error('Outbound call error:', err);
    res.status(500).json({ error: err.message || 'Failed to start outbound call' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
