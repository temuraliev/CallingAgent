import { eq, desc, and, gte, lte, or, ilike, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { calls, scripts } from '../db/schema.js';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', 'data');
const JSON_DB = join(DATA_DIR, 'calls.json');
const JSON_SCRIPTS = join(DATA_DIR, 'scripts.json');

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(JSON_DB)) writeFileSync(JSON_DB, JSON.stringify([]));
  if (!existsSync(JSON_SCRIPTS)) writeFileSync(JSON_SCRIPTS, JSON.stringify([]));
}

async function getJsonCalls() {
  ensureDataDir();
  return JSON.parse(readFileSync(JSON_DB, 'utf-8'));
}

async function saveJsonCalls(data) {
  ensureDataDir();
  writeFileSync(JSON_DB, JSON.stringify(data, null, 2));
}

async function getJsonScripts() {
  ensureDataDir();
  return JSON.parse(readFileSync(JSON_SCRIPTS, 'utf-8'));
}

async function saveJsonScripts(data) {
  ensureDataDir();
  writeFileSync(JSON_SCRIPTS, JSON.stringify(data, null, 2));
}

export async function saveCall(callData) {
  try {
    const [saved] = await db.insert(calls).values({
      callId: callData.callId,
      timestamp: callData.timestamp ? new Date(callData.timestamp) : new Date(),
      callType: callData.callType || 'inbound',
      callerPhone: callData.callerPhone,
      callerName: callData.callerName,
      duration: callData.duration || 0,
      recordingUrl: callData.recordingUrl,
      transcript: callData.transcript || [],
      summary: callData.summary,
      leadTemperature: callData.leadTemperature || 'cold',
      classificationReason: callData.classificationReason,
      crmId: callData.crmId,
      crmProvider: callData.crmProvider,
      interestedActivities: callData.interestedActivities || [],
      wantsCallback: callData.wantsCallback || false,
      amoLeadId: callData.amoLeadId,
    }).returning();
    return saved;
  } catch (err) {
    console.warn('DB Save failed, falling back to JSON:', err.message);
    const jsonCalls = await getJsonCalls();
    const newCall = {
      id: Date.now(),
      ...callData,
      timestamp: callData.timestamp || new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    jsonCalls.push(newCall);
    await saveJsonCalls(jsonCalls);
    return newCall;
  }
}

export async function getCallByCallId(callId) {
  try {
    const result = await db.select().from(calls).where(eq(calls.callId, callId)).limit(1);
    return result[0] || null;
  } catch (err) {
    console.warn('DB getCallByCallId failed, falling back to JSON:', err.message);
    const jsonCalls = await getJsonCalls();
    return jsonCalls.find(c => c.callId === callId) || null;
  }
}

export async function updateCall(callId, updates, _dateStr) {
  try {
    const dbUpdates = { updatedAt: new Date() };
    if (updates.crmId !== undefined) dbUpdates.crmId = updates.crmId;
    if (updates.crmProvider !== undefined) dbUpdates.crmProvider = updates.crmProvider;
    if (updates.leadTemperature !== undefined) dbUpdates.leadTemperature = updates.leadTemperature;
    if (updates.classificationReason !== undefined) dbUpdates.classificationReason = updates.classificationReason;
    if (updates.callerName !== undefined) dbUpdates.callerName = updates.callerName;
    if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
    if (updates.interestedActivities !== undefined) dbUpdates.interestedActivities = updates.interestedActivities;
    if (updates.wantsCallback !== undefined) dbUpdates.wantsCallback = updates.wantsCallback;

    await db.update(calls).set(dbUpdates).where(eq(calls.callId, callId));
  } catch (err) {
    console.warn('DB Update failed, falling back to JSON:', err.message);
    const jsonCalls = await getJsonCalls();
    const idx = jsonCalls.findIndex(c => c.callId === callId);
    if (idx !== -1) {
      const next = { ...jsonCalls[idx], ...updates, updatedAt: new Date().toISOString() };
      if (updates.notes !== undefined) next.notes = updates.notes;
      jsonCalls[idx] = next;
      await saveJsonCalls(jsonCalls);
    }
  }
}

export async function listCalls(opts = {}) {
  try {
    const limit = typeof opts === 'number' ? opts : (opts.limit ?? 20);
    const offset = opts.offset ?? 0;
    const conditions = [];

    if (opts.from) conditions.push(gte(calls.timestamp, new Date(opts.from)));
    if (opts.to) conditions.push(lte(calls.timestamp, new Date(`${opts.to}T23:59:59.999Z`)));
    if (opts.status) conditions.push(eq(calls.leadTemperature, opts.status.toLowerCase()));
    if (opts.type) conditions.push(eq(calls.callType, opts.type.toLowerCase()));
    if (opts.durationMin !== undefined) conditions.push(gte(calls.duration, opts.durationMin));
    if (opts.durationMax !== undefined) conditions.push(lte(calls.duration, opts.durationMax));
    if (opts.phone) {
      const p = opts.phone.replace(/\D/g, '');
      if (p) {
        conditions.push(or(ilike(calls.callerPhone, `%${p}%`), ilike(calls.callerName, `%${opts.phone}%`)));
      } else {
        conditions.push(ilike(calls.callerName, `%${opts.phone}%`));
      }
    }

    const query = db.select().from(calls);
    if (conditions.length > 0) query.where(and(...conditions));
    return await query.orderBy(desc(calls.timestamp)).limit(limit).offset(offset);
  } catch (err) {
    console.warn('DB List failed, falling back to JSON:', err.message);
    const jsonCalls = await getJsonCalls();
    // Simplified filtering for JSON
    let filtered = [...jsonCalls];
    if (opts.status) filtered = filtered.filter(c => c.leadTemperature === opts.status);
    if (opts.type) filtered = filtered.filter(c => c.callType === opts.type);

    return filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(opts.offset || 0, (opts.offset || 0) + (opts.limit || 20));
  }
}

export async function findLatestCallByPhone(phone) {
  try {
    if (!phone || !String(phone).trim()) return null;
    const p = String(phone).replace(/\D/g, '');
    if (!p) return null;

    const result = await db.select()
      .from(calls)
      .where(ilike(calls.callerPhone, `%${p}%`))
      .orderBy(desc(calls.timestamp))
      .limit(1);

    return result[0] || null;
  } catch (err) {
    const jsonCalls = await getJsonCalls();
    const p = String(phone).replace(/\D/g, '');
    return jsonCalls.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .find(c => (c.callerPhone || '').includes(p)) || null;
  }
}

export async function updateCallByPhone(phone, updates) {
  const call = await findLatestCallByPhone(phone);
  if (!call) return false;
  await updateCall(call.callId, updates);
  return true;
}

export async function getStats(opts = {}) {
  try {
    const conditions = [];
    if (opts.from) conditions.push(gte(calls.timestamp, new Date(opts.from)));
    if (opts.to) conditions.push(lte(calls.timestamp, new Date(`${opts.to}T23:59:59.999Z`)));

    const query = db.select({
      totalCalls: sql`count(*)`.mapWith(Number),
      totalDurationSeconds: sql`sum(${calls.duration})`.mapWith(Number),
      hotCount: sql`sum(case when ${calls.leadTemperature} = 'hot' then 1 else 0 end)`.mapWith(Number),
      warmCount: sql`sum(case when ${calls.leadTemperature} = 'warm' then 1 else 0 end)`.mapWith(Number),
      coldCount: sql`sum(case when ${calls.leadTemperature} = 'cold' then 1 else 0 end)`.mapWith(Number),
    }).from(calls);

    if (conditions.length > 0) query.where(and(...conditions));
    const [result] = await query;
    return {
      totalCalls: result?.totalCalls || 0,
      totalDurationSeconds: result?.totalDurationSeconds || 0,
      hotCount: result?.hotCount || 0,
      warmCount: result?.warmCount || 0,
      coldCount: result?.coldCount || 0,
    };
  } catch (err) {
    console.warn('DB Stats failed, falling back to JSON:', err.message);
    const jsonCalls = await getJsonCalls();
    return {
      totalCalls: jsonCalls.length,
      totalDurationSeconds: jsonCalls.reduce((s, c) => s + (c.duration || 0), 0),
      hotCount: jsonCalls.filter(c => c.leadTemperature === 'hot').length,
      warmCount: jsonCalls.filter(c => c.leadTemperature === 'warm').length,
      coldCount: jsonCalls.filter(c => c.leadTemperature === 'cold').length,
    };
  }
}

// ─── Script Storage ──────────────────────────────────────────────────────────

export async function saveScript(scriptData) {
  try {
    const [saved] = await db.insert(scripts).values({
      name: scriptData.name,
      description: scriptData.description,
      firstMessage: scriptData.firstMessage,
      systemPrompt: scriptData.systemPrompt,
      isActive: scriptData.isActive !== undefined ? scriptData.isActive : true,
      updatedAt: new Date(),
    }).returning();
    return saved;
  } catch (err) {
    console.warn('DB Script Save failed, falling back to JSON:', err.message);
    const jsonScripts = await getJsonScripts();
    const newScript = {
      id: Date.now(),
      ...scriptData,
      isActive: scriptData.isActive !== undefined ? scriptData.isActive : true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    jsonScripts.push(newScript);
    await saveJsonScripts(jsonScripts);
    return newScript;
  }
}

export async function listScripts() {
  try {
    return await db.select().from(scripts).orderBy(desc(scripts.updatedAt));
  } catch (err) {
    console.warn('DB Script List failed, falling back to JSON:', err.message);
    const jsonScripts = await getJsonScripts();
    return jsonScripts.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }
}

export async function getScript(id) {
  try {
    const result = await db.select().from(scripts).where(eq(scripts.id, Number(id)));
    return result[0] || null;
  } catch (err) {
    console.warn('DB Script Get failed, falling back to JSON:', err.message);
    const jsonScripts = await getJsonScripts();
    return jsonScripts.find(s => String(s.id) === String(id)) || null;
  }
}

export async function updateScript(id, updates) {
  const allowed = ['name', 'description', 'firstMessage', 'systemPrompt', 'isActive'];
  const clean = {};
  for (const k of allowed) {
    if (updates[k] !== undefined) clean[k] = updates[k];
  }
  if (Object.keys(clean).length === 0) return getScript(id);

  try {
    const [updated] = await db.update(scripts)
      .set({ ...clean, updatedAt: new Date() })
      .where(eq(scripts.id, Number(id)))
      .returning();
    return updated || null;
  } catch (err) {
    console.warn('DB Script Update failed, falling back to JSON:', err.message);
    const jsonScripts = await getJsonScripts();
    const idx = jsonScripts.findIndex(s => String(s.id) === String(id));
    if (idx === -1) return null;
    jsonScripts[idx] = { ...jsonScripts[idx], ...clean, updatedAt: new Date().toISOString() };
    await saveJsonScripts(jsonScripts);
    return jsonScripts[idx];
  }
}

export async function deleteScript(id) {
  try {
    await db.delete(scripts).where(eq(scripts.id, Number(id)));
    return true;
  } catch (err) {
    console.warn('DB Script Delete failed, falling back to JSON:', err.message);
    const jsonScripts = await getJsonScripts();
    const filtered = jsonScripts.filter(s => String(s.id) !== String(id));
    await saveJsonScripts(filtered);
    return true;
  }
}
