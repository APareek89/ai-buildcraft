CREATE TABLE "memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"content" text NOT NULL,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "thread_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"message_id" text NOT NULL,
	"role" text NOT NULL,
	"parts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text DEFAULT 'New thread' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "configs" ADD COLUMN "competitor_domains" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "roadmap" jsonb;--> statement-breakpoint
CREATE INDEX "memories_user_kind_idx" ON "memories" USING btree ("user_id","kind");--> statement-breakpoint
CREATE INDEX "thread_messages_thread_idx" ON "thread_messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "threads_user_updated_idx" ON "threads" USING btree ("user_id","updated_at");--> statement-breakpoint
-- RLS: owner-only access for the new user tables.
ALTER TABLE "threads" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "thread_messages" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "memories" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "threads_select_own" ON "threads" FOR SELECT TO authenticated USING (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "threads_insert_own" ON "threads" FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "threads_update_own" ON "threads" FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "threads_delete_own" ON "threads" FOR DELETE TO authenticated USING (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "thread_messages_select_own" ON "thread_messages" FOR SELECT TO authenticated USING (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "thread_messages_insert_own" ON "thread_messages" FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "thread_messages_delete_own" ON "thread_messages" FOR DELETE TO authenticated USING (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "memories_select_own" ON "memories" FOR SELECT TO authenticated USING (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "memories_insert_own" ON "memories" FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "memories_update_own" ON "memories" FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "memories_delete_own" ON "memories" FOR DELETE TO authenticated USING (auth.uid() = user_id);
