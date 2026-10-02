CREATE TYPE "blindspot"."capture_mode" AS ENUM('metadata', 'inputs', 'full');--> statement-breakpoint
CREATE TYPE "blindspot"."workflow_execution_status" AS ENUM('running', 'completed', 'error');--> statement-breakpoint
CREATE TYPE "blindspot"."workflow_node_kind" AS ENUM('agent', 'generation', 'tool', 'retrieval', 'function');--> statement-breakpoint
CREATE TYPE "blindspot"."workflow_span_status" AS ENUM('ok', 'error');--> statement-breakpoint
ALTER TYPE "blindspot"."provider_name" ADD VALUE 'fireworks' BEFORE 'openrouter';--> statement-breakpoint
CREATE TABLE "blindspot"."workflow_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"session_id" text,
	"status" "blindspot"."workflow_execution_status" DEFAULT 'running' NOT NULL,
	"metadata_json" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "blindspot"."workflow_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"route_id" uuid,
	"name" text NOT NULL,
	"kind" "blindspot"."workflow_node_kind" DEFAULT 'generation' NOT NULL,
	"latest_model" text,
	"requirements_json" jsonb NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blindspot"."workflow_spans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"execution_id" uuid NOT NULL,
	"node_id" uuid NOT NULL,
	"trace_id" uuid,
	"external_id" text NOT NULL,
	"parent_external_id" text,
	"model" text,
	"status" "blindspot"."workflow_span_status" DEFAULT 'ok' NOT NULL,
	"capture_mode" "blindspot"."capture_mode" NOT NULL,
	"input_json" jsonb,
	"output_json" jsonb,
	"input_bytes" integer,
	"output_bytes" integer,
	"input_tokens" integer,
	"output_tokens" integer,
	"cost_cents" real,
	"latency_ms" integer,
	"error" text,
	"metadata_json" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blindspot"."workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"framework" text,
	"language" text,
	"environment" text DEFAULT 'production' NOT NULL,
	"selected" boolean DEFAULT false NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "blindspot"."projects" ADD COLUMN "capture_mode" "blindspot"."capture_mode" DEFAULT 'metadata' NOT NULL;--> statement-breakpoint
ALTER TABLE "blindspot"."workflow_executions" ADD CONSTRAINT "workflow_executions_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "blindspot"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blindspot"."workflow_nodes" ADD CONSTRAINT "workflow_nodes_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "blindspot"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blindspot"."workflow_nodes" ADD CONSTRAINT "workflow_nodes_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "blindspot"."routes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blindspot"."workflow_spans" ADD CONSTRAINT "workflow_spans_execution_id_workflow_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "blindspot"."workflow_executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blindspot"."workflow_spans" ADD CONSTRAINT "workflow_spans_node_id_workflow_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "blindspot"."workflow_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blindspot"."workflow_spans" ADD CONSTRAINT "workflow_spans_trace_id_traces_id_fk" FOREIGN KEY ("trace_id") REFERENCES "blindspot"."traces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blindspot"."workflows" ADD CONSTRAINT "workflows_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "blindspot"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_executions_workflow_external_idx" ON "blindspot"."workflow_executions" USING btree ("workflow_id","external_id");--> statement-breakpoint
CREATE INDEX "workflow_executions_workflow_started_idx" ON "blindspot"."workflow_executions" USING btree ("workflow_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_nodes_workflow_name_idx" ON "blindspot"."workflow_nodes" USING btree ("workflow_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_spans_execution_external_idx" ON "blindspot"."workflow_spans" USING btree ("execution_id","external_id");--> statement-breakpoint
CREATE INDEX "workflow_spans_node_created_idx" ON "blindspot"."workflow_spans" USING btree ("node_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workflows_project_name_env_idx" ON "blindspot"."workflows" USING btree ("project_id","name","environment");--> statement-breakpoint
CREATE INDEX "workflows_project_last_seen_idx" ON "blindspot"."workflows" USING btree ("project_id","last_seen_at");