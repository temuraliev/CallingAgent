/**
 * Yandex SpeechKit v3 streaming TTS via REST.
 *
 * Endpoint: https://tts.api.cloud.yandex.net/tts/v3/utteranceSynthesis
 * Auth: Api-Key (header)
 * Response: NDJSON stream — each line is a JSON object whose
 *   result.audioChunk.data field contains base64-encoded raw PCM bytes.
 *
 * We picked REST over the gRPC SDK because the SDK exposes ts-proto
 * generated classes whose oneof / int64 / enum encoding rules differ
 * across versions, and we kept hitting "Received undefined" serialization
 * errors. REST takes plain JSON: enums as strings ("LINEAR16_PCM", "LUFS"),
 * int64 as strings ("16000"), no helper classes required.
 */

const ENDPOINT = 'https://tts.api.cloud.yandex.net/tts/v3/utteranceSynthesis';

/**
 * Server-streaming synthesis. Yields raw PCM16 mono chunks at the
 * requested sample rate as soon as Yandex emits them.
 */
export async function* synthesizeStream(text, { sampleRate = 16000 } = {}) {
  if (!text || !String(text).trim()) return;

  const apiKey = process.env.YANDEX_API_KEY;
  if (!apiKey) throw new Error('YANDEX_API_KEY is not set');

  const body = {
    text: String(text),
    outputAudioSpec: {
      rawAudio: {
        audioEncoding: 'LINEAR16_PCM',
        sampleRateHertz: String(sampleRate),
      },
    },
    hints: [
      { voice: process.env.YANDEX_VOICE || 'alena' },
      { role: process.env.YANDEX_ROLE || 'neutral' },
    ],
    loudnessNormalizationType: 'LUFS',
  };

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Api-Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Yandex TTS HTTP ${res.status}: ${errText.slice(0, 500)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const flushLine = function* (line) {
    const trimmed = line.trim();
    if (!trimmed) return;
    let obj;
    try {
      obj = JSON.parse(trimmed);
    } catch (e) {
      console.error('[yandex-tts] bad NDJSON line:', trimmed.slice(0, 200));
      return;
    }
    const data = obj?.result?.audioChunk?.data;
    if (data) {
      yield Buffer.from(data, 'base64');
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let nl;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      yield* flushLine(line);
    }
  }

  // Tail (last line without trailing newline)
  if (buffer.length > 0) yield* flushLine(buffer);
}

/** Collect the full PCM buffer (non-streaming convenience). */
export async function synthesize(text, opts) {
  const chunks = [];
  for await (const c of synthesizeStream(text, opts)) chunks.push(c);
  return Buffer.concat(chunks);
}
