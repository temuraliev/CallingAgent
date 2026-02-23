/**
 * Seeds a sample call for demo purposes.
 * Run: npm run demo:seed
 */
import { saveCall } from '../src/services/storage.js';

const sampleCall = {
  callId: `demo-${Date.now()}`,
  timestamp: new Date().toISOString(),
  callerPhone: '+998901234567',
  duration: 95,
  transcript: [
    { role: 'assistant', message: 'Hello! Thanks for calling. How can I help you today?' },
    { role: 'user', message: 'Hi, I saw your ad and I\'m interested in your product.' },
    { role: 'assistant', message: 'Great! What would you like to know?' },
    { role: 'user', message: 'Can you tell me about pricing? And when can I get a demo?' },
    { role: 'assistant', message: 'Of course. Our basic plan starts at $99/month. I can schedule a demo for you this week.' },
    { role: 'user', message: 'Perfect, let\'s do it. I have time tomorrow afternoon.' },
  ],
  summary: 'Customer expressed interest in product, asked about pricing, and requested a demo for tomorrow afternoon.',
  leadTemperature: 'hot',
  classificationReason: 'Customer requested demo and expressed availability. Ready to proceed.',
  crmId: null,
  crmProvider: null,
};

const path = await saveCall(sampleCall);
console.log('Demo call seeded:', path);
console.log('View at http://localhost:3000');
