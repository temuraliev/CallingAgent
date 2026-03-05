CREATE TABLE "calls" (
	"id" serial PRIMARY KEY NOT NULL,
	"call_id" varchar(255) NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"call_type" varchar(50) DEFAULT 'inbound' NOT NULL,
	"caller_phone" varchar(50),
	"caller_name" varchar(255),
	"duration" integer DEFAULT 0 NOT NULL,
	"recording_url" text,
	"transcript" jsonb DEFAULT '[]'::jsonb,
	"summary" text,
	"lead_temperature" varchar(50) DEFAULT 'cold',
	"classification_reason" text,
	"crm_id" varchar(255),
	"crm_provider" varchar(50),
	"interested_activities" jsonb DEFAULT '[]'::jsonb,
	"wants_callback" boolean DEFAULT false,
	"amo_lead_id" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "calls_call_id_unique" UNIQUE("call_id")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(255) NOT NULL,
	"value" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "settings_key_unique" UNIQUE("key")
);
