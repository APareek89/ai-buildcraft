-- Fresh ordinary PostgreSQL install, derived from historical table definitions.
-- Apply once to an empty database as an admin, inside a transaction.
-- Fresh ordinary PostgreSQL install. Apply once as an admin in a transaction.

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

CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

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

CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

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

CREATE INDEX "answers_run_idx" ON "answers" USING btree ("run_id");
CREATE INDEX "api_keys_user_provider_idx" ON "api_keys" USING btree ("user_id","provider");
CREATE INDEX "citations_user_url_idx" ON "citations" USING btree ("user_id","url");
CREATE INDEX "configs_user_active_idx" ON "configs" USING btree ("user_id","is_active");
CREATE INDEX "plans_user_created_idx" ON "plans" USING btree ("user_id","created_at");
CREATE INDEX "reports_user_created_idx" ON "reports" USING btree ("user_id","created_at");
CREATE INDEX "runs_user_created_idx" ON "runs" USING btree ("user_id","created_at");
CREATE INDEX "sov_history_user_date_idx" ON "sov_history" USING btree ("user_id","date");
-- FMEA #3: a unique (user_id, version) index so two concurrent config saves cannot
-- create duplicate versions — the losing insert fails with 23505 and is retried.
CREATE UNIQUE INDEX IF NOT EXISTS "configs_user_version_unique"
  ON "configs" USING btree ("user_id", "version");

CREATE TABLE "mcp_oauth_clients" (
	"client_id" text PRIMARY KEY NOT NULL,
	"name" text,
	"redirect_uris" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "mcp_oauth_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"redirect_uri" text NOT NULL,
	"code_challenge" text NOT NULL,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"resource" text,
	"expires_at" timestamp with time zone NOT NULL
);

-- Already created by custom migration 0003; IF NOT EXISTS keeps this re-runnable.
CREATE UNIQUE INDEX IF NOT EXISTS "configs_user_version_unique" ON "configs" USING btree ("user_id","version");




CREATE TABLE "memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"content" text NOT NULL,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "thread_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"message_id" text NOT NULL,
	"role" text NOT NULL,
	"parts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text DEFAULT 'New thread' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "configs" ADD COLUMN "competitor_domains" text[] DEFAULT '{}' NOT NULL;
ALTER TABLE "plans" ADD COLUMN "roadmap" jsonb;
CREATE INDEX "memories_user_kind_idx" ON "memories" USING btree ("user_id","kind");
CREATE INDEX "thread_messages_thread_idx" ON "thread_messages" USING btree ("thread_id","created_at");
CREATE INDEX "threads_user_updated_idx" ON "threads" USING btree ("user_id","updated_at");




























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

CREATE INDEX "tracker_items_user_plan_idx" ON "tracker_items" USING btree ("user_id","plan_id","week");









CREATE TABLE getcited_users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text NOT NULL UNIQUE,password_hash text NOT NULL,disabled boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE getcited_sessions(id uuid PRIMARY KEY,owner_id uuid NOT NULL REFERENCES getcited_users(id),expires_at timestamptz NOT NULL,revoked_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(owner_id,id));
CREATE INDEX getcited_sessions_owner ON getcited_sessions(owner_id,expires_at);
CREATE TABLE getcited_rates(key text PRIMARY KEY,window_start timestamptz NOT NULL,count integer NOT NULL CHECK(count>0));
CREATE TABLE getcited_mcp_grants(id uuid PRIMARY KEY,owner_id uuid NOT NULL REFERENCES getcited_users(id),session_id uuid NOT NULL,client_id text NOT NULL REFERENCES mcp_oauth_clients(client_id),expires_at timestamptz NOT NULL,revoked_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(owner_id,session_id) REFERENCES getcited_sessions(owner_id,id));
ALTER TABLE mcp_oauth_codes ADD COLUMN session_id uuid;
ALTER TABLE mcp_oauth_codes ADD CONSTRAINT codes_session_owner FOREIGN KEY(user_id,session_id) REFERENCES getcited_sessions(owner_id,id);
ALTER TABLE mcp_oauth_codes ADD CONSTRAINT codes_client FOREIGN KEY(client_id) REFERENCES mcp_oauth_clients(client_id);
CREATE TABLE getcited_usage(id uuid PRIMARY KEY,owner_id uuid NOT NULL REFERENCES getcited_users(id),session_id uuid NOT NULL,operation_id uuid NOT NULL,kind text NOT NULL,provider text NOT NULL,model text NOT NULL,provider_model text,shared boolean NOT NULL,reserved_usd numeric(18,10) NOT NULL CHECK(reserved_usd>=0),actual_usd numeric(18,10),input_bytes integer NOT NULL,max_output_tokens integer NOT NULL,deadline_at timestamptz NOT NULL,input_tokens integer,output_tokens integer,cached_input_tokens integer,reasoning_tokens integer,status text NOT NULL CHECK(status IN ('reserved','dispatched','complete','released','uncertain')),error_class text,created_at timestamptz NOT NULL DEFAULT now(),dispatched_at timestamptz,settled_at timestamptz,FOREIGN KEY(owner_id,session_id) REFERENCES getcited_sessions(owner_id,id));
CREATE INDEX getcited_usage_owner ON getcited_usage(owner_id,created_at);
CREATE TABLE getcited_operations(id uuid PRIMARY KEY,owner_id uuid NOT NULL REFERENCES getcited_users(id),expires_at timestamptz NOT NULL);
CREATE TABLE getcited_examples(owner_id uuid PRIMARY KEY REFERENCES getcited_users(id),config_id uuid,run_id uuid,plan_id uuid,thread_id uuid,status text NOT NULL DEFAULT 'building',created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE getcited_portfolio_schema(version integer PRIMARY KEY,installed_at timestamptz NOT NULL DEFAULT now());
INSERT INTO getcited_portfolio_schema(version) VALUES(1);
ALTER TABLE profiles ADD CONSTRAINT profile_account FOREIGN KEY(id) REFERENCES getcited_users(id);
CREATE UNIQUE INDEX api_keys_owner_provider ON api_keys(user_id,provider);
CREATE UNIQUE INDEX config_one_active ON configs(user_id) WHERE is_active;
ALTER TABLE runs ALTER COLUMN cost_usd TYPE numeric(18,10);
ALTER TABLE configs ADD CONSTRAINT configs_account FOREIGN KEY(user_id) REFERENCES getcited_users(id);
ALTER TABLE configs ADD CONSTRAINT configs_owner_id UNIQUE(user_id,id);
ALTER TABLE api_keys ADD CONSTRAINT api_keys_account FOREIGN KEY(user_id) REFERENCES getcited_users(id);
ALTER TABLE api_keys ADD CONSTRAINT api_keys_owner_id UNIQUE(user_id,id);
ALTER TABLE runs ADD CONSTRAINT runs_account FOREIGN KEY(user_id) REFERENCES getcited_users(id);
ALTER TABLE runs ADD CONSTRAINT runs_owner_id UNIQUE(user_id,id);
ALTER TABLE answers ADD CONSTRAINT answers_account FOREIGN KEY(user_id) REFERENCES getcited_users(id);
ALTER TABLE answers ADD CONSTRAINT answers_owner_id UNIQUE(user_id,id);
ALTER TABLE sov_history ADD CONSTRAINT sov_history_account FOREIGN KEY(user_id) REFERENCES getcited_users(id);
ALTER TABLE sov_history ADD CONSTRAINT sov_history_owner_id UNIQUE(user_id,id);
ALTER TABLE hallucinations ADD CONSTRAINT hallucinations_account FOREIGN KEY(user_id) REFERENCES getcited_users(id);
ALTER TABLE hallucinations ADD CONSTRAINT hallucinations_owner_id UNIQUE(user_id,id);
ALTER TABLE citations ADD CONSTRAINT citations_account FOREIGN KEY(user_id) REFERENCES getcited_users(id);
ALTER TABLE citations ADD CONSTRAINT citations_owner_id UNIQUE(user_id,id);
ALTER TABLE plans ADD CONSTRAINT plans_account FOREIGN KEY(user_id) REFERENCES getcited_users(id);
ALTER TABLE plans ADD CONSTRAINT plans_owner_id UNIQUE(user_id,id);
ALTER TABLE progress_snapshots ADD CONSTRAINT progress_snapshots_account FOREIGN KEY(user_id) REFERENCES getcited_users(id);
ALTER TABLE progress_snapshots ADD CONSTRAINT progress_snapshots_owner_id UNIQUE(user_id,id);
ALTER TABLE reports ADD CONSTRAINT reports_account FOREIGN KEY(user_id) REFERENCES getcited_users(id);
ALTER TABLE reports ADD CONSTRAINT reports_owner_id UNIQUE(user_id,id);
ALTER TABLE threads ADD CONSTRAINT threads_account FOREIGN KEY(user_id) REFERENCES getcited_users(id);
ALTER TABLE threads ADD CONSTRAINT threads_owner_id UNIQUE(user_id,id);
ALTER TABLE thread_messages ADD CONSTRAINT thread_messages_account FOREIGN KEY(user_id) REFERENCES getcited_users(id);
ALTER TABLE thread_messages ADD CONSTRAINT thread_messages_owner_id UNIQUE(user_id,id);
ALTER TABLE memories ADD CONSTRAINT memories_account FOREIGN KEY(user_id) REFERENCES getcited_users(id);
ALTER TABLE memories ADD CONSTRAINT memories_owner_id UNIQUE(user_id,id);
ALTER TABLE tracker_items ADD CONSTRAINT tracker_items_account FOREIGN KEY(user_id) REFERENCES getcited_users(id);
ALTER TABLE tracker_items ADD CONSTRAINT tracker_items_owner_id UNIQUE(user_id,id);
ALTER TABLE configs ADD COLUMN prepared boolean NOT NULL DEFAULT false;
ALTER TABLE runs ADD COLUMN prepared boolean NOT NULL DEFAULT false;
ALTER TABLE plans ADD COLUMN prepared boolean NOT NULL DEFAULT false;
ALTER TABLE threads ADD COLUMN prepared boolean NOT NULL DEFAULT false;
ALTER TABLE runs ADD CONSTRAINT runs_config_id_owner FOREIGN KEY(user_id,config_id) REFERENCES configs(user_id,id);
ALTER TABLE answers ADD CONSTRAINT answers_run_id_owner FOREIGN KEY(user_id,run_id) REFERENCES runs(user_id,id);
ALTER TABLE sov_history ADD CONSTRAINT sov_history_config_id_owner FOREIGN KEY(user_id,config_id) REFERENCES configs(user_id,id);
ALTER TABLE sov_history ADD CONSTRAINT sov_history_run_id_owner FOREIGN KEY(user_id,run_id) REFERENCES runs(user_id,id);
ALTER TABLE hallucinations ADD CONSTRAINT hallucinations_run_id_owner FOREIGN KEY(user_id,run_id) REFERENCES runs(user_id,id);
ALTER TABLE citations ADD CONSTRAINT citations_run_id_owner FOREIGN KEY(user_id,run_id) REFERENCES runs(user_id,id);
ALTER TABLE plans ADD CONSTRAINT plans_config_id_owner FOREIGN KEY(user_id,config_id) REFERENCES configs(user_id,id);
ALTER TABLE plans ADD CONSTRAINT plans_run_id_owner FOREIGN KEY(user_id,run_id) REFERENCES runs(user_id,id);
ALTER TABLE progress_snapshots ADD CONSTRAINT progress_snapshots_plan_id_owner FOREIGN KEY(user_id,plan_id) REFERENCES plans(user_id,id);
ALTER TABLE reports ADD CONSTRAINT reports_run_id_owner FOREIGN KEY(user_id,run_id) REFERENCES runs(user_id,id);
ALTER TABLE reports ADD CONSTRAINT reports_plan_id_owner FOREIGN KEY(user_id,plan_id) REFERENCES plans(user_id,id);
ALTER TABLE thread_messages ADD CONSTRAINT thread_messages_thread_id_owner FOREIGN KEY(user_id,thread_id) REFERENCES threads(user_id,id) ON DELETE CASCADE;
ALTER TABLE tracker_items ADD CONSTRAINT tracker_items_plan_id_owner FOREIGN KEY(user_id,plan_id) REFERENCES plans(user_id,id);
ALTER TABLE getcited_examples ADD FOREIGN KEY(owner_id,config_id) REFERENCES configs(user_id,id);
ALTER TABLE getcited_examples ADD FOREIGN KEY(owner_id,run_id) REFERENCES runs(user_id,id);
ALTER TABLE getcited_examples ADD FOREIGN KEY(owner_id,plan_id) REFERENCES plans(user_id,id);
ALTER TABLE getcited_examples ADD FOREIGN KEY(owner_id,thread_id) REFERENCES threads(user_id,id);
ALTER TABLE getcited_examples ADD COLUMN lease_id uuid;
ALTER TABLE getcited_examples ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE TABLE getcited_storage_totals(scope text PRIMARY KEY,bytes bigint NOT NULL DEFAULT 0 CHECK(bytes>=0),rows bigint NOT NULL DEFAULT 0 CHECK(rows>=0));
INSERT INTO getcited_storage_totals(scope) VALUES('global');
CREATE FUNCTION getcited_bound_storage() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE old_size bigint:=0; new_size bigint:=0; owner uuid; delta_rows integer:=0; totals record;
BEGIN
 IF TG_OP!='INSERT' THEN old_size=octet_length(to_jsonb(OLD)::text); END IF;
 IF TG_OP!='DELETE' THEN new_size=octet_length(to_jsonb(NEW)::text); END IF;
 IF new_size>524288 THEN RAISE EXCEPTION 'Workspace record limit reached' USING ERRCODE='54000'; END IF;
 IF TG_OP='DELETE' THEN owner=(to_jsonb(OLD)->>'user_id')::uuid;delta_rows=-1;
 ELSE owner=(to_jsonb(NEW)->>'user_id')::uuid;IF TG_OP='INSERT' THEN delta_rows=1; END IF; END IF;
 IF TG_OP='UPDATE' AND (to_jsonb(OLD)->>'user_id')::uuid IS DISTINCT FROM owner THEN RAISE EXCEPTION 'Workspace ownership cannot change'; END IF;
 UPDATE getcited_storage_totals SET bytes=bytes+new_size-old_size,rows=rows+delta_rows WHERE scope='global' RETURNING * INTO totals;
 IF totals.bytes>268435456 OR totals.rows>200000 THEN RAISE EXCEPTION 'Application storage capacity reached' USING ERRCODE='54000'; END IF;
 INSERT INTO getcited_storage_totals(scope) VALUES(owner::text) ON CONFLICT(scope) DO NOTHING;
 UPDATE getcited_storage_totals SET bytes=bytes+new_size-old_size,rows=rows+delta_rows WHERE scope=owner::text RETURNING * INTO totals;
 IF totals.bytes>8388608 OR totals.rows>20000 THEN RAISE EXCEPTION 'Workspace storage capacity reached' USING ERRCODE='54000'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
REVOKE ALL ON FUNCTION getcited_bound_storage() FROM PUBLIC;
CREATE TRIGGER configs_storage BEFORE INSERT OR UPDATE OR DELETE ON configs FOR EACH ROW EXECUTE FUNCTION getcited_bound_storage();
CREATE TRIGGER api_keys_storage BEFORE INSERT OR UPDATE OR DELETE ON api_keys FOR EACH ROW EXECUTE FUNCTION getcited_bound_storage();
CREATE TRIGGER runs_storage BEFORE INSERT OR UPDATE OR DELETE ON runs FOR EACH ROW EXECUTE FUNCTION getcited_bound_storage();
CREATE TRIGGER answers_storage BEFORE INSERT OR UPDATE OR DELETE ON answers FOR EACH ROW EXECUTE FUNCTION getcited_bound_storage();
CREATE TRIGGER sov_history_storage BEFORE INSERT OR UPDATE OR DELETE ON sov_history FOR EACH ROW EXECUTE FUNCTION getcited_bound_storage();
CREATE TRIGGER hallucinations_storage BEFORE INSERT OR UPDATE OR DELETE ON hallucinations FOR EACH ROW EXECUTE FUNCTION getcited_bound_storage();
CREATE TRIGGER citations_storage BEFORE INSERT OR UPDATE OR DELETE ON citations FOR EACH ROW EXECUTE FUNCTION getcited_bound_storage();
CREATE TRIGGER plans_storage BEFORE INSERT OR UPDATE OR DELETE ON plans FOR EACH ROW EXECUTE FUNCTION getcited_bound_storage();
CREATE TRIGGER progress_snapshots_storage BEFORE INSERT OR UPDATE OR DELETE ON progress_snapshots FOR EACH ROW EXECUTE FUNCTION getcited_bound_storage();
CREATE TRIGGER reports_storage BEFORE INSERT OR UPDATE OR DELETE ON reports FOR EACH ROW EXECUTE FUNCTION getcited_bound_storage();
CREATE TRIGGER threads_storage BEFORE INSERT OR UPDATE OR DELETE ON threads FOR EACH ROW EXECUTE FUNCTION getcited_bound_storage();
CREATE TRIGGER thread_messages_storage BEFORE INSERT OR UPDATE OR DELETE ON thread_messages FOR EACH ROW EXECUTE FUNCTION getcited_bound_storage();
CREATE TRIGGER memories_storage BEFORE INSERT OR UPDATE OR DELETE ON memories FOR EACH ROW EXECUTE FUNCTION getcited_bound_storage();
CREATE TRIGGER tracker_items_storage BEFORE INSERT OR UPDATE OR DELETE ON tracker_items FOR EACH ROW EXECUTE FUNCTION getcited_bound_storage();
