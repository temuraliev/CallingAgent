# Bitrix24 CRM Setup

This guide explains how to configure the Calling Agent to sync leads to Bitrix24.

## Prerequisites

- Bitrix24 account (cloud or on-premise)
- Admin or developer access to create webhooks

## 1. Create Incoming Webhook

1. Log in to your Bitrix24 portal
2. Go to **Settings** (gear icon) → **Developer resources** → **Incoming webhook**
3. Click **Add webhook**
4. Select permissions: **CRM** (read/write for contacts and deals)
5. Copy the webhook URL. It looks like:
   ```
   https://your-domain.bitrix24.com/rest/1/abc123xyz/crm.deal.add.json
   ```
6. Extract:
   - **Domain**: `your-domain.bitrix24.com`
   - **User ID**: `1` (the number after `/rest/`)
   - **Webhook code**: `abc123xyz` (the alphanumeric string before the method)

## 2. Create Sales Funnel with Cold/Warm/Hot Stages

1. Go to **CRM** → **Deals** → **Kanban**
2. Create a new funnel (or use the default) named e.g. "Inbound Calls"
3. Add three stages: **Cold**, **Warm**, **Hot**
4. Note the funnel ID (Category ID) and stage IDs

### Getting Stage IDs

Use the Bitrix24 REST API or browser dev tools:

```bash
# Replace with your webhook URL (without the method)
curl "https://your-domain.bitrix24.com/rest/1/YOUR_WEBHOOK/crm.status.list.json" \
  -d "filter[ENTITY_ID]=DEAL_STAGE_0"
```

For custom funnel (e.g. category 1), use `DEAL_STAGE_1`. The response lists stage IDs like `C1:NEW`, `C1:COLD`, etc.

## 3. Configure .env

Add to your `.env`:

```
CRM_PROVIDER=bitrix
BITRIX24_DOMAIN=your-domain.bitrix24.com
BITRIX24_USER_ID=1
BITRIX24_WEBHOOK_CODE=your_webhook_code
BITRIX24_CATEGORY_ID=0
BITRIX24_STAGE_COLD=C1:COLD
BITRIX24_STAGE_WARM=C1:WARM
BITRIX24_STAGE_HOT=C1:HOT
```

- `BITRIX24_CATEGORY_ID=0` for the default funnel
- Stage IDs depend on your funnel. Common formats: `NEW`, `PREPARATION`, or `C1:COLD` for custom funnel 1

## 4. Verify

1. Start the server: `npm start`
2. Make a test call via your VAPI number
3. Check Bitrix24 **CRM** → **Deals** for a new deal with the correct stage
4. The deal will have an associated contact with the caller's phone number

## Troubleshooting

- **401 / NO_AUTH_FOUND**: Check webhook code and user ID
- **403 / insufficient_scope**: Ensure webhook has CRM permissions
- **Invalid STAGE_ID**: Verify stage IDs match your funnel via `crm.status.list`
