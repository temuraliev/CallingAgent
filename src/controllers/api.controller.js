import { VapiClient } from '@vapi-ai/server-sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadSettings, saveSettings } from '../services/settings.js';
import { listCalls, getStats } from '../services/storage.js';

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

        const assistantId = process.env.VAPI_ASSISTANT_ID;
        const vapiKey = process.env.VAPI_API_KEY;

        if (vapiKey && assistantId && (saved.systemPrompt || saved.firstMessage)) {
            try {
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
        const callParams = {
            assistantId,
            phoneNumberId,
            customer,
        };

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
};

export const syncCall = async (req, res) => {
    console.log('--- Sync triggered ---', req.body);
    try {
        const { callId } = req.body || {};
        if (!callId) return res.status(400).json({ error: 'callId is required' });

        const { handleVapiJob } = await import('../services/queue.js');
        const vapi = process.env.VAPI_API_KEY ? new VapiClient({ token: process.env.VAPI_API_KEY }) : null;

        if (!vapi) throw new Error('VAPI_API_KEY not configured');

        // Fetch data once immediately and trigger processing
        const call = await vapi.calls.get(callId);
        const payload = {
            msg: { type: 'end-of-call-report', summary: call.summary || '' },
            call,
            callId: call.id,
            summary: call.summary || '',
            from: call.customer?.number || 'unknown',
            callerName: call.customer?.name || null,
            callType: call.direction || 'inbound',
            recordingUrl: call.artifact?.recordingUrl || '',
            isValidUuid: true,
            duration: call.duration || 0,
            transcript: '', // handleVapiJob will fetch it
            transcriptForStorage: []
        };

        console.log(`Syncing call ${callId} from Vapi...`);
        // We run it async but background-ish
        handleVapiJob(payload).then(() => {
            console.log(`Sync completed for ${callId}`);
        }).catch(err => {
            console.error(`Sync background error for ${callId}:`, err);
        });

        res.json({ success: true, message: 'Sync triggered' });
    } catch (err) {
        console.error('Sync call error:', err);
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
