import { boss } from '../services/queue.js';

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

export const handleVapiWebhook = async (req, res) => {
    res.sendStatus(200); // Respond immediately to avoid timeout

    const msg = req.body?.message;
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
    const recordingUrl = call.artifact?.recording?.url || call.artifact?.recording?.mono?.url || call.recordingUrl || null;
    const artifact = msg.artifact || call.artifact || {};
    let transcript = transcriptToText(artifact) || (typeof msg.transcript === 'string' ? msg.transcript.trim() : '');
    let transcriptForStorage = artifact.messages || artifact.transcript || [];
    const isValidUuid = callId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(callId));

    const payload = {
        msg, call, callId, summary, from, callerName, callType, recordingUrl,
        isValidUuid, duration, transcript, transcriptForStorage
    };

    // Push to pg-boss queue
    try {
        if (!boss || process.env.BYPASS_QUEUE === 'true') {
            const { handleVapiJob } = await import('../services/queue.js');
            await handleVapiJob(payload);
            console.log(`Bypassed queue, directly processed webhook for call ${callId}`);
        } else {
            const jobId = await boss.send('process-vapi-webhook', payload, {
                retryLimit: 3,
                retryDelay: 60, // 1 minute delay before retry
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
            retryLimit: 3,
        });
        console.log(`Queued process-lead-classification job: ${jobId}`);
    } catch (err) {
        console.error('Failed to queue lead classification job:', err);
    }
};
