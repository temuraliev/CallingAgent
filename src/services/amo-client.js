/**
 * Amo CRM API client for creating and updating leads.
 * Supports both amocrm.ru and amocrm.com via configurable subdomain.
 */

const STATUS_MAP = {
  cold: process.env.AMO_STATUS_COLD,
  warm: process.env.AMO_STATUS_WARM,
  hot: process.env.AMO_STATUS_HOT,
};

function getBaseUrl() {
  const subdomain = process.env.AMO_SUBDOMAIN;
  const domain = process.env.AMO_DOMAIN || 'amocrm.ru';
  if (!subdomain) throw new Error('AMO_SUBDOMAIN is required');
  return `https://${subdomain}.${domain}`;
}

/**
 * Gets a valid access token (refreshes if needed).
 * @returns {Promise<string>}
 */
async function getAccessToken() {
  const token = process.env.AMO_ACCESS_TOKEN;
  const refreshToken = process.env.AMO_REFRESH_TOKEN;
  const clientId = process.env.AMO_CLIENT_ID;
  const clientSecret = process.env.AMO_CLIENT_SECRET;

  if (!token) throw new Error('AMO_ACCESS_TOKEN is required');

  // If no refresh flow configured, use token as-is
  if (!refreshToken || !clientId || !clientSecret) {
    return token;
  }

  // TODO: Implement token refresh when token expires
  // For now, assume token is valid
  return token;
}

/**
 * Makes an authenticated request to Amo CRM API.
 * @param {string} method - HTTP method
 * @param {string} path - API path (e.g. /api/v4/leads)
 * @param {Object} [body] - Request body
 * @returns {Promise<Object>}
 */
async function amoRequest(method, path, body) {
  const baseUrl = getBaseUrl();
  const token = await getAccessToken();
  const url = `${baseUrl}${path}`;

  const options = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
  if (body && (method === 'POST' || method === 'PATCH')) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(`Amo CRM API error ${res.status}: ${JSON.stringify(data)}`);
  }

  return data;
}

/**
 * Creates a lead in Amo CRM with the given temperature (cold/warm/hot).
 * @param {Object} params
 * @param {string} params.phone - Caller phone number
 * @param {string} [params.name] - Contact/lead name (callerName)
 * @param {'cold'|'warm'|'hot'} params.temperature - Lead temperature
 * @param {number} [params.duration] - Call duration in seconds
 * @param {string} [params.recordingUrl] - Recording URL
 * @param {string} [params.summary] - Call summary
 * @param {Object} [params.customFields] - Additional custom fields
 * @returns {Promise<{leadId: number}>}
 */
export async function createLead({ phone, name, temperature, duration, recordingUrl, summary, customFields = {} }) {
  const pipelineId = process.env.AMO_PIPELINE_ID;
  const statusId = STATUS_MAP[temperature] || STATUS_MAP.cold;

  if (!pipelineId) throw new Error('AMO_PIPELINE_ID is required');
  if (!statusId) throw new Error(`AMO_STATUS_${temperature.toUpperCase()} is required`);

  const leadName = name ? `${name} (${phone})` : `Call from ${phone}`;

  const payload = {
    name: leadName,
    pipeline_id: parseInt(pipelineId, 10),
    status_id: parseInt(statusId, 10),
    price: 0,
    ...customFields,
  };

  const data = await amoRequest('POST', '/api/v4/leads', [payload]);
  const leadId = data._embedded?.leads?.[0]?.id;
  if (!leadId) throw new Error('Failed to create lead: no ID returned');

  // Add note with duration, recording URL, summary if available
  const noteParts = [];
  if (typeof duration === 'number' && duration >= 0) noteParts.push(`Duration: ${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}`);
  if (recordingUrl) noteParts.push(`Recording: ${recordingUrl}`);
  if (summary) noteParts.push(`Summary: ${summary}`);
  if (noteParts.length > 0) {
    try {
      await amoRequest('POST', '/api/v4/leads/notes', [
        { entity_id: leadId, note_type: 'common', params: { text: noteParts.join('\n') } },
      ]);
    } catch (err) {
      console.warn('Amo CRM: Could not add note to lead:', err.message);
    }
  }

  return { leadId };
}

/**
 * Updates an existing lead's status (temperature).
 * @param {number} leadId - Amo CRM lead ID
 * @param {'cold'|'warm'|'hot'} temperature - New temperature
 */
export async function updateLeadStatus(leadId, temperature) {
  const pipelineId = process.env.AMO_PIPELINE_ID;
  const statusId = STATUS_MAP[temperature] || STATUS_MAP.cold;

  if (!pipelineId || !statusId) {
    throw new Error('AMO_PIPELINE_ID and status IDs are required');
  }

  await amoRequest('PATCH', '/api/v4/leads', [
    {
      id: parseInt(leadId, 10),
      pipeline_id: parseInt(pipelineId, 10),
      status_id: parseInt(statusId, 10),
    },
  ]);
}
