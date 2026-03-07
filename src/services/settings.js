import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { settings } from '../db/schema.js';

const DEFAULTS = {
  systemPrompt: `# Роль
Ты — AI-ассистент компании Push30, корпоративного фитнес-агрегатора в Узбекистане. Тебя зовут Александр. Ты профессиональный, энергичный и вежливый. Твоя цель — кратко рассказать о сервисе, квалифицировать лида и договориться о звонке или встрече с живым менеджером.

# О компании
- **Продукт:** Push30 — единый корпоративный абонемент, дающий доступ к 200+ спортзалам, бассейнам и студиям по всему Узбекистану.
- **Целевая аудитория:** HR-менеджеры, руководители, владельцы бизнеса, которые хотят предоставить сотрудникам фитнес-бенефит.
- **Преимущества:**
  1. Разнообразие: сотрудники сами выбирают, где тренироваться.
  2. Экономия: дешевле, чем покупать абонементы по отдельности.
  3. Удобство: один договор, один счёт для компании.
  4. Лояльность: повышает вовлечённость и продуктивность сотрудников.

# Сценарий разговора

1. **Приветствие:**
   - Поздоровайся, представься, спроси удобно ли говорить.

2. **Квалификация:**
   - Спроси, сколько сотрудников в компании.
   - Если меньше 5 — вежливо объясни, что работаете с командами от 5 человек, и попрощайся.

3. **Презентация:**
   - Кратко расскажи суть: один абонемент — все залы города.
   - Не вдавайся в детали цен — скажи, что это зависит от размера команды.

4. **Закрытие:**
   - Предложи связать с менеджером прямо сейчас или назначить звонок.
   - Если просят отправить информацию — согласись, но попробуй также назначить звонок.

# Правила
- Говори на русском языке. Если клиент переходит на узбекский — переключись.
- Будь кратким. Не перегружай информацией.
- НЕ называй конкретные цены. Скажи, что менеджер рассчитает индивидуально.
- НЕ спорь. Если клиент не заинтересован — вежливо попрощайся.
- НЕ спрашивай номер телефона — он уже известен из звонка.`,

  firstMessage: 'Алло, здравствуйте! Это Александр, ассистент компании Push30. Звоню по поводу корпоративного фитнеса для ваших сотрудников. Вам удобно сейчас говорить?',
};

const SETTINGS_KEY = 'app_settings';

export async function loadSettings() {
  try {
    const result = await db.select().from(settings).where(eq(settings.key, SETTINGS_KEY));
    if (result.length === 0) return { ...DEFAULTS };
    return { ...DEFAULTS, ...(result[0].value || {}) };
  } catch (err) {
    console.error('Failed to load settings from DB:', err.message);
    return { ...DEFAULTS };
  }
}

export async function saveSettings(updates) {
  const current = await loadSettings();
  const merged = { ...current, ...updates };

  try {
    const existing = await db.select().from(settings).where(eq(settings.key, SETTINGS_KEY));
    if (existing.length === 0) {
      await db.insert(settings).values({ key: SETTINGS_KEY, value: merged });
    } else {
      await db.update(settings).set({ value: merged, updatedAt: new Date() }).where(eq(settings.key, SETTINGS_KEY));
    }
  } catch (err) {
    console.error('Failed to save settings to DB:', err.message);
    throw err;
  }

  return merged;
}

/** Sync current settings to VAPI assistant (firstMessage + system prompt). Returns settings with _vapiSynced or _vapiError. */
export async function syncToVapi(settingsObj) {
  const assistantId = process.env.VAPI_ASSISTANT_ID;
  const vapiKey = process.env.VAPI_API_KEY;
  if (!vapiKey || !assistantId || (!settingsObj.systemPrompt && !settingsObj.firstMessage)) {
    return settingsObj;
  }
  try {
    const getRes = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
      headers: { Authorization: `Bearer ${vapiKey}` },
    });
    if (!getRes.ok) throw new Error(`GET assistant failed: ${getRes.status}`);
    const current = await getRes.json();

    const patch = {};
    if (settingsObj.firstMessage) patch.firstMessage = settingsObj.firstMessage;
    if (settingsObj.systemPrompt && current.model) {
      patch.model = {
        provider: current.model.provider,
        model: current.model.model,
        messages: [{ role: 'system', content: settingsObj.systemPrompt }],
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

    return { ...settingsObj, _vapiSynced: true };
  } catch (err) {
    console.error('Failed to sync settings to VAPI:', err.message);
    return { ...settingsObj, _vapiError: err.message };
  }
}
