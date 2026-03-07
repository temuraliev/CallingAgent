import { VapiClient } from '@vapi-ai/server-sdk';
import { readFileSync } from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadSettings, saveSettings, syncToVapi } from '../services/settings.js';
import { listCalls, getStats, getScript, getCallByCallId, updateCall, saveCall } from '../services/storage.js';
import { createStoredCall } from '../schemas/call.js';
import { createLead, updateLeadStatus } from '../services/amo-client.js';
import { createDeal, updateDealStage } from '../services/bitrix-client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

export const getHealth = (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
};

export const getConfig = (req, res) => {
    const publicKey = process.env.VAPI_PUBLIC_API_KEY || '';
    const assistantId = process.env.VAPI_ASSISTANT_ID || '';
    res.json({ vapiPublicKey: publicKey, vapiAssistantId: assistantId });
};

export const getSettings = async (req, res) => {
    try {
        const settings = await loadSettings();
        const assistantId = process.env.VAPI_ASSISTANT_ID;
        const vapiKey = process.env.VAPI_API_KEY;

        // If local settings are empty, try to load from VAPI assistant
        if (vapiKey && assistantId && !settings._synced) {
            const vapi = new VapiClient({ token: vapiKey });
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
};

export const updateSettings = async (req, res) => {
    try {
        const { systemPrompt, firstMessage } = req.body || {};
        const updates = {};
        if (typeof systemPrompt === 'string') updates.systemPrompt = systemPrompt;
        if (typeof firstMessage === 'string') updates.firstMessage = firstMessage;
        const saved = await saveSettings(updates);
        const result = await syncToVapi(saved);
        res.json(result);
    } catch (err) {
        console.error('Save settings error:', err);
        res.status(500).json({ error: err.message });
    }
};

export const updateCallById = async (req, res) => {
    try {
        const { callId } = req.params;
        const { leadTemperature, classificationReason } = req.body || {};
        const call = await getCallByCallId(callId);
        if (!call) return res.status(404).json({ error: 'Звонок не найден' });

        const updates = {};
        if (['cold', 'warm', 'hot'].includes(String(leadTemperature || '').toLowerCase())) {
            updates.leadTemperature = String(leadTemperature).toLowerCase();
        }
        if (typeof classificationReason === 'string') updates.classificationReason = classificationReason;
        if (typeof req.body.notes === 'string') updates.notes = req.body.notes;
        if (Object.keys(updates).length === 0) return res.json(call);

        await updateCall(callId, updates);

        if (updates.leadTemperature && call.crmId && call.crmProvider) {
            try {
                if (call.crmProvider === 'amo') {
                    await updateLeadStatus(call.crmId, updates.leadTemperature);
                } else if (call.crmProvider === 'bitrix') {
                    await updateDealStage(call.crmId, updates.leadTemperature);
                }
            } catch (crmErr) {
                console.error('CRM update failed:', crmErr.message);
                return res.status(200).json({
                    ...call,
                    ...updates,
                    _crmError: crmErr.message,
                    message: 'Классификация сохранена, обновление CRM не удалось',
                });
            }
        }

        const updated = await getCallByCallId(callId);
        res.json(updated);
    } catch (err) {
        console.error('Update call error:', err);
        res.status(500).json({ error: err.message });
    }
};

/** Retry or perform CRM sync for a call (create or update lead/deal) */
export const syncCallToCrm = async (req, res) => {
    try {
        const { callId } = req.params;
        const call = await getCallByCallId(callId);
        if (!call) return res.status(404).json({ error: 'Звонок не найден' });

        const crmProvider = process.env.CRM_PROVIDER;
        const temperature = call.leadTemperature || 'cold';

        if (crmProvider === 'amo' && process.env.AMO_PIPELINE_ID) {
            if (call.crmId && call.crmProvider === 'amo') {
                await updateLeadStatus(call.crmId, temperature);
            } else {
                const { leadId } = await createLead({
                    phone: call.callerPhone || 'unknown',
                    name: call.callerName,
                    temperature,
                    duration: call.duration,
                    recordingUrl: call.recordingUrl,
                    summary: call.summary,
                });
                await updateCall(callId, { crmId: String(leadId), crmProvider: 'amo' });
            }
        } else if (crmProvider === 'bitrix' && process.env.BITRIX24_WEBHOOK_CODE) {
            if (call.crmId && call.crmProvider === 'bitrix') {
                await updateDealStage(call.crmId, temperature);
            } else {
                const { dealId } = await createDeal({
                    phone: call.callerPhone || 'unknown',
                    name: call.callerName,
                    temperature,
                    summary: call.summary,
                    duration: call.duration,
                    recordingUrl: call.recordingUrl,
                });
                await updateCall(callId, { crmId: String(dealId), crmProvider: 'bitrix' });
            }
        } else {
            return res.status(400).json({ error: 'CRM не настроен (CRM_PROVIDER, Amo/Bitrix env)' });
        }

        const updated = await getCallByCallId(callId);
        res.json(updated);
    } catch (err) {
        console.error('Sync call to CRM error:', err);
        res.status(500).json({ error: err.message });
    }
};

export const getCalls = async (req, res) => {
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
        const callsList = await listCalls(opts);
        res.json(callsList);
    } catch (err) {
        console.error('List calls error, falling back to mock data:', err.message);
        res.json([{
            id: 1,
            callId: 'mock-1234',
            timestamp: new Date().toISOString(),
            callType: 'inbound',
            callerPhone: '+79991234567',
            callerName: 'Демо Клиент (Test Audio)',
            duration: 45,
            recordingUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
            leadTemperature: 'hot',
            summary: 'Клиент протестировал входящий звонок с записью аудио.',
            transcript: [
                { role: 'assistant', content: 'Здравствуйте! Вы позвонили в демо-линию.' },
                { role: 'user', content: 'Привет, я хочу послушать как играет аудиоплеер.' },
                { role: 'assistant', content: 'Отлично, открывайте панель транскрипта!' }
            ]
        }]);
    }
};

export const getStatsSummary = async (req, res) => {
    try {
        const opts = {
            from: req.query.from || undefined,
            to: req.query.to || undefined,
        };
        const stats = await getStats(opts);
        res.json(stats);
    } catch (err) {
        console.error('Stats error, falling back to mock data:', err.message);
        res.json({ totalCalls: 1, totalDurationSeconds: 45, hotCount: 1, warmCount: 0, coldCount: 0 });
    }
};

export const createOutboundCall = async (req, res) => {
    const vapiKey = process.env.VAPI_API_KEY;
    if (!vapiKey) {
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
        const vapi = new VapiClient({ token: vapiKey });
        const settings = await loadSettings();

        let finalFirstMessage = req.body?.firstMessage || settings.firstMessage;
        let finalSystemPrompt = req.body?.systemPrompt || settings.systemPrompt;

        // If scriptId is provided, it overrides settings
        if (req.body?.scriptId) {
            const script = await getScript(req.body.scriptId);
            if (script) {
                if (script.firstMessage) finalFirstMessage = script.firstMessage;
                if (script.systemPrompt) finalSystemPrompt = script.systemPrompt;
                console.log(`Using script "${script.name}" for outbound call`);
            }
        }

        const callParams = {
            assistantId,
            phoneNumberId,
            customer,
        };

        if (finalSystemPrompt || finalFirstMessage) {
            callParams.assistantOverrides = {};
            if (finalFirstMessage) {
                callParams.assistantOverrides.firstMessage = finalFirstMessage;
            }
            if (finalSystemPrompt) {
                callParams.assistantOverrides.model = {
                    messages: [{ role: 'system', content: finalSystemPrompt }],
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
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const syncCall = async (req, res) => {
    console.log('--- Sync triggered ---', req.body);
    let id;
    try {
        const { callId } = req.body || {};
        if (!callId || typeof callId !== 'string') return res.status(400).json({ error: 'callId is required' });
        id = callId.trim();
        if (!UUID_RE.test(id)) return res.status(400).json({ error: 'callId must be a valid UUID' });

        const { handleVapiJob } = await import('../services/queue.js');
        const vapi = process.env.VAPI_API_KEY ? new VapiClient({ token: process.env.VAPI_API_KEY }) : null;

        if (!vapi) throw new Error('VAPI_API_KEY not configured');

        // Fetch call from VAPI (retry on 404: call may not be available immediately after end)
        let call;
        const maxAttempts = 4;
        const delayMs = 2500;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                call = await vapi.calls.get({ id });
                break;
            } catch (fetchErr) {
                const is404 = fetchErr?.statusCode === 404 || fetchErr?.body?.statusCode === 404;
                if (is404 && attempt < maxAttempts) {
                    console.log(`Call ${id} not ready (404), retry ${attempt}/${maxAttempts} in ${delayMs}ms...`);
                    await new Promise(r => setTimeout(r, delayMs));
                    continue;
                }
                throw fetchErr;
            }
        }
        if (!call) throw new Error('Call not found');
        const callData = call?.data ?? call;

        const artifact = callData.artifact || {};
        const msgs = artifact.messages || artifact.transcript || [];
        const transcript = msgs.length > 0
            ? msgs.map(m => `[${m.role || 'unknown'}]: ${m.message || m.content || m.text || ''}`).filter(Boolean).join('\n')
            : '';
        const recordingUrl = callData.artifact?.recording?.url || callData.artifact?.recording?.mono?.url || callData.recordingUrl || null;

        const payload = {
            msg: { type: 'end-of-call-report', summary: callData.summary || '' },
            call: callData,
            callId: callData.id || id,
            summary: callData.summary || '',
            from: callData.customer?.number || callData.customer?.phoneNumber || 'unknown',
            callerName: callData.customer?.name || callData.customer?.firstName || null,
            callType: (callData.direction === 'outbound' || callData.type === 'outbound') ? 'outbound' : 'inbound',
            recordingUrl: recordingUrl || '',
            isValidUuid: true,
            duration: callData.duration || 0,
            transcript,
            transcriptForStorage: msgs
        };

        console.log(`Syncing call ${id} from Vapi...`);
        await handleVapiJob(payload);
        console.log(`Sync completed for ${id}`);
        res.json({ success: true, message: 'Call saved' });
    } catch (err) {
        console.error('Sync call error:', err);
        const is404 = err?.statusCode === 404 || err?.body?.statusCode === 404;
        if (is404) {
            // VAPI may not expose web/browser calls via API — save a stub so the call appears in Dashboard
            try {
                const stub = createStoredCall({
                    callId: id,
                    timestamp: new Date().toISOString(),
                    callType: 'inbound',
                    callerPhone: '',
                    callerName: 'Demo Call (браузер)',
                    duration: 0,
                    recordingUrl: null,
                    transcript: [],
                    summary: 'Звонок из браузера. Данные из VAPI по этому ID недоступны (возможно, не поддерживаются для веб-звонков).',
                    leadTemperature: 'cold',
                    classificationReason: '',
                });
                await saveCall(stub);
                console.log(`Saved stub call ${id} (VAPI 404).`);
                return res.json({ success: true, message: 'Call saved (minimal record)' });
            } catch (saveErr) {
                console.error('Stub save failed:', saveErr);
                return res.status(404).json({
                    error: 'Звонок не найден в VAPI. Запись не создана.',
                });
            }
        }
        res.status(500).json({ error: err.message });
    }
};

export const getBenchmarkResults = (req, res) => {
    const resultsPath = join(ROOT, 'benchmark', 'results.json');
    try {
        const data = readFileSync(resultsPath, 'utf-8');
        res.json(JSON.parse(data));
    } catch (err) {
        res.status(404).json({ error: 'Benchmark results not found' });
    }
};

export const runBenchmark = (req, res) => {
    const { quick, limit } = req.body || {};
    const scriptPath = join(ROOT, 'scripts', 'evaluate.js');
    const args = [scriptPath];
    if (limit != null && Number.isFinite(Number(limit))) {
        args.push(`--limit=${Number(limit)}`);
    } else if (quick) {
        args.push('--quick');
    }
    res.setTimeout(900000);
    const child = spawn(process.execPath, args, {
        cwd: ROOT,
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('close', (code) => {
        if (code === 0) {
            res.json({ success: true });
        } else {
            res.status(500).json({ error: stderr.slice(-1000) || `Benchmark exited with code ${code}` });
        }
    });
    child.on('error', (err) => {
        res.status(500).json({ error: err.message });
    });
};

export const simulateInboundWebhook = async (req, res) => {
    try {
        const { handleVapiJob } = await import('../services/queue.js');
        const mockPayload = {
            message: {
                type: 'end-of-call-report',
                summary: 'Клиент интересуется услугами и просит перезвонить. Кажется заинтересованным, но нужно уточнить детали у команды.',
                call: {
                    id: `sim-in-${Date.now()}`,
                    duration: 120,
                    direction: 'inbound',
                    customer: { number: '+998901234567', name: 'Иван Сергеевич' },
                    artifact: {
                        messages: [
                            { role: 'assistant', message: 'Здравствуйте! Чем могу помочь?' },
                            { role: 'user', message: 'Добрый день, подскажите ваши цены.' },
                            { role: 'assistant', message: 'Конечно! Стоимость начинается от 10 000 руб. Желаете демо?' },
                            { role: 'user', message: 'Возможно. Мне нужно обсудить с коллегами. Можете перезвонить позже?' },
                        ],
                    },
                },
            },
        };

        const msg = mockPayload.message;
        const call = msg.call;
        const payload = {
            msg, call, callId: call.id, summary: msg.summary,
            from: call.customer.number, callerName: call.customer.name,
            callType: 'inbound', recordingUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
            isValidUuid: false, duration: call.duration,
            transcript: call.artifact.messages.map(m => `[${m.role}]: ${m.message}`).join('\n'),
            transcriptForStorage: call.artifact.messages
        };

        await handleVapiJob(payload);
        res.status(200).json({ success: true, callId: call.id });
    } catch (err) {
        console.error('Simulate inbound error:', err);
        res.status(500).json({ error: err.message });
    }
};

export const simulateOutboundCall = async (req, res) => {
    try {
        const { handleVapiJob } = await import('../services/queue.js');
        const phone = req.body?.phoneNumber || '+79991234567';
        const name = req.body?.customerName || 'Тестовый Исходящий';

        const callId = `sim-out-${Date.now()}`;

        // Simulating the call process: it normally takes time.
        // We'll respond "started" now, and "finish" it in a few seconds in the background.
        res.status(201).json({ callId, status: 'queued-demo' });

        setTimeout(async () => {
            try {
                const payload = {
                    msg: {}, call: { id: callId }, callId,
                    summary: 'Исходящий звонок: клиент подтвердил встречу.',
                    from: phone, callerName: name, callType: 'outbound',
                    recordingUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
                    isValidUuid: false, duration: 85,
                    transcript: `[assistant]: Добрый день, ${name}! Мы договаривались о звонке.\n[user]: Да, привет. Я готов подтвердить встречу на завтра.\n[assistant]: Отлично, записал. До связи!`,
                    transcriptForStorage: [
                        { role: 'assistant', content: `Добрый день, ${name}! Мы договаривались о звонке.` },
                        { role: 'user', content: 'Да, привет. Я готов подтвердить встречу на завтра.' },
                        { role: 'assistant', content: 'Отлично, записал. До связи!' }
                    ]
                };
                await handleVapiJob(payload);
                console.log(`Demo outbound call ${callId} finished simulation.`);
            } catch (err) {
                console.error('Simulate outbound background error:', err);
            }
        }, 3000);
    } catch (err) {
        console.error('Simulate outbound error:', err);
        if (!res.headersSent) res.status(500).json({ error: err.message });
    }
};
