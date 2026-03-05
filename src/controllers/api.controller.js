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

export const getBenchmarkResults = (req, res) => {
    const resultsPath = join(ROOT, 'benchmark', 'results.json');
    try {
        const raw = readFileSync(resultsPath, 'utf8');
        res.json(JSON.parse(raw));
    } catch (err) {
        if (err.code === 'ENOENT') {
            return res.status(404).json({
                error: 'Результаты бенчмарка не найдены. Запустите: node scripts/evaluate.js'
            });
        }
        res.status(500).json({ error: err.message });
    }
};
