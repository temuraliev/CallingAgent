/**
 * Call/lead JSON schema for stored call data.
 * @typedef {Object} StoredCall
 * @property {string} callId - VAPI call ID
 * @property {string} timestamp - ISO8601 timestamp
 * @property {string} callerPhone - Caller's phone number
 * @property {number} duration - Call duration in seconds
 * @property {Array<{role: string, message: string, time?: number}>} transcript - Conversation transcript
 * @property {string} summary - Conversation summary from VAPI
 * @property {'cold'|'warm'|'hot'} leadTemperature - AI-classified lead temperature
 * @property {string} classificationReason - Reason for the classification
 * @property {string|null} crmId - CRM entity ID (lead/deal) if synced
 * @property {string|null} [crmProvider] - 'amo' | 'bitrix'
 * @property {string|null} [amoLeadId] - Deprecated, use crmId
 */

/**
 * Creates an empty stored call object with defaults.
 * @param {Object} overrides - Fields to override
 * @returns {Object}
 */
export function createStoredCall(overrides = {}) {
  return {
    callId: '',
    timestamp: new Date().toISOString(),
    callerPhone: '',
    duration: 0,
    transcript: [],
    summary: '',
    leadTemperature: 'cold',
    classificationReason: '',
    crmId: null,
    crmProvider: null,
    ...overrides,
  };
}
