import 'dotenv/config';
import express from 'express';
import { VapiClient } from '@vapi-ai/server-sdk';
import { classifyLead } from './services/classifier.js';
import { createLead } from './services/amo-client.js';
import { createDeal } from './services/bitrix-client.js';
import { saveCall, updateCall, listCalls, getStats } from './services/storage.js';
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
  const duration =
    typeof call.duration === 'number'
      ? call.duration
      : parseInt(call.duration, 10) || 0;
  const callType =
    call.direction === 'outbound' || call.type === 'outbound' ? 'outbound' : 'inbound';
  const recordingUrl =
    call.artifact?.recording?.url ||
    call.artifact?.recording?.mono?.url ||
    call.recordingUrl ||
    null;

  let transcript = transcriptToText(call.artifact);

  // Fetch full call details from VAPI if transcript is empty
  if (!transcript && vapi && callId) {
    try {
      const fullCall = await vapi.calls.get(callId);
      transcript = transcriptToText(fullCall.artifact);
    } catch (err) {
      console.error('Failed to fetch call from VAPI:', err.message);
    }
  }

  const transcriptForStorage = call.artifact?.messages || call.artifact?.transcript || [];

  try {
    // Classify lead
    const { temperature, reason } = await classifyLead(transcript || summary, summary);

    const storedCall = createStoredCall({
      callId: callId || `unknown-${Date.now()}`,
      timestamp: new Date().toISOString(),
      callType,
      callerPhone: from,
      callerName: callerName || null,
      duration: typeof duration === 'number' ? duration : parseInt(duration, 10) || 0,
      recordingUrl,
      transcript: transcriptForStorage,
      summary,
      leadTemperature: temperature,
      classificationReason: reason,
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
