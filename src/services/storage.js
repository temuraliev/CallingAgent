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
 * Lists recent calls, most recent first.
 * @param {number} [limit=20] - Max number of calls to return
 * @returns {Promise<Object[]>}
 */
export async function listCalls(limit = 20) {
  const calls = [];
  try {
    const dateDirs = await fs.readdir(CALLS_DIR);
    const sorted = dateDirs.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse();
    for (const dateStr of sorted) {
      const dir = path.join(CALLS_DIR, dateStr);
      const files = await fs.readdir(dir);
      for (const f of files.filter((f) => f.endsWith('.json'))) {
        const content = await fs.readFile(path.join(dir, f), 'utf-8');
        calls.push(JSON.parse(content));
        if (calls.length >= limit) break;
      }
      if (calls.length >= limit) break;
    }
    return calls.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, limit);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}
