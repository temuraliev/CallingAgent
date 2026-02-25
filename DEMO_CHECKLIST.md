# Founder Demo Checklist

Use this before your demo call with founders.

## Pre-Demo (Do 1–2 Days Before)

### Accounts & Credits

- [ ] **VAPI** – Sign up at [dashboard.vapi.ai](https://dashboard.vapi.ai), confirm $10 free credits
- [ ] **Gemini** – API key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) (free)
- [ ] **Railway** – Sign up at [railway.app](https://railway.app), use $5 trial

### Local Test

- [ ] `npm install && npm start`
- [ ] Open http://localhost:3000 – dashboard loads
- [ ] `npm run demo:seed` – sample call appears on dashboard
- [ ] `npm run demo:simulate` – new call appears (requires OPENAI_API_KEY)

### VAPI Setup

- [ ] Create assistant in VAPI Dashboard (GPT-4o-mini, ElevenLabs voice)
- [ ] Enable `artifactPlan` (transcript, recording)
- [ ] Add free US phone number (VAPI → Phone Numbers)
- [ ] Set webhook URL (see below)

### Deploy to Railway

- [ ] Push repo to GitHub
- [ ] Railway → New Project → Deploy from GitHub
- [ ] Add env vars: `VAPI_API_KEY`, `GEMINI_API_KEY`, `VAPI_PUBLIC_API_KEY`, `VAPI_ASSISTANT_ID`, `PORT` (auto)
- [ ] Deploy, copy URL (e.g. `https://xxx.up.railway.app`)
- [ ] Webhook URL: `https://xxx.up.railway.app/webhook/vapi`
- [ ] Set this in VAPI assistant → Server URL

### Test End-to-End

- [ ] **Web call:** Open `https://YOUR_RAILWAY_URL/call.html` → click call button → talk → hang up
- [ ] **Or phone:** Call your VAPI number
- [ ] Have a short conversation (30–60 sec)
- [ ] Hang up
- [ ] Check dashboard – new call with transcript and classification
- [ ] Check `./calls/` – JSON file created (local only; Railway filesystem is ephemeral)

## Demo Day (5–10 min flow)

1. **Intro** (1 min) – “AI answers calls, classifies leads as cold/warm/hot, stores everything in JSON, syncs to CRM.”
2. **Live call** (2 min) – Dial the number, talk to the AI.
3. **Dashboard** (2 min) – Open `/`, show the new call, expand transcript, show classification.
4. **JSON** (1 min) – Show `calls/YYYY-MM-DD/call-xxx.json` if helpful.
5. **CRM** (optional) – If Amo/Bitrix24 is configured, show the lead/deal.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| No call on dashboard | Check VAPI webhook URL is correct and HTTPS |
| 500 on webhook | Check server logs, ensure OPENAI_API_KEY is set |
| No transcript | Ensure `artifactPlan.transcriptPlan.enabled` in VAPI assistant |
| Railway sleep | Free tier sleeps after inactivity; first request may be slow |
