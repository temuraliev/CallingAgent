import { GoogleGenAI, Type } from '@google/genai';

const SYSTEM_PROMPT = `Ты — логичный классификатор лидов по продажам. Проанализируй транскрипт и резюме разговора, затем классифицируй лид как cold, warm или hot.

Определения:
- COLD: Нет явного интереса, неправильный номер, сброс звонка, нет перспективы продажи, нецелевой.
- WARM: Есть интерес к продукту/услуге, нужен повторный контакт, задавал вопросы, запросил какую-то информацию, просил перезвонить.
- HOT: Готов к покупке, запросил демо/встречу, выразил срочность, готов продолжить прямо сейчас.

Обязательно объясни причину решения на русском языке.`;

/**
 * Classifies a lead based on transcript and summary using Gemini API.
 * @param {string} transcript
 * @param {string} summary
 * @returns {Promise<{temperature: 'cold'|'warm'|'hot', reason: string}>}
 */
export async function classifyLead(transcript, summary) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is required for lead classification');

  const ai = new GoogleGenAI({ apiKey });
  const modelStr = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const userContent = `Резюме: ${summary || 'Нет'}\n\nТранскрипт:\n${transcript || 'Транскрипт отсутствует'}`;

  try {
    const response = await ai.models.generateContent({
      model: modelStr,
      contents: userContent,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            temperature: {
              type: Type.STRING,
              description: "Lead temperature: cold, warm, or hot",
              enum: ["cold", "warm", "hot"]
            },
            reason: {
              type: Type.STRING,
              description: "Краткое объяснение классификации на русском языке"
            }
          },
          required: ["temperature", "reason"]
        }
      }
    });

    const raw = typeof response.text === 'function' ? response.text() : response.text;
    const result = JSON.parse(raw);
    return {
      temperature: result.temperature || 'cold',
      reason: result.reason || 'Причина не указана'
    };
  } catch (err) {
    console.error('Gemini Classification Error:', err);
    throw new Error('Failed to classify lead properly.');
  }
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
    const ai = new GoogleGenAI({ apiKey });
    const modelStr = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

    const response = await ai.models.generateContent({
      model: modelStr,
      contents: `Переведи следующий текст на русский язык. Верни только точный перевод, без дополнительных пояснений:\n\n${text}`,
      config: { temperature: 0.2 }
    });
    const txt = typeof response.text === 'function' ? response.text() : response.text;
    return (txt || '').trim() || text;
  } catch (err) {
    console.error('Gemini Translation Error:', err);
    return text;
  }
}
