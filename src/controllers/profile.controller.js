import * as storage from '../services/storage.js';

export const getProfile = async (req, res) => {
    try {
        const profile = await storage.getBusinessProfile();
        res.json(profile || { isSubmitted: false, answers: {} });
    } catch (err) {
        console.error('Get profile error:', err);
        res.status(500).json({ error: err.message });
    }
};

export const submitProfile = async (req, res) => {
    try {
        const existing = await storage.getBusinessProfile();
        if (existing && existing.isSubmitted) {
            return res.status(400).json({ error: 'Анкета уже заполнена. Используйте дополнение.' });
        }
        const profile = await storage.saveBusinessProfile({
            answers: req.body.answers || {},
        });
        res.status(201).json(profile);
    } catch (err) {
        console.error('Submit profile error:', err);
        res.status(500).json({ error: err.message });
    }
};

export const addProfileNote = async (req, res) => {
    try {
        const { questionKey, note } = req.body;
        if (!questionKey || !note) {
            return res.status(400).json({ error: 'questionKey and note are required' });
        }
        const profile = await storage.appendBusinessProfileNote(questionKey, note);
        if (!profile) {
            return res.status(404).json({ error: 'Профиль не найден. Сначала заполните анкету.' });
        }
        res.json(profile);
    } catch (err) {
        console.error('Add profile note error:', err);
        res.status(500).json({ error: err.message });
    }
};
