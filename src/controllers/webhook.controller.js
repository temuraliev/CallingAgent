import { boss } from '../services/queue.js';

function transcriptToText(artifact) {
    if (!artifact) return '';
    const messages = artifact.messages || artifact.transcript || artifact.messagesOpenAIFormatted || [];
    return messages
        .map((m) => {
            const role = m.role || (m.speaker === 'user' ? 'user' : 'assistant');
            const msg = m.message ?? m.content ?? m.text ?? '';
            return `[${role}]: ${msg}`;
        })
        .join('\n');
}

function getTranscriptForStorage(artifact) {
    if (!artifact) return [];
    const raw = artifact.messages || artifact.transcript || artifact.messagesOpenAIFormatted || [];
    return raw.map((m) => ({
        role: m.role || (m.speaker === 'user' ? 'user' : 'assistant'),
        message: m.message ?? m.content ?? m.text ?? '',
    })).filter((m) => m.message !== undefined && String(m.message).trim() !== '');
}

export const handleVapiWebhook = async (req, res) => {
    res.sendStatus(200);

    // VAPI can send { message: { type, call, ... } } or the message at top level
    const msg = req.body?.message || (req.body?.type === 'end-of-call-report' ? req.body : null);
    if (!msg || msg.type !== 'end-of-call-report') return;

    const call = msg.call || {};
    const callId = call.id || call.callId || call.call?.id;
    const summary = msg.summary || '';

    const from =
        call.customer?.number ||
        call.from?.phoneNumber ||
        call.phoneNumberId ||
        call.customer?.phoneNumber ||
        '';
    const callerName = call.customer?.name || call.from?.name || call.customer?.firstName || '';

    let duration = call.duration >= 0 ? call.duration : (msg.duration >= 0 ? msg.duration : 0);
    if (duration === 0) {
        const startedAt = (call.startedAt || msg.startedAt) ? new Date(call.startedAt || msg.startedAt).getTime() : null;
        const endedAt = (call.endedAt || msg.endedAt) ? new Date(call.endedAt || msg.endedAt).getTime() : null;
        if (startedAt && endedAt && endedAt > startedAt) duration = Math.round((endedAt - startedAt) / 1000);
    }

    const callType = call.direction === 'outbound' || call.type === 'outbound' ? 'outbound' : 'inbound';
    const artifact = msg.artifact || call.artifact || {};
    const recordingUrl =
        artifact.recording?.url ||
        artifact.recording?.mono?.url ||
        (typeof artifact.recording === 'string' ? artifact.recording : null) ||
        call.recordingUrl ||
        null;
    const transcript = transcriptToText(artifact) || (typeof msg.transcript === 'string' ? msg.transcript.trim() : '');
    const transcriptForStorage = getTranscriptForStorage(artifact);
    const isValidUuid = callId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(callId));

    console.log(`[webhook] end-of-call-report callId=${callId} transcriptLen=${transcript.length} recording=${!!recordingUrl} artifactKeys=${Object.keys(artifact || {}).join(',')}`);

    const payload = {
        msg, call, callId, summary, from, callerName, callType, recordingUrl,
        isValidUuid, duration, transcript, transcriptForStorage
    };

    try {
        if (!boss || process.env.BYPASS_QUEUE === 'true') {
            const { handleVapiJob } = await import('../services/queue.js');
            await handleVapiJob(payload);
            console.log(`Bypassed queue, directly processed webhook for call ${callId}`);
        } else {
            const jobId = await boss.send('process-vapi-webhook', payload, {
                retryLimit: 10,
                retryDelay: 60, // 1 minute initial delay
                retryBackoff: true, // Exponential backoff
            });
            console.log(`Queued process-vapi-webhook job: ${jobId}`);
        }
    } catch (err) {
        console.error('Failed to process VAPI webhook:', err);
    }
};

export const handleLeadClassification = async (req, res) => {
    res.sendStatus(200);

    const { name, phone, interestLevel, notes, interestedActivities, wantsCallback } = req.body || {};
    if (!phone) return;

    const updates = {
        leadTemperature: ['cold', 'warm', 'hot'].includes(String(interestLevel || '').toLowerCase())
            ? String(interestLevel).toLowerCase()
            : undefined,
        classificationReason: notes ? `VAPI: ${notes}` : undefined,
        callerName: name || undefined,
    };

    if (Array.isArray(interestedActivities) && interestedActivities.length > 0) updates.interestedActivities = interestedActivities;
    if (typeof wantsCallback === 'boolean') updates.wantsCallback = wantsCallback;

    try {
        const jobId = await boss.send('process-lead-classification', { phone, updates }, {
            retryLimit: 10,
            retryDelay: 60,
            retryBackoff: true,
        });
        console.log(`Queued process-lead-classification job: ${jobId}`);
    } catch (err) {
        console.error('Failed to queue lead classification job:', err);
    }
};
