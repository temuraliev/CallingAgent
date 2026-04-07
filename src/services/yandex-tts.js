import { serviceClients, Session } from '@yandex-cloud/nodejs-sdk';

let cachedClient = null;
function getClient() {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.YANDEX_API_KEY;
  if (!apiKey) throw new Error('YANDEX_API_KEY is not set');
  const session = new Session({ apiKey });
  cachedClient = session.client(serviceClients.SynthesizerClient);
  return cachedClient;
}

/**
 * Server-streaming synthesis via Yandex SpeechKit v3 (gRPC).
 * Yields raw PCM16 mono chunks at the requested sample rate.
 *
 * We pass a plain JS object to client.utteranceSynthesis instead of
 * UtteranceSynthesisRequest.fromPartial(...). The destructuring path
 * for the helper class differs across SDK versions and was undefined
 * in @yandex-cloud/nodejs-sdk on Railway. The gRPC stub serializes
 * by reading fields off the request, so a structurally-compatible
 * plain object works without depending on internal export layout.
 *
 * audioEncoding: 1 = LINEAR16_PCM
 * loudnessNormalizationType: 1 = LUFS
 */
export async function* synthesizeStream(text, { sampleRate = 16000 } = {}) {
  if (!text || !String(text).trim()) return;

  const client = getClient();

  const request = {
    text: String(text),
    outputAudioSpec: {
      rawAudio: {
        audioEncoding: 1,
        sampleRateHertz: sampleRate,
      },
    },
    hints: [
      { voice: process.env.YANDEX_VOICE || 'alena' },
      { role: process.env.YANDEX_ROLE || 'neutral' },
    ],
    loudnessNormalizationType: 1,
  };

  const stream = client.utteranceSynthesis(request);
  for await (const message of stream) {
    const data = message?.audioChunk?.data;
    if (data && data.length) yield Buffer.from(data);
  }
}

/** Collect the full PCM buffer (non-streaming convenience). */
export async function synthesize(text, opts) {
  const chunks = [];
  for await (const c of synthesizeStream(text, opts)) chunks.push(c);
  return Buffer.concat(chunks);
}
