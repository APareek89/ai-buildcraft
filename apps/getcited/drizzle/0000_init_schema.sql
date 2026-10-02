CREATE TABLE "answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"model" text NOT NULL,
	"prompt" text NOT NULL,
	"raw_answer" text NOT NULL,
	"mentions" text[] DEFAULT '{}' NOT NULL,
	"cited_domains" text[] DEFAULT '{}' NOT NULL,
	"sentiment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "citations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"run_id" uuid,
	"url" text NOT NULL,
	"domain" text,
	"source_type" text DEFAULT 'other' NOT NULL,
	"cites_competitor" text,
	"mentions_brand" boolean DEFAULT false NOT NULL,
	"signals" jsonb,
	"title" text,
	"excerpt" text,
	"crawled_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"brand_url" text NOT NULL,
	"brand_name" text,
	"description" text,
	"brand_domains" text[] DEFAULT '{}' NOT NULL,
	"competitors" text[] DEFAULT '{}' NOT NULL,
	"queries" text[] DEFAULT '{}' NOT NULL,
	"budget_usd" real DEFAULT 0 NOT NULL,
	"team_size" integer DEFAULT 1 NOT NULL,
	"timeline_weeks" integer DEFAULT 8 NOT NULL,
	"mode" text DEFAULT 'we_serve' NOT NULL,
	"platform_option" text,
	"instance_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hallucinations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"claim" text NOT NULL,
	"contradicts_fact" text NOT NULL,
	"severity" text NOT NULL,
	"model" text,
	"prompt" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"config_id" uuid,
	"config_version" integer,
	"run_id" uuid,
	"tactics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"projection" jsonb,
	"target_citation_share" real,
	"timeline_weeks" integer,
	"confidence" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "progress_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"done_tactics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence" jsonb,
	"sov" real,
	"citation_share" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"run_id" uuid,
	"plan_id" uuid,
	"kind" text NOT NULL,
	"format" text NOT NULL,
	"title" text,
	"storage_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"config_id" uuid,
	"brand" text NOT NULL,
	"brand_domains" text[] DEFAULT '{}' NOT NULL,
	"competitors" text[] DEFAULT '{}' NOT NULL,
	"panel" text[] DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"cost_usd" real DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sov_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"config_id" uuid,
	"run_id" uuid,
	"date" date NOT NULL,
	"sov" real NOT NULL,
	"citation_share" real,
	"sentiment_score" real
);
--> statement-breakpoint
CREATE INDEX "answers_run_idx" ON "answers" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "api_keys_user_provider_idx" ON "api_keys" USING btree ("user_id","provider");--> statement-breakpoint
CREATE INDEX "citations_user_url_idx" ON "citations" USING btree ("user_id","url");--> statement-breakpoint
CREATE INDEX "configs_user_active_idx" ON "configs" USING btree ("user_id","is_active");--> statement-breakpoint
CREATE INDEX "plans_user_created_idx" ON "plans" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "reports_user_created_idx" ON "reports" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "runs_user_created_idx" ON "runs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "sov_history_user_date_idx" ON "sov_history" USING btree ("user_id","date");