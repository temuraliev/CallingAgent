/**
 * Bitrix24 REST API client for creating and updating deals.
 * Supports cold/warm/hot lead stages via configurable STAGE_ID mapping.
 */

const STAGE_MAP = {
  cold: process.env.BITRIX24_STAGE_COLD,
  warm: process.env.BITRIX24_STAGE_WARM,
  hot: process.env.BITRIX24_STAGE_HOT,
};

function getBaseUrl() {
  const domain = process.env.BITRIX24_DOMAIN;
  const userId = process.env.BITRIX24_USER_ID || '1';
  const webhook = process.env.BITRIX24_WEBHOOK_CODE;
  if (!domain || !webhook) throw new Error('BITRIX24_DOMAIN and BITRIX24_WEBHOOK_CODE are required');
  return `https://${domain}/rest/${userId}/${webhook}`;
}

/**
 * Calls a Bitrix24 REST API method.
 * @param {string} method - API method (e.g. crm.deal.add)
 * @param {Object} params - Method parameters
 * @returns {Promise<Object>}
 */
async function bitrixRequest(method, params = {}) {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/${method}.json`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const data = await res.json().catch(() => ({}));

  if (data.error) {
    throw new Error(`Bitrix24 API error: ${data.error_description || data.error}`);
  }

  return data;
}

/**
 * Creates a contact with phone number, returns contact ID.
 * @param {string} phone - Phone number
 * @param {string} [name] - Contact name
 * @returns {Promise<number>}
 */
async function createContact(phone, name = 'Unknown') {
  const result = await bitrixRequest('crm.contact.add', {
    fields: {
      NAME: name,
      PHONE: [{ VALUE: phone, VALUE_TYPE: 'WORK' }],
    },
  });
  return result.result;
}

/**
 * Creates a deal in Bitrix24 with the given temperature (cold/warm/hot).
 * @param {Object} params
 * @param {string} params.phone - Caller phone number
 * @param {string} [params.name] - Contact/lead name
 * @param {'cold'|'warm'|'hot'} params.temperature - Lead temperature
 * @param {string} [params.summary] - Call summary for comments
 * @param {Object} [params.customFields] - Additional custom fields
 * @returns {Promise<{dealId: number}>}
 */
export async function createDeal({ phone, name, temperature, summary = '', customFields = {} }) {
  const categoryId = process.env.BITRIX24_CATEGORY_ID || '0';
  const stageId = STAGE_MAP[temperature] || STAGE_MAP.cold;

  if (!stageId) throw new Error(`BITRIX24_STAGE_${temperature.toUpperCase()} is required`);

  const title = name ? `Call from ${name}` : `Call from ${phone}`;

  let contactIds = [];
  try {
    const contactId = await createContact(phone || 'unknown', name || 'Unknown');
    contactIds = [contactId];
  } catch (err) {
    console.warn('Bitrix24: Could not create contact, deal will be created without contact:', err.message);
  }

  const fields = {
    TITLE: title,
    CATEGORY_ID: parseInt(categoryId, 10),
    STAGE_ID: stageId,
    SOURCE_ID: 'CALL',
    SOURCE_DESCRIPTION: 'AI voice agent',
    COMMENTS: summary ? `[B]Call summary:[/B]\n${summary}` : '',
    CONTACT_IDS: contactIds,
    OPPORTUNITY: 0,
    ...customFields,
  };

  const result = await bitrixRequest('crm.deal.add', { fields });
  const dealId = result.result;
  if (!dealId) throw new Error('Failed to create deal: no ID returned');

  return { dealId };
}

/**
 * Updates an existing deal's stage (temperature).
 * @param {number} dealId - Bitrix24 deal ID
 * @param {'cold'|'warm'|'hot'} temperature - New temperature
 */
export async function updateDealStage(dealId, temperature) {
  const stageId = STAGE_MAP[temperature] || STAGE_MAP.cold;
  if (!stageId) throw new Error(`BITRIX24_STAGE_${temperature.toUpperCase()} is required`);

  await bitrixRequest('crm.deal.update', {
    id: parseInt(dealId, 10),
    fields: { STAGE_ID: stageId },
  });
}
