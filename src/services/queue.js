import PgBoss from 'pg-boss';
import 'dotenv/config';
import { VapiClient } from '@vapi-ai/server-sdk';
import { classifyLead, translateToRussian } from './classifier.js';
import { createLead } from './amo-client.js';
import { createDeal } from './bitrix-client.js';
import { saveCall, updateCall, updateCallByPhone } from './storage.js';
import { createStoredCall } from '../schemas/call.js';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/callingagent';

export const boss = new PgBoss(connectionString);

export async function initQueue() {
    boss.on('error', error => console.error('pg-boss error:', error));

    await boss.start();
    console.log('pg-boss started successfully');

    await boss.work('process-vapi-webhook', async (job) => {
        try {
            await handleVapiJob(job.data);
        } catch (err) {
            console.error(`Failed to process VAPI job ${job.id}:`, err);
            throw err; // Trigger retry
        }
    });

    await boss.work('process-lead-classification', async (job) => {
        try {
            await handleClassificationJob(job.data);
        } catch (err) {
            console.error(`Failed to process classification job ${job.id}:`, err);
            throw err;
        }
    });

    console.log('pg-boss workers registered');
}

function transcriptToText(artifact) {
    if (!artifact) return '';
    const messages = artifact.messages || artifact.transcript || artifact.messagesOpenAIFormatted || [];
    return messages
        .map((m) => {
            const role = m.role || (m.speaker === 'user' ? 'user' : 'assistant');
            const msg = m.message || m.content || '';
            return `[${role}]: ${msg}`;
        })
        .join('\\n');
}

export async function handleVapiJob(payload) {
    const { msg, call, callId, summary, from, callerName, callType, recordingUrl, isValidUuid } = payload;

    let duration = payload.duration;
    let transcript = payload.transcript;
    let transcriptForStorage = payload.transcriptForStorage;

    const vapi = process.env.VAPI_API_KEY ? new VapiClient({ token: process.env.VAPI_API_KEY }) : null;

    if (vapi && isValidUuid && (!transcript || duration === 0 || transcriptForStorage.length === 0)) {
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                if (attempt > 0) await new Promise(r => setTimeout(r, 5000));
                const fullCall = await vapi.calls.get(callId);
                const msgs = fullCall.artifact?.messages || fullCall.artifact?.transcript || fullCall.messages || [];

                if (!transcript && msgs.length > 0) {
                    transcript = msgs.map(m => `[${m.role || 'unknown'}]: ${m.message || m.content || m.text || ''}`).filter(Boolean).join('\n');
                }
                if (transcriptForStorage.length === 0 && msgs.length > 0) transcriptForStorage = msgs;
                if (duration === 0 && typeof fullCall.duration === 'number') duration = fullCall.duration;
                if (transcript && transcriptForStorage.length > 0 && duration > 0) break;
            } catch (err) {
                console.error(`VAPI fetch failed (attempt ${attempt + 1}):`, err.message);
                if (attempt === 2) throw err; // Throw to trigger pg-boss retry
                continue;
            }
        }
    }

    let temperature = 'cold';
    let reason = '';
    try {
        const classified = await classifyLead(transcript || summary, summary);
        temperature = classified.temperature;
        reason = classified.reason || '';
    } catch (err) {
        console.error('Lead classification failed:', err.message);
        const msg = (err.message || '').toLowerCase();
        if (msg.includes('429') || msg.includes('too many') || msg.includes('503') || msg.includes('fetch failed')) {
            throw err; // Throw to trigger pg-boss retry for transient AI rate limits
        }
    }

    let summaryRu = summary;
    if (summary) {
        try { summaryRu = await translateToRussian(summary); } catch { /* ignore */ }
    }

    const storedCall = createStoredCall({
        callId: callId || `unknown-${Date.now()}`,
        timestamp: new Date().toISOString(),
        callType, callerPhone: from, callerName: callerName || null,
        duration, recordingUrl, transcript: transcriptForStorage, summary: summaryRu,
        leadTemperature: temperature, classificationReason: reason || '',
    });

    await saveCall(storedCall);
    const crmProvider = process.env.CRM_PROVIDER;

    if (crmProvider === 'amo' && process.env.AMO_PIPELINE_ID) {
        try {
            const { leadId } = await createLead({
                phone: from || 'unknown', name: callerName || undefined, temperature,
                duration: storedCall.duration, recordingUrl: storedCall.recordingUrl, summary
            });
            await updateCall(storedCall.callId, { crmId: String(leadId), crmProvider: 'amo' });
        } catch (err) {
            console.error('Amo CRM sync failed:', err.message);
            // Do not throw: call is saved; user can retry via "Отправить в CRM" in UI
        }
    } else if (crmProvider === 'bitrix' && process.env.BITRIX24_WEBHOOK_CODE) {
        try {
            const { dealId } = await createDeal({
                phone: from || 'unknown', name: callerName || undefined, temperature,
                summary, duration: storedCall.duration, recordingUrl: storedCall.recordingUrl,
            });
            await updateCall(storedCall.callId, { crmId: String(dealId), crmProvider: 'bitrix' });
        } catch (err) {
            console.error('Bitrix24 CRM sync failed:', err.message);
            // Do not throw: call is saved; user can retry via "Отправить в CRM" in UI
        }
    }
}

export async function handleClassificationJob(payload) {
    const { phone, updates } = payload;
    const clean = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
    await updateCallByPhone(phone, clean);
}
