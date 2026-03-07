import { pgTable, text, varchar, integer, timestamp, jsonb, boolean, serial } from 'drizzle-orm/pg-core';

export const calls = pgTable('calls', {
  id: serial('id').primaryKey(),
  callId: varchar('call_id', { length: 255 }).unique().notNull(),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
  callType: varchar('call_type', { length: 50 }).notNull().default('inbound'),
  callerPhone: varchar('caller_phone', { length: 50 }),
  callerName: varchar('caller_name', { length: 255 }),
  duration: integer('duration').notNull().default(0),
  recordingUrl: text('recording_url'),
  transcript: jsonb('transcript').default([]),
  summary: text('summary'),
  leadTemperature: varchar('lead_temperature', { length: 50 }).default('cold'),
  classificationReason: text('classification_reason'),
  crmId: varchar('crm_id', { length: 255 }),
  crmProvider: varchar('crm_provider', { length: 50 }),
  notes: text('notes'),
  interestedActivities: jsonb('interested_activities').default([]),
  wantsCallback: boolean('wants_callback').default(false),
  amoLeadId: varchar('amo_lead_id', { length: 255 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const settings = pgTable('settings', {
  id: serial('id').primaryKey(),
  key: varchar('key', { length: 255 }).unique().notNull(),
  value: jsonb('value'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const scripts = pgTable('scripts', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  firstMessage: text('first_message'),
  systemPrompt: text('system_prompt'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
