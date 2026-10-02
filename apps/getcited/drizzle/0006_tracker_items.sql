CREATE TABLE "tracker_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"week" integer NOT NULL,
	"due_date" date NOT NULL,
	"action" text NOT NULL,
	"owner_role" text,
	"hours" real,
	"deliverable" text,
	"status" text DEFAULT 'not_started' NOT NULL,
	"remarks" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "tracker_items_user_plan_idx" ON "tracker_items" USING btree ("user_id","plan_id","week");--> statement-breakpoint
-- RLS: owner-only access (same pattern as threads/memories in 0005).
ALTER TABLE "tracker_items" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tracker_items_select_own" ON "tracker_items" FOR SELECT TO authenticated USING (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "tracker_items_insert_own" ON "tracker_items" FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "tracker_items_update_own" ON "tracker_items" FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "tracker_items_delete_own" ON "tracker_items" FOR DELETE TO authenticated USING (auth.uid() = user_id);