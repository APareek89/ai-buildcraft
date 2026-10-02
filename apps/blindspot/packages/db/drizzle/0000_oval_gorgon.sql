CREATE SCHEMA "blindspot";
--> statement-breakpoint
CREATE TYPE "blindspot"."candidate_source" AS ENUM('api', 'hf', 'aggregator', 'local');--> statement-breakpoint
CREATE TYPE "blindspot"."drift_action" AS ENUM('recommended', 'auto_approved', 'none');--> statement-breakpoint
CREATE TYPE "blindspot"."golden_label" AS ENUM('pass', 'fail', 'unlabeled');--> statement-breakpoint
CREATE TYPE "blindspot"."golden_origin" AS ENUM('upload', 'agent', 'grown');--> statement-breakpoint
CREATE TYPE "blindspot"."provider_name" AS ENUM('anthropic', 'openai', 'gemini', 'groq', 'hf', 'openrouter', 'together', 'ollama');--> statement-breakpoint
CREATE TYPE "blindspot"."recommendation_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "blindspot"."api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blindspot"."candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_id" uuid NOT NULL,
	"model_ref" text NOT NULL,
	"source" "blindspot"."candidate_source" DEFAULT 'api' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blindspot"."drift_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_id" uuid NOT NULL,
	"model_ref" text NOT NULL,
	"old_score" real,
	"new_score" real NOT NULL,
	"action" "blindspot"."drift_action" DEFAULT 'recommended' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blindspot"."eval_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_id" uuid NOT NULL,
	"model_ref" text NOT NULL,
	"golden_set_version" integer NOT NULL,
	"avg_score" real NOT NULL,
	"cost_per_1k" real,
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blindspot"."golden_examples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"golden_set_id" uuid NOT NULL,
	"input" text NOT NULL,
	"reference_output" text,
	"rubric" text,
	"label" "blindspot"."golden_label" DEFAULT 'unlabeled' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blindspot"."golden_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"origin" "blindspot"."golden_origin" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blindspot"."projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blindspot"."provider_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"provider" "blindspot"."provider_name" NOT NULL,
	"encrypted_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blindspot"."recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_id" uuid NOT NULL,
	"from_model" text,
	"to_model" text NOT NULL,
	"evidence_json" jsonb NOT NULL,
	"status" "blindspot"."recommendation_status" DEFAULT 'pending' NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blindspot"."routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"live_model" text,
	"policy_json" jsonb NOT NULL,
	"auto_approve" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blindspot"."traces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_id" uuid,
	"model" text NOT NULL,
	"input" jsonb NOT NULL,
	"output" text,
	"cost_cents" real,
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "blindspot"."api_keys" ADD CONSTRAINT "api_keys_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "blindspot"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blindspot"."candidates" ADD CONSTRAINT "candidates_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "blindspot"."routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blindspot"."drift_events" ADD CONSTRAINT "drift_events_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "blindspot"."routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blindspot"."eval_runs" ADD CONSTRAINT "eval_runs_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "blindspot"."routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blindspot"."golden_examples" ADD CONSTRAINT "golden_examples_golden_set_id_golden_sets_id_fk" FOREIGN KEY ("golden_set_id") REFERENCES "blindspot"."golden_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blindspot"."golden_sets" ADD CONSTRAINT "golden_sets_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "blindspot"."routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blindspot"."provider_keys" ADD CONSTRAINT "provider_keys_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "blindspot"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blindspot"."recommendations" ADD CONSTRAINT "recommendations_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "blindspot"."routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blindspot"."routes" ADD CONSTRAINT "routes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "blindspot"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blindspot"."traces" ADD CONSTRAINT "traces_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "blindspot"."routes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_key_hash_idx" ON "blindspot"."api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "candidates_route_model_idx" ON "blindspot"."candidates" USING btree ("route_id","model_ref");--> statement-breakpoint
CREATE INDEX "eval_runs_route_idx" ON "blindspot"."eval_runs" USING btree ("route_id");--> statement-breakpoint
CREATE UNIQUE INDEX "golden_sets_route_version_idx" ON "blindspot"."golden_sets" USING btree ("route_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_keys_project_provider_idx" ON "blindspot"."provider_keys" USING btree ("project_id","provider");--> statement-breakpoint
CREATE INDEX "recommendations_route_status_idx" ON "blindspot"."recommendations" USING btree ("route_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "routes_project_name_idx" ON "blindspot"."routes" USING btree ("project_id","name");--> statement-breakpoint
CREATE INDEX "traces_route_idx" ON "blindspot"."traces" USING btree ("route_id");