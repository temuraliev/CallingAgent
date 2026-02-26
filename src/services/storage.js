import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CALLS_DIR = path.resolve(process.cwd(), 'calls');

/**
 * Ensures the calls directory exists for the given date.
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @returns {Promise<string>} Full path to the date directory
 */
async function ensureCallsDir(dateStr) {
  const dir = path.join(CALLS_DIR, dateStr);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Saves call data to JSON file.
 * @param {Object} callData - Call data matching StoredCall schema
 * @returns {Promise<string>} Path to saved file
 */
export async function saveCall(callData) {
  const dateStr = new Date().toISOString().slice(0, 10);
  const dir = await ensureCallsDir(dateStr);
  const filename = `call-${callData.callId || Date.now()}.json`;
  const filepath = path.join(dir, filename);
  await fs.writeFile(filepath, JSON.stringify(callData, null, 2), 'utf-8');
  return filepath;
}

/**
 * Updates an existing call file (e.g. after Amo CRM sync).
 * @param {string} callId - Call ID
 * @param {Object} updates - Partial updates to merge
 * @param {string} [dateStr] - Optional date (YYYY-MM-DD); defaults to today
 */
export async function updateCall(callId, updates, dateStr) {
  const d = dateStr || new Date().toISOString().slice(0, 10);
  const filepath = path.join(CALLS_DIR, d, `call-${callId}.json`);
  try {
    const content = await fs.readFile(filepath, 'utf-8');
    const existing = JSON.parse(content);
    const merged = { ...existing, ...updates };
    await fs.writeFile(filepath, JSON.stringify(merged, null, 2), 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(`Call file not found: ${filepath}`);
    }
    throw err;
  }
}

/**
 * Loads all calls from storage, optionally limited by date range.
 * @param {string} [from] - Start date YYYY-MM-DD
 * @param {string} [to] - End date YYYY-MM-DD
 * @returns {Promise<Object[]>}
 */
async function loadAllCalls(from, to) {
  const calls = [];
  try {
    const dateDirs = await fs.readdir(CALLS_DIR);
    let sorted = dateDirs.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse();
    if (from) sorted = sorted.filter((d) => d >= from);
    if (to) sorted = sorted.filter((d) => d <= to);
    for (const dateStr of sorted) {
      const dir = path.join(CALLS_DIR, dateStr);
      const files = await fs.readdir(dir);
      for (const f of files.filter((f) => f.endsWith('.json'))) {
        const content = await fs.readFile(path.join(dir, f), 'utf-8');
        calls.push(JSON.parse(content));
      }
    }
    return calls.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

/**
 * Lists calls with filters and pagination.
 * @param {Object} [opts] - Filter options
 * @param {string} [opts.from] - Start date YYYY-MM-DD
 * @param {string} [opts.to] - End date YYYY-MM-DD
 * @param {string} [opts.status] - hot | warm | cold
 * @param {string} [opts.type] - inbound | outbound
 * @param {number} [opts.durationMin] - Min duration in seconds
 * @param {number} [opts.durationMax] - Max duration in seconds
 * @param {string} [opts.phone] - Search by phone (substring)
 * @param {number} [opts.limit=20] - Max calls to return
 * @param {number} [opts.offset=0] - Skip N calls
 * @returns {Promise<Object[]>}
 */
export async function listCalls(opts = {}) {
  const limit = typeof opts === 'number' ? opts : (opts.limit ?? 20);
  const offset = opts.offset ?? 0;
  const from = opts.from;
  const to = opts.to;
  const status = opts.status;
  const type = opts.type;
  const durationMin = opts.durationMin;
  const durationMax = opts.durationMax;
  const phone = opts.phone?.trim();

  let calls = await loadAllCalls(from, to);

  if (status) {
    const s = status.toLowerCase();
    calls = calls.filter((c) => (c.leadTemperature || '').toLowerCase() === s);
  }
  if (type) {
    const t = type.toLowerCase();
    calls = calls.filter((c) => (c.callType || 'inbound').toLowerCase() === t);
  }
  if (typeof durationMin === 'number' && durationMin >= 0) {
    calls = calls.filter((c) => (c.duration ?? 0) >= durationMin);
  }
  if (typeof durationMax === 'number' && durationMax >= 0) {
    calls = calls.filter((c) => (c.duration ?? 0) <= durationMax);
  }
  if (phone) {
    const p = phone.replace(/\D/g, '');
    calls = calls.filter((c) => {
      const num = (c.callerPhone || '').replace(/\D/g, '');
      return num.includes(p) || (c.callerName || '').toLowerCase().includes(phone.toLowerCase());
    });
  }

  return calls.slice(offset, offset + limit);
}

/**
 * Returns aggregate stats for dashboard.
 * @param {Object} [opts] - Optional filters (from, to)
 * @returns {Promise<{ totalCalls: number, totalDurationSeconds: number, hotCount: number, warmCount: number, coldCount: number }>}
 */
export async function getStats(opts = {}) {
  const calls = await loadAllCalls(opts.from, opts.to);
  let totalDurationSeconds = 0;
  let hotCount = 0;
  let warmCount = 0;
  let coldCount = 0;
  for (const c of calls) {
    totalDurationSeconds += c.duration ?? 0;
    const t = (c.leadTemperature || 'cold').toLowerCase();
    if (t === 'hot') hotCount++;
    else if (t === 'warm') warmCount++;
    else coldCount++;
  }
  return {
    totalCalls: calls.length,
    totalDurationSeconds,
    hotCount,
    warmCount,
    coldCount,
  };
}
