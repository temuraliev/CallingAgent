import 'dotenv/config';
import express from 'express';
import { VapiClient } from '@vapi-ai/server-sdk';
import { classifyLead } from './services/classifier.js';
import { createLead } from './services/amo-client.js';
import { createDeal } from './services/bitrix-client.js';
import { saveCall, updateCall, listCalls } from './services/storage.js';
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
  const duration =
    typeof call.duration === 'number'
      ? call.duration
      : parseInt(call.duration, 10) || 0;

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
      callerPhone: from,
      duration: typeof duration === 'number' ? duration : parseInt(duration, 10) || 0,
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
            temperature,
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
            temperature,
            summary,
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

app.get('/api/calls', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 20;
    const calls = await listCalls(limit);
    res.json(calls);
  } catch (err) {
    console.error('List calls error:', err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
