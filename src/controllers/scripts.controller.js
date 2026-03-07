import * as storage from '../services/storage.js';
import { saveSettings, syncToVapi } from '../services/settings.js';

export const listScripts = async (req, res) => {
    try {
        const scripts = await storage.listScripts();
        res.json(scripts);
    } catch (err) {
        console.error('List scripts error:', err);
        res.status(500).json({ error: err.message });
    }
};

export const createScript = async (req, res) => {
    try {
        const { name, description, firstMessage, systemPrompt, isActive } = req.body;
        if (!name) return res.status(400).json({ error: 'Name is required' });

        const script = await storage.saveScript({
            name,
            description,
            firstMessage,
            systemPrompt,
            isActive
        });
        res.status(201).json(script);
    } catch (err) {
        console.error('Create script error:', err);
        res.status(500).json({ error: err.message });
    }
};

export const updateScript = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, firstMessage, systemPrompt, isActive } = req.body || {};
        const script = await storage.getScript(id);
        if (!script) return res.status(404).json({ error: 'Скрипт не найден' });

        const updated = await storage.updateScript(id, {
            name, description, firstMessage, systemPrompt, isActive
        });
        res.json(updated);
    } catch (err) {
        console.error('Update script error:', err);
        res.status(500).json({ error: err.message });
    }
};

export const deleteScript = async (req, res) => {
    try {
        const { id } = req.params;
        await storage.deleteScript(id);
        res.json({ success: true });
    } catch (err) {
        console.error('Delete script error:', err);
        res.status(500).json({ error: err.message });
    }
};

/** Apply script: copy systemPrompt + firstMessage to settings and sync to VAPI */
export const applyScript = async (req, res) => {
    try {
        const { id } = req.params;
        const script = await storage.getScript(id);
        if (!script) return res.status(404).json({ error: 'Скрипт не найден' });

        const saved = await saveSettings({
            systemPrompt: script.systemPrompt ?? '',
            firstMessage: script.firstMessage ?? '',
        });
        const result = await syncToVapi(saved);

        if (result._vapiError) {
            return res.status(200).json({
                ...result,
                message: 'Настройки сохранены, но синхронизация с VAPI не удалась',
                vapiError: result._vapiError,
            });
        }
        res.json({ ...result, message: 'Скрипт применён, настройки синхронизированы с VAPI' });
    } catch (err) {
        console.error('Apply script error:', err);
        res.status(500).json({ error: err.message });
    }
};
