const SYSTEM_PROMPT = `Ты — классификатор лидов по продажам. Проанализируй транскрипт и резюме разговора, затем классифицируй лид как cold, warm или hot.

Определения:
- COLD: Нет явного интереса, неправильный номер, сброс звонка, нет перспективы продажи.
- WARM: Есть интерес к продукту/услуге, нужен повторный контакт, задавал вопросы, запрашивал информацию.
- HOT: Готов к покупке, запросил демо/встречу, выразил срочность, готов продолжить.

Отвечай строго JSON без другого текста. Поле reason пиши на русском языке:
{"temperature": "cold"|"warm"|"hot", "reason": "Краткое объяснение на русском"}`;

async function geminiRequest(apiKey, prompt, systemPrompt, jsonMode = true) {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2 },
  };
  if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };
  if (jsonMode) body.generationConfig.responseMimeType = 'application/json';

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
}

/**
 * Classifies a lead based on transcript and summary using Gemini API.
 * @param {string} transcript
 * @param {string} summary
 * @returns {Promise<{temperature: 'cold'|'warm'|'hot', reason: string}>}
 */
export async function classifyLead(transcript, summary) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is required for lead classification');

  const userContent = `Резюме: ${summary || 'Нет'}\n\nТранскрипт:\n${transcript || 'Транскрипт отсутствует'}`;
  const text = await geminiRequest(apiKey, userContent, SYSTEM_PROMPT, true);
  if (!text) throw new Error('Empty classification response');

  const parsed = JSON.parse(text);
  const temp = (parsed.temperature || 'cold').toLowerCase();
  const valid = ['cold', 'warm', 'hot'];
  const temperature = valid.includes(temp) ? temp : 'cold';

  return {
    temperature,
    reason: parsed.reason || 'Причина не указана',
  };
}

/**
 * Translates text to Russian using Gemini.
 * Returns original text if translation fails or text is already short/empty.
 * @param {string} text
 * @returns {Promise<string>}
 */
export async function translateToRussian(text) {
  if (!text || text.trim().length < 5) return text;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return text;

  try {
    const result = await geminiRequest(
      apiKey,
      `Переведи следующий текст на русский язык. Верни только перевод, без пояснений:\n\n${text}`,
      null,
      false,
    );
    return result || text;
  } catch {
    return text;
  }
}
