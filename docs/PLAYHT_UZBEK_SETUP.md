# Play.ht Uzbek Setup for Tashkent Pilot

This guide walks you through configuring Play.ht voices for Uzbek (and Russian) in VAPI for the Tashkent pilot. Play.ht provides native Uzbek voices (Sardor, Madina) with direct VAPI integration—no custom code required.

## Prerequisites

- VAPI account ([dashboard.vapi.ai](https://dashboard.vapi.ai))
- Play.ht account ([play.ht](https://play.ht))
- Public HTTPS URL for your webhook (e.g. Railway, ngrok for local dev)

## 1. Create Play.ht Account

1. Sign up at [play.ht](https://play.ht)
2. Go to **API Access** or **Settings** to get:
   - **API User ID**
   - **Secret Key**

## 2. Add Play.ht to VAPI Provider Keys

1. Log in to [VAPI Dashboard](https://dashboard.vapi.ai)
2. Go to **Provider Keys** (or **Settings** → **Provider Keys**)
3. Add **Play.ht** credentials:
   - Paste your API User ID
   - Paste your Secret Key

## 3. Configure Assistant Voice

1. Go to **Assistants** → select your assistant (or create one)
2. Open the **Voice** section
3. Set:
   - **Provider:** Play.ht
   - **Voice:** Sardor (male) or Madina (female)
   - **Language:** Uzbek (`uz-UZ`) or leave for auto-detection

## 4. Configure Transcriber

For Uzbek speech-to-text:

1. In your assistant, go to **Transcriber**
2. Set:
   - **Provider:** Google
   - **Language:** `multilingual` (or Uzbek if available in the dropdown)

## 5. System Prompt (Uzbek Instructions)

Add Uzbek instructions to your assistant’s system prompt, for example:

```
Сиз ўзбек тилида сўзлайдиган савдо ёрдамчисисиз. Ўзбек ва рус тилларида жавоб беринг.
```

(Translation: You are a sales assistant who speaks Uzbek. Respond in Uzbek and Russian.)

## 6. First Message (Uzbek Greeting)

Set the assistant’s first message to an Uzbek greeting, for example:

```
Ассалому алейкум! Раҳмат, қоңғироқ қилганингиз учун.
```

(Translation: Peace be upon you! Thank you for calling.)

## 7. Environment Variables

No new environment variables are needed for Play.ht. Credentials are stored in the VAPI Dashboard.

## 8. Webhook

Ensure your webhook URL is set in the assistant:

- **Server URL:** `https://your-railway-url.up.railway.app/webhook/vapi`

The Calling Agent will receive `end-of-call-report` events and process transcripts in Uzbek/Russian.

## Summary

| Setting        | Value                          |
|----------------|--------------------------------|
| Voice provider | Play.ht                        |
| Voice          | Sardor or Madina               |
| Language       | Uzbek (`uz-UZ`)                |
| Transcriber    | Google, multilingual           |
| First message  | Uzbek greeting                 |

## Fallback

If Play.ht is unavailable, you can use Azure voices (e.g. `ru-RU-SvetlanaNeural`) as a fallback in the VAPI assistant’s fallback plan.
