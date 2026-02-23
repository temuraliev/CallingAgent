import OpenAI from 'openai';

function getOpenAI() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is required for lead classification');
  return new OpenAI({ apiKey: key });
}

const SYSTEM_PROMPT = `You are a sales lead classifier. Analyze the conversation transcript and summary, then classify the lead as cold, warm, or hot.

Definitions:
- COLD: No clear interest, wrong number, hang-up, or not a sales opportunity.
- WARM: Interested in the product/service, needs follow-up, asked questions, requested information.
- HOT: Ready to buy, requested demo/meeting, expressed urgency, ready to proceed.

Respond with valid JSON only, no other text:
{"temperature": "cold"|"warm"|"hot", "reason": "Brief explanation"}`;

/**
 * Classifies a lead based on transcript and summary.
 * @param {string} transcript - Full conversation transcript (or messages as text)
 * @param {string} summary - Conversation summary from VAPI
 * @returns {Promise<{temperature: 'cold'|'warm'|'hot', reason: string}>}
 */
export async function classifyLead(transcript, summary) {
  const openai = getOpenAI();
  const userContent = `Summary: ${summary || 'N/A'}\n\nTranscript:\n${transcript || 'No transcript available'}`;

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });

  const text = response.choices[0]?.message?.content?.trim();
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
