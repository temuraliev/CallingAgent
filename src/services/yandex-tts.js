import { serviceClients, Session, cloudApi } from '@yandex-cloud/nodejs-sdk';

const {
  ai: {
    tts_service: { UtteranceSynthesisRequest },
    tts: { AudioFormatOptions, RawAudio, Hints },
  },
} = cloudApi;

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
 */
export async function* synthesizeStream(text, { sampleRate = 16000 } = {}) {
  if (!text || !String(text).trim()) return;

  const client = getClient();
  const request = UtteranceSynthesisRequest.fromPartial({
    text: String(text),
    outputAudioSpec: AudioFormatOptions.fromPartial({
      rawAudio: RawAudio.fromPartial({
        audioEncoding: 1, // LINEAR16_PCM
        sampleRateHertz: sampleRate,
      }),
    }),
    hints: [
      Hints.fromPartial({ voice: process.env.YANDEX_VOICE || 'alena' }),
      Hints.fromPartial({ role: process.env.YANDEX_ROLE || 'neutral' }),
    ],
    loudnessNormalizationType: 1, // LUFS
  });

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
