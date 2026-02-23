# VAPI Assistant and Twilio Setup

This guide walks you through configuring the VAPI voice assistant and connecting it to Twilio for inbound calls.

## Prerequisites

- VAPI account ([dashboard.vapi.ai](https://dashboard.vapi.ai))
- Twilio account ([twilio.com](https://twilio.com))
- OpenAI API key (for the assistant model)
- Public HTTPS URL for your webhook (use [ngrok](https://ngrok.com) for local dev)

## 1. Create VAPI Assistant

### Via Dashboard

1. Log in to [VAPI Dashboard](https://dashboard.vapi.ai)
2. Go to **Assistants** → **Create Assistant**
3. Configure:

| Setting | Value |
|---------|-------|
| **Name** | Sales Call Agent |
| **Model** | GPT-4 or GPT-4o (for lower latency) |
| **Voice** | ElevenLabs (e.g. "harry") for natural feel |
| **Transcriber** | Deepgram Nova-2 (default) |
| **First message** | "Hello! Thanks for calling. How can I help you today?" |

### Artifact Plan (Required)

Enable recording and transcript for the webhook to process calls:

```json
{
  "artifactPlan": {
    "recordingEnabled": true,
    "loggingEnabled": true,
    "transcriptPlan": {
      "enabled": true,
      "assistantName": "Assistant",
      "userName": "Customer"
    }
  }
}
```

### Server URL (Webhook)

Set your webhook URL so VAPI sends end-of-call reports:

- **Server URL:** `https://your-domain.com/webhook/vapi`
- **Server Messages:** Include `end-of-call-report`

For local development with ngrok:

```bash
ngrok http 3000
# Use the HTTPS URL: https://abc123.ngrok.io/webhook/vapi
```

### System Prompt (Optional)

Customize the assistant's behavior for sales calls:

```
You are a friendly sales assistant answering inbound calls. 
Greet the caller, listen to their needs, and provide helpful information.
Ask qualifying questions to understand their interest level.
Be concise and professional.
```

## 2. Twilio Setup

### Option A: VAPI Built-in Phone Numbers

VAPI can provision phone numbers directly. In the Dashboard:

1. Go to **Phone Numbers** → **Buy Number**
2. Select your country and number
3. Assign your assistant to the number

### Option B: Twilio SIP Trunk (Advanced)

For existing Twilio numbers or SIP trunking:

1. **Create Elastic SIP Trunk** in Twilio Console
2. **Whitelist VAPI IPs** in termination settings:
   - 44.238.177.138
   - 44.229.228.186
3. **Origination:** Add VAPI SIP URI: `sip:YOUR_PHONE_NUMBER@sip.vapi.ai`
4. **Register number with VAPI:** Use the API or Dashboard to link your Twilio number

See [VAPI Twilio docs](https://docs.vapi.ai/advanced/sip/twilio) for full steps.

## 3. Link Assistant to Phone Number

1. In VAPI Dashboard → **Phone Numbers**
2. Select your number
3. Set **Assistant** to your Sales Call Agent
4. Save

## 4. Verify Webhook

1. Start your server: `npm start`
2. Expose with ngrok: `ngrok http 3000`
3. Update VAPI assistant `server.url` to your ngrok URL
4. Make a test call to your number
5. Check `./calls/` for the JSON file and logs

## Troubleshooting

- **No transcript in webhook:** Ensure `artifactPlan.transcriptPlan.enabled` is true
- **404 on webhook:** Verify URL is HTTPS and publicly accessible
- **Amo CRM errors:** Check `AMO_*` env vars and pipeline/status IDs
