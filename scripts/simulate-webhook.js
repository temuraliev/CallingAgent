/**
 * Simulates a VAPI end-of-call-report webhook for testing without a real call.
 * Run: npm run demo:simulate
 *
 * Requires: Server running (npm start) and OPENAI_API_KEY in .env
 */
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'http://localhost:3000/webhook/vapi';

const mockPayload = {
  message: {
    type: 'end-of-call-report',
    summary: 'Customer asked about pricing and requested a callback. They seemed interested but need to check with their team.',
    call: {
      id: `sim-${Date.now()}`,
      duration: 120,
      customer: { number: '+998901234567' },
      artifact: {
        messages: [
          { role: 'assistant', message: 'Hello! How can I help you today?' },
          { role: 'user', message: 'Hi, I saw your website. Can you tell me about your pricing?' },
          { role: 'assistant', message: 'Sure! Our plans start at $99/month. Would you like a demo?' },
          { role: 'user', message: 'Maybe. I need to check with my team first. Can someone call me back?' },
        ],
      },
    },
  },
};

async function main() {
  console.log('Sending mock webhook to', WEBHOOK_URL);
  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mockPayload),
  });
  console.log('Status:', res.status);
  if (res.status === 200) {
    console.log('Success! Check http://localhost:3000 for the new call.');
  } else {
    console.error('Response:', await res.text());
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
