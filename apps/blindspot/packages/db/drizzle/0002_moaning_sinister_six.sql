CREATE TABLE "blindspot"."model_registry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"provider" "blindspot"."provider_name" NOT NULL,
	"model_ref" text NOT NULL,
	"provider_model_id" text NOT NULL,
	"display_name" text NOT NULL,
	"source" text DEFAULT 'provider' NOT NULL,
	"availability" text DEFAULT 'available' NOT NULL,
	"capabilities_json" jsonb NOT NULL,
	"input_usd_per_million" real,
	"output_usd_per_million" real,
	"provider_created_at" timestamp with time zone,
	"deprecated_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_probed_at" timestamp with time zone,
	"probe_status" text DEFAULT 'unverified' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "blindspot"."model_registry" ADD CONSTRAINT "model_registry_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "blindspot"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "model_registry_project_model_idx" ON "blindspot"."model_registry" USING btree ("project_id","model_ref");--> statement-breakpoint
CREATE INDEX "model_registry_project_provider_idx" ON "blindspot"."model_registry" USING btree ("project_id","provider");