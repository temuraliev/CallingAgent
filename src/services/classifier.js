const SYSTEM_PROMPT = `You are a sales lead classifier. Analyze the conversation transcript and summary, then classify the lead as cold, warm, or hot.

Definitions:
- COLD: No clear interest, wrong number, hang-up, or not a sales opportunity.
- WARM: Interested in the product/service, needs follow-up, asked questions, requested information.
- HOT: Ready to buy, requested demo/meeting, expressed urgency, ready to proceed.

Respond with valid JSON only, no other text:
{"temperature": "cold"|"warm"|"hot", "reason": "Brief explanation"}`;

/**
 * Classifies a lead based on transcript and summary using Gemini API.
 * @param {string} transcript - Full conversation transcript (or messages as text)
 * @param {string} summary - Conversation summary from VAPI
 * @returns {Promise<{temperature: 'cold'|'warm'|'hot', reason: string}>}
 */
export async function classifyLead(transcript, summary) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is required for lead classification');

  const userContent = `Summary: ${summary || 'N/A'}\n\nTranscript:\n${transcript || 'No transcript available'}`;

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: userContent }] }],
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error('Empty classification response');

  const parsed = JSON.parse(text);
  const temp = (parsed.temperature || 'cold').toLowerCase();
  const valid = ['cold', 'warm', 'hot'];
  const temperature = valid.includes(temp) ? temp : 'cold';

  return {
    temperature,
    reason: parsed.reason || 'No reason provided',
  };
}
