# Calling Agent

AI voice agent that answers inbound telephone calls, stores call data as JSON, classifies leads as cold/warm/hot using AI, and syncs them to Amo CRM or Bitrix24.

## Architecture

```
Caller → Twilio → VAPI (STT/LLM/TTS) → End-of-call webhook → This server
                                                              ├── Classify lead (Gemini)
                                                              ├── Save to JSON
                                                              └── Push to CRM (Amo or Bitrix24)
```

## Quick Start

### 1. Install

```bash
npm install
```

### 2. Configure

Copy `.env.example` to `.env` and fill in:

- `VAPI_API_KEY` – from [VAPI Dashboard](https://dashboard.vapi.ai)
- `GEMINI_API_KEY` – from [Google AI Studio](https://aistudio.google.com/apikey)
- `CRM_PROVIDER` – `amo` or `bitrix` (optional, omit to skip CRM sync)
- `AMO_*` or `BITRIX24_*` – CRM credentials per provider

### 3. Run

```bash
npm start
```

Open http://localhost:3000 for the **calls dashboard**.

For dev with auto-reload:

```bash
npm run dev
```

### 4. Expose Webhook (Local)

For local development, use [ngrok](https://ngrok.com):

```bash
ngrok http 3000
```

Set the webhook URL in your VAPI assistant: `https://YOUR_NGROK_URL/webhook/vapi`

**Lead classification webhook** (optional): If VAPI sends lead classification via a tool/function, use:
`https://YOUR_DOMAIN/webhook/lead-classification`
Payload: `{ name, phone, interestLevel, notes, interestedActivities, wantsCallback }`

### 5. Demo Commands

```bash
npm run demo:seed      # Add sample call for dashboard demo
npm run demo:simulate  # Simulate webhook (server must be running)
```

### 6. Configure VAPI

See [docs/VAPI_ASSISTANT_SETUP.md](docs/VAPI_ASSISTANT_SETUP.md) for full VAPI + Twilio setup.

**Founder demo:** See [DEMO_CHECKLIST.md](DEMO_CHECKLIST.md) and [docs/DEMO_SETUP.md](docs/DEMO_SETUP.md).

## CRM Setup

### Amo CRM (`CRM_PROVIDER=amo`)

1. Create a pipeline in Amo CRM (e.g. "Inbound Calls")
2. Add three stages: Cold, Warm, Hot
3. Get `pipeline_id` and each stage's `status_id` (via API or browser dev tools)
4. Add to `.env`: `AMO_PIPELINE_ID`, `AMO_STATUS_COLD`, `AMO_STATUS_WARM`, `AMO_STATUS_HOT`

For amocrm.com, set `AMO_DOMAIN=amocrm.com`.

### Bitrix24 (`CRM_PROVIDER=bitrix`)

1. Create an incoming webhook: Bitrix24 → Settings → Developer resources → Incoming webhook
2. Create a funnel with stages Cold, Warm, Hot (or use default funnel)
3. Get stage IDs via `crm.status.list` (filter `ENTITY_ID: "DEAL_STAGE_0"` for default funnel)
4. Add to `.env`:
   - `BITRIX24_DOMAIN` (e.g. `your-company.bitrix24.com`)
   - `BITRIX24_USER_ID`, `BITRIX24_WEBHOOK_CODE`
   - `BITRIX24_CATEGORY_ID` (funnel ID, 0 = default)
   - `BITRIX24_STAGE_COLD`, `BITRIX24_STAGE_WARM`, `BITRIX24_STAGE_HOT`

## Deployment

Deploy to any Node.js host with HTTPS:

### Railway

1. Connect your repo to [Railway](https://railway.app)
2. Add env vars from `.env.example`
3. Railway sets `PORT` automatically
4. Webhook URL: `https://your-app.up.railway.app/webhook/vapi`

### Render

1. Create a Web Service at [render.com](https://render.com)
2. Build: `npm install`; Start: `npm start`
3. Add env vars; Render sets `PORT`
4. Webhook URL: `https://your-app.onrender.com/webhook/vapi`

### Fly.io

```bash
fly launch
fly secrets set VAPI_API_KEY=... GEMINI_API_KEY=... # etc.
fly deploy
```

After deployment, update `server.url` in your VAPI assistant to your production webhook URL.

## Call Storage

Calls are saved to `./calls/YYYY-MM-DD/call-{id}.json`:

```json
{
  "callId": "abc123",
  "timestamp": "2025-02-23T12:00:00.000Z",
  "callerPhone": "+1234567890",
  "duration": 120,
  "transcript": [...],
  "summary": "Customer asked about pricing...",
  "leadTemperature": "warm",
  "classificationReason": "Asked for pricing info",
  "crmId": "12345",
  "crmProvider": "amo"
}
```

## Health Check

`GET /health` returns `{ "status": "ok" }` for load balancers and monitoring.

## License

MIT
