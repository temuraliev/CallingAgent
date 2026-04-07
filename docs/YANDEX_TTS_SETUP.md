# Yandex SpeechKit TTS (Custom Voice for VAPI)

This integration plugs Yandex SpeechKit v3 (gRPC streaming) into VAPI as a
**custom voice provider**. VAPI calls our `/webhook/yandex-tts` endpoint with
text, the server streams synthesized PCM16 audio back from Yandex.

Voice: **alena**, language **ru-RU**.

## 1. Yandex Cloud setup

1. Create a service account in your Yandex Cloud folder.
2. Assign role **`ai.speechkit-tts.user`** to the service account.
3. Create an **API key** for the service account
   (Console → Service accounts → your account → "Create new key" → API key).
4. Copy the API key value (starts with `AQVN...`) and the **folder ID**.

## 2. Install dependency

```bash
npm install @yandex-cloud/nodejs-sdk
```

## 3. Configure env

Add to `.env`:

```
YANDEX_API_KEY=AQVN_xxx
YANDEX_FOLDER_ID=b1g_xxx
YANDEX_VOICE=alena
YANDEX_ROLE=neutral
```

Available roles for `alena`: `neutral`, `good`.

## 4. Endpoint

Implemented at `POST /webhook/yandex-tts`:

- **Request body** (sent by VAPI):
  ```json
  { "message": { "type": "voice-request", "text": "Привет!", "sampleRate": 16000 } }
  ```
- **Response:** `application/octet-stream`, raw PCM16 mono at the requested
  sample rate, streamed via chunked transfer-encoding as Yandex produces it.

Code:
- `src/services/yandex-tts.js` — gRPC streaming wrapper around
  `SynthesizerService.utteranceSynthesis`
- `src/controllers/tts.controller.js` — HTTP handler that pipes Yandex chunks
  into the response
- `src/routes/webhook.routes.js` — route registration

## 5. VAPI assistant configuration

In VAPI Dashboard → your assistant → **Voice**:

- **Provider:** `Custom Voice`
- **Server URL:** `https://your-domain/webhook/yandex-tts`
- **Sample rate:** `16000` (must match what the server returns)
- **Format:** `PCM`

If you deploy on Railway, the URL is
`https://your-app.up.railway.app/webhook/yandex-tts`.

For local testing use ngrok:

```bash
ngrok http 3000
# https://abc123.ngrok.io/webhook/yandex-tts
```

## 6. Quick local test

```bash
curl -X POST http://localhost:3000/webhook/yandex-tts \
  -H 'Content-Type: application/json' \
  -d '{"text":"Привет, это тест Яндекс синтеза","sampleRate":16000}' \
  --output test.pcm

# Play it (raw PCM16 mono 16k):
ffplay -f s16le -ar 16000 -ac 1 test.pcm
```

## 7. Notes / gotchas

- **Auth:** we use API key auth via the SDK's `Session({ apiKey })`. No IAM
  token refresh required.
- **Latency:** v3 streams chunks as they are generated, so first audio byte
  arrives in ~150–300 ms. This matters for live calls.
- **Formats:** if VAPI requests a sample rate other than 16000, we pass it
  through to Yandex (`8000` and `48000` are also supported).
- **Loudness:** we set `loudnessNormalizationType = LUFS` so volume is
  consistent across utterances.
- **Quotas:** SpeechKit TTS is billed per character; check your Yandex Cloud
  quota before going to production.
- **Schema drift:** VAPI's custom-voice payload has changed in the past.
  If audio stops working after a VAPI update, log `req.body` in
  `handleYandexTtsWebhook` and verify the field names against
  https://docs.vapi.ai/customization/custom-voices/custom-voice
