# AGENTS.md

## Cursor Cloud specific instructions

### Overview

**Calling Agent** is a single-service Node.js Express app (ES modules, port 3000) that handles VAPI voice-call webhooks, classifies leads via OpenAI, stores call data as JSON files on disk, and optionally syncs to Amo CRM or Bitrix24. A vanilla HTML/CSS dashboard is served from `public/`.

### Running the app

- **Dev (auto-reload):** `npm run dev` — uses `node --watch`
- **Production:** `npm start`
- Dashboard: http://localhost:3000
- Health check: `GET /health`
- Calls API: `GET /api/calls?limit=N`

### Demo / testing without external services

- `npm run demo:seed` — writes a sample call JSON to `./calls/` (no server needed).
- `npm run demo:simulate` — POSTs a mock webhook to the running server. Requires `OPENAI_API_KEY` in `.env` for classification to succeed; the webhook still returns 200 without it but classification will error in the server logs.

### Environment config

Copy `.env.demo` to `.env` for a minimal setup. Only `OPENAI_API_KEY` is required for full webhook processing. All CRM variables and `VAPI_API_KEY` are optional (the app gracefully skips them).

### Caveats

- No test framework or lint tooling is configured in this project (no `test`, `lint`, or `typecheck` scripts in `package.json`).
- Call data is stored as flat JSON files under `./calls/YYYY-MM-DD/`. There is no database.
- The `--watch` flag in `npm run dev` monitors `src/` for changes; edits to `public/` are picked up on the next HTTP request (static files).
