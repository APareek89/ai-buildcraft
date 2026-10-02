-- Custom SQL migration: Row-Level Security + profiles ↔ auth.users trigger.
-- Applied after 0000_init_schema. Every user-owned table only exposes rows where
-- auth.uid() = user_id (or id for profiles). Enforced by Supabase/PostgREST + our
-- Supabase server client; the Drizzle service client (postgres role) bypasses RLS
-- and must always scope by user_id in code.

-- ── profiles ↔ auth.users ────────────────────────────────────────────────────
-- Link profiles.id to the auth user and auto-create a profile row on signup.
ALTER TABLE "profiles"
  ADD CONSTRAINT "profiles_id_auth_users_fk"
  FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
--> statement-breakpoint
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
--> statement-breakpoint

-- ── Enable RLS on every table ────────────────────────────────────────────────
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "configs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "runs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "answers" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "sov_history" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "hallucinations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "citations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "plans" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "progress_snapshots" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "reports" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- ── profiles policies (keyed by id) ──────────────────────────────────────────
CREATE POLICY "profiles_select_own" ON "profiles" FOR SELECT TO authenticated USING (auth.uid() = id);
--> statement-breakpoint
CREATE POLICY "profiles_update_own" ON "profiles" FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
--> statement-breakpoint

-- ── owner-only policies (keyed by user_id) ───────────────────────────────────
-- configs
CREATE POLICY "configs_select_own" ON "configs" FOR SELECT TO authenticated USING (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "configs_insert_own" ON "configs" FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "configs_update_own" ON "configs" FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "configs_delete_own" ON "configs" FOR DELETE TO authenticated USING (auth.uid() = user_id);
--> statement-breakpoint
-- api_keys
CREATE POLICY "api_keys_select_own" ON "api_keys" FOR SELECT TO authenticated USING (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "api_keys_insert_own" ON "api_keys" FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "api_keys_update_own" ON "api_keys" FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "api_keys_delete_own" ON "api_keys" FOR DELETE TO authenticated USING (auth.uid() = user_id);
--> statement-breakpoint
-- runs
CREATE POLICY "runs_select_own" ON "runs" FOR SELECT TO authenticated USING (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "runs_insert_own" ON "runs" FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "runs_update_own" ON "runs" FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "runs_delete_own" ON "runs" FOR DELETE TO authenticated USING (auth.uid() = user_id);
--> statement-breakpoint
-- answers
CREATE POLICY "answers_select_own" ON "answers" FOR SELECT TO authenticated USING (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "answers_insert_own" ON "answers" FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "answers_delete_own" ON "answers" FOR DELETE TO authenticated USING (auth.uid() = user_id);
--> statement-breakpoint
-- sov_history
CREATE POLICY "sov_history_select_own" ON "sov_history" FOR SELECT TO authenticated USING (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "sov_history_insert_own" ON "sov_history" FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "sov_history_delete_own" ON "sov_history" FOR DELETE TO authenticated USING (auth.uid() = user_id);
--> statement-breakpoint
-- hallucinations
CREATE POLICY "hallucinations_select_own" ON "hallucinations" FOR SELECT TO authenticated USING (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "hallucinations_insert_own" ON "hallucinations" FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "hallucinations_delete_own" ON "hallucinations" FOR DELETE TO authenticated USING (auth.uid() = user_id);
--> statement-breakpoint
-- citations
CREATE POLICY "citations_select_own" ON "citations" FOR SELECT TO authenticated USING (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "citations_insert_own" ON "citations" FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "citations_delete_own" ON "citations" FOR DELETE TO authenticated USING (auth.uid() = user_id);
--> statement-breakpoint
-- plans
CREATE POLICY "plans_select_own" ON "plans" FOR SELECT TO authenticated USING (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "plans_insert_own" ON "plans" FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "plans_update_own" ON "plans" FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "plans_delete_own" ON "plans" FOR DELETE TO authenticated USING (auth.uid() = user_id);
--> statement-breakpoint
-- progress_snapshots
CREATE POLICY "progress_select_own" ON "progress_snapshots" FOR SELECT TO authenticated USING (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "progress_insert_own" ON "progress_snapshots" FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "progress_delete_own" ON "progress_snapshots" FOR DELETE TO authenticated USING (auth.uid() = user_id);
--> statement-breakpoint
-- reports
CREATE POLICY "reports_select_own" ON "reports" FOR SELECT TO authenticated USING (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "reports_insert_own" ON "reports" FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "reports_delete_own" ON "reports" FOR DELETE TO authenticated USING (auth.uid() = user_id);
