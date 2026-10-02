CREATE TABLE "mcp_oauth_clients" (
	"client_id" text PRIMARY KEY NOT NULL,
	"name" text,
	"redirect_uris" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
--> statement-breakpoint
-- Already created by custom migration 0003; IF NOT EXISTS keeps this re-runnable.
CREATE UNIQUE INDEX IF NOT EXISTS "configs_user_version_unique" ON "configs" USING btree ("user_id","version");
--> statement-breakpoint
-- Lock the OAuth tables: RLS on, NO policies → anon/authenticated get nothing;
-- only the server-side service client (Drizzle, bypasses RLS) can touch them.
ALTER TABLE "mcp_oauth_clients" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "mcp_oauth_codes" ENABLE ROW LEVEL SECURITY;