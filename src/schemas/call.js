/**
 * Call/lead JSON schema for stored call data.
 * @typedef {Object} StoredCall
 * @property {string} callId - VAPI call ID
 * @property {string} timestamp - ISO8601 timestamp
 * @property {'inbound'|'outbound'} callType - Call direction
 * @property {string} callerPhone - Caller's phone number
 * @property {string} [callerName] - Caller's name if available
 * @property {number} duration - Call duration in seconds
 * @property {string} [recordingUrl] - URL to call recording
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
    callType: 'inbound',
    callerPhone: '',
    callerName: '',
    duration: 0,
    recordingUrl: null,
    transcript: [],
    summary: '',
    leadTemperature: 'cold',
    classificationReason: '',
    crmId: null,
    crmProvider: null,
    ...overrides,
  };
}
