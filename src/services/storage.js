import { eq, desc, and, gte, lte, or, ilike, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { calls } from '../db/schema.js';

export async function saveCall(callData) {
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
}

export async function updateCall(callId, updates, _dateStr) {
  const dbUpdates = { updatedAt: new Date() };

  if (updates.crmId !== undefined) dbUpdates.crmId = updates.crmId;
  if (updates.crmProvider !== undefined) dbUpdates.crmProvider = updates.crmProvider;
  if (updates.leadTemperature !== undefined) dbUpdates.leadTemperature = updates.leadTemperature;
  if (updates.classificationReason !== undefined) dbUpdates.classificationReason = updates.classificationReason;
  if (updates.callerName !== undefined) dbUpdates.callerName = updates.callerName;
  if (updates.interestedActivities !== undefined) dbUpdates.interestedActivities = updates.interestedActivities;
  if (updates.wantsCallback !== undefined) dbUpdates.wantsCallback = updates.wantsCallback;

  await db.update(calls).set(dbUpdates).where(eq(calls.callId, callId));
}

export async function listCalls(opts = {}) {
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
      conditions.push(
        or(
          ilike(calls.callerPhone, `%${p}%`),
          ilike(calls.callerName, `%${opts.phone}%`)
        )
      );
    } else {
      conditions.push(ilike(calls.callerName, `%${opts.phone}%`));
    }
  }

  const query = db.select().from(calls);
  if (conditions.length > 0) {
    query.where(and(...conditions));
  }

  return await query
    .orderBy(desc(calls.timestamp))
    .limit(limit)
    .offset(offset);
}

export async function findLatestCallByPhone(phone) {
  if (!phone || !String(phone).trim()) return null;
  const p = String(phone).replace(/\D/g, '');
  if (!p) return null;

  const result = await db.select()
    .from(calls)
    .where(ilike(calls.callerPhone, `%${p}%`))
    .orderBy(desc(calls.timestamp))
    .limit(1);

  return result[0] || null;
}

export async function updateCallByPhone(phone, updates) {
  const call = await findLatestCallByPhone(phone);
  if (!call) return false;
  await updateCall(call.callId, updates);
  return true;
}

export async function getStats(opts = {}) {
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

  if (conditions.length > 0) {
    query.where(and(...conditions));
  }

  const [result] = await query;
  return {
    totalCalls: result?.totalCalls || 0,
    totalDurationSeconds: result?.totalDurationSeconds || 0,
    hotCount: result?.hotCount || 0,
    warmCount: result?.warmCount || 0,
    coldCount: result?.coldCount || 0,
  };
}
