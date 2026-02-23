# Demo Setup – 15 Minutes

Get the Calling Agent running for a founder demo.

## 1. Clone & Install (2 min)

```bash
cd "f:\PROG\Calling Agent"
npm install
```

## 2. Configure (3 min)

Copy `.env.demo` to `.env` (or copy `.env.example` and fill minimal vars):

```bash
# Windows (PowerShell)
copy .env.demo .env

# Mac/Linux
cp .env.demo .env
```

Edit `.env` and add:

- `VAPI_API_KEY` – from [VAPI Dashboard](https://dashboard.vapi.ai) → Settings → API Keys
- `OPENAI_API_KEY` – from [OpenAI](https://platform.openai.com/api-keys)

Leave `CRM_PROVIDER` unset for demo (JSON-only, no CRM).

## 3. Run Locally (1 min)

```bash
npm start
```

Open http://localhost:3000 – you should see the dashboard.

## 4. Seed Demo Data (30 sec)

```bash
npm run demo:seed
```

Refresh the dashboard – a sample call appears.

## 5. Test Webhook (Optional, 1 min)

With the server running:

```bash
npm run demo:simulate
```

A new call is created via the webhook (uses OpenAI for classification).

## 6. VAPI Setup (5 min)

1. Go to [VAPI Dashboard](https://dashboard.vapi.ai)
2. **Assistants** → Create Assistant:
   - Model: GPT-4o-mini
   - Voice: ElevenLabs (e.g. Harry)
   - First message: "Hello! Thanks for calling. How can I help you?"
   - **Artifact Plan**: Enable transcript, recording
3. **Phone Numbers** → Add Number → Get a free US number
4. Link assistant to the number
5. **Server URL**: For local dev, use ngrok:

```bash
ngrok http 3000
```

Set webhook: `https://YOUR_NGROK_URL/webhook/vapi`

## 7. Deploy to Railway (3 min)

1. Push to GitHub
2. [Railway](https://railway.app) → New Project → Deploy from GitHub
3. Select repo, deploy
4. **Variables** → Add:
   - `VAPI_API_KEY`
   - `OPENAI_API_KEY`
5. Copy the public URL (e.g. `https://calling-agent.up.railway.app`)
6. In VAPI assistant, set Server URL: `https://YOUR_RAILWAY_URL/webhook/vapi`

## 8. Test Call

Call your VAPI number. Talk for 30–60 seconds. Hang up. Check the dashboard – the call should appear with transcript and lead classification.

## Free Tier Summary

| Service | Free Tier |
|---------|-----------|
| VAPI | $10 credits (~200 min) |
| VAPI Phone | 10 free US numbers |
| OpenAI | Pay-as-you-go (~$0.001/call) |
| Railway | $5 trial + $1/mo credit |
| ngrok | 20k requests/mo |
