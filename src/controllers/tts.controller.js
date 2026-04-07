import { synthesizeStream } from '../services/yandex-tts.js';

/**
 * VAPI custom-voice webhook handler.
 * VAPI POSTs JSON with { message: { type: "voice-request", text, sampleRate } }
 * (or text/sampleRate at the top level, depending on VAPI version).
 * We respond with raw PCM16 mono audio at the requested sample rate,
 * streamed via chunked transfer-encoding as it arrives from Yandex.
 */
export const handleYandexTtsWebhook = async (req, res) => {
  const body = req.body || {};
  const msg = body.message || body;
  const text = msg.text || msg.message?.text || body.text;
  const sampleRate = Number(msg.sampleRate || body.sampleRate || 16000);

  if (!text) {
    res.status(400).json({ error: 'text is required' });
    return;
  }

  console.log(`[yandex-tts] synth len=${text.length} sr=${sampleRate}`);

  res.status(200);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Transfer-Encoding', 'chunked');

  try {
    for await (const chunk of synthesizeStream(text, { sampleRate })) {
      if (!res.write(chunk)) await new Promise((r) => res.once('drain', r));
    }
    res.end();
  } catch (err) {
    console.error('[yandex-tts] synthesis failed:', err);
    if (!res.headersSent) res.status(500).json({ error: 'tts_failed' });
    else res.destroy(err);
  }
};
