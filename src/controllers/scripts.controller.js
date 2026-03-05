import * as storage from '../services/storage.js';

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
