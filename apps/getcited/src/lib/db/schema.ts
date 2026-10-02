import {
  pgTable,
  uuid,
  text,
  timestamp,
  real,
  numeric,
  integer,
  boolean,
  date,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * GetCited ordinary PostgreSQL schema. Auth identities and owner-parent keys
 * are installed by migrations/001_portfolio.sql. Historical Supabase migrations
 * under drizzle/ are retained for source history only.
 *
 * Every business query explicitly binds the verified owner.
 */

// profiles ↔ auth.users (id is the auth user id; row auto-created by a trigger)
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  email: text("email"),
  displayName: text("display_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Versioned config, one active row per user. New saves append a new version.
export const configs = pgTable(
  "configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    version: integer("version").notNull().default(1),
    prepared: boolean("prepared").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    brandUrl: text("brand_url").notNull(),
    brandName: text("brand_name"),
    description: text("description"),
    brandDomains: text("brand_domains").array().notNull().default([]),
    competitors: text("competitors").array().notNull().default([]),
    // Parallel to competitors: the matching domain per competitor ("" when unknown).
    // Names feed brand-mention matching; domains feed citation attribution.
    competitorDomains: text("competitor_domains").array().notNull().default([]),
    queries: text("queries").array().notNull().default([]),
    budgetUsd: real("budget_usd").notNull().default(0),
    teamSize: integer("team_size").notNull().default(1),
    timelineWeeks: integer("timeline_weeks").notNull().default(8),
    // we_serve | self_serve
    mode: text("mode").notNull().default("we_serve"),
    // trust_us | own_instance | code_base (Self Serve platform choice)
    platformOption: text("platform_option"),
    instanceUrl: text("instance_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("configs_user_active_idx").on(t.userId, t.isActive),
    // FMEA #3: prevent concurrent saves from duplicating a version number.
    uniqueIndex("configs_user_version_unique").on(t.userId, t.version),
  ],
);

// Opt-in encrypted BYO keys (AES-GCM). Plaintext is NEVER stored or logged.
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    provider: text("provider").notNull(),
    ciphertext: text("ciphertext").notNull(),
    iv: text("iv").notNull(),
    authTag: text("auth_tag").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("api_keys_user_provider_idx").on(t.userId, t.provider)],
);

// A panel run (measure share-of-voice). Mirrors geo-radar panel_runs + user scope.
export const runs = pgTable(
  "runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    configId: uuid("config_id"),
    prepared: boolean("prepared").notNull().default(false),
    brand: text("brand").notNull(),
    brandDomains: text("brand_domains").array().notNull().default([]),
    competitors: text("competitors").array().notNull().default([]),
    panel: text("panel").array().notNull().default([]),
    // queued | running | completed | failed
    status: text("status").notNull().default("queued"),
    costUsd: numeric("cost_usd", { precision: 18, scale: 10, mode: "number" }).notNull().default(0),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("runs_user_created_idx").on(t.userId, t.createdAt)],
);

export const answers = pgTable(
  "answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id").notNull(),
    userId: uuid("user_id").notNull(),
    model: text("model").notNull(),
    prompt: text("prompt").notNull(),
    rawAnswer: text("raw_answer").notNull(),
    mentions: text("mentions").array().notNull().default([]),
    citedDomains: text("cited_domains").array().notNull().default([]),
    sentiment: text("sentiment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("answers_run_idx").on(t.runId)],
);

export const sovHistory = pgTable(
  "sov_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    configId: uuid("config_id"),
    runId: uuid("run_id"),
    date: date("date").notNull(),
    sov: real("sov").notNull(),
    citationShare: real("citation_share"),
    sentimentScore: real("sentiment_score"),
  },
  (t) => [index("sov_history_user_date_idx").on(t.userId, t.date)],
);

export const hallucinations = pgTable("hallucinations", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").notNull(),
  userId: uuid("user_id").notNull(),
  claim: text("claim").notNull(),
  contradictsFact: text("contradicts_fact").notNull(),
  severity: text("severity").notNull(),
  model: text("model"),
  prompt: text("prompt"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Crawled citation evidence (Diagnose/Plan/Track). Cached to avoid re-crawling.
export const citations = pgTable(
  "citations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    runId: uuid("run_id"),
    url: text("url").notNull(),
    domain: text("domain"),
    // roundup | review | editorial | youtube | reddit | owned | social | other
    sourceType: text("source_type").notNull().default("other"),
    citesCompetitor: text("cites_competitor"),
    mentionsBrand: boolean("mentions_brand").notNull().default(false),
    signals: jsonb("signals").$type<Record<string, unknown>>(),
    title: text("title"),
    excerpt: text("excerpt"),
    crawledAt: timestamp("crawled_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("citations_user_url_idx").on(t.userId, t.url)],
);

// A costed action plan + its modeled projection.
export const plans = pgTable(
  "plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    configId: uuid("config_id"),
    configVersion: integer("config_version"),
    runId: uuid("run_id"),
    prepared: boolean("prepared").notNull().default(false),
    tactics: jsonb("tactics").$type<unknown[]>().notNull().default([]),
    projection: jsonb("projection").$type<Record<string, unknown>>(),
    // Week-by-week execution roadmap (LLM-expanded; manager-shareable in the docs).
    // Legacy rows store RoadmapWeek[]; current rows store {weeks, guidelines}.
    roadmap: jsonb("roadmap").$type<unknown>(),
    targetCitationShare: real("target_citation_share"),
    timelineWeeks: integer("timeline_weeks"),
    // high | medium | low
    confidence: text("confidence"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("plans_user_created_idx").on(t.userId, t.createdAt)],
);

// Track: what the user actually did + verification evidence, diffed vs the plan.
export const progressSnapshots = pgTable("progress_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  planId: uuid("plan_id").notNull(),
  doneTactics: jsonb("done_tactics").$type<unknown[]>().notNull().default([]),
  evidence: jsonb("evidence").$type<Record<string, unknown>>(),
  sov: real("sov"),
  citationShare: real("citation_share"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Generated report artifacts (HTML/PDF/Excel) with their Supabase Storage path.
export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    runId: uuid("run_id"),
    planId: uuid("plan_id"),
    // benchmark | diagnose | plan | track
    kind: text("kind").notNull(),
    // html | pdf | excel
    format: text("format").notNull(),
    title: text("title"),
    storagePath: text("storage_path"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("reports_user_created_idx").on(t.userId, t.createdAt)],
);

// ── Agent threads + memory ───────────────────────────────────────────────────
export const threads = pgTable(
  "threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    prepared: boolean("prepared").notNull().default(false),
    title: text("title").notNull().default("New thread"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("threads_user_updated_idx").on(t.userId, t.updatedAt)],
);

// Full UIMessage parts stored as jsonb so tool-call cards replay on reload.
export const threadMessages = pgTable(
  "thread_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id").notNull(),
    userId: uuid("user_id").notNull(),
    messageId: text("message_id").notNull(),
    role: text("role").notNull(),
    parts: jsonb("parts").$type<unknown[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("thread_messages_thread_idx").on(t.threadId, t.createdAt)],
);

// Agent memory: working (current focus/goals), procedural (how the user likes
// things done), structural (durable facts about brand/market). Injected into the
// system prompt each turn; written via the save_memory tool.
export const memories = pgTable(
  "memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    // working | procedural | structural
    kind: text("kind").notNull(),
    content: text("content").notNull(),
    source: text("source"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("memories_user_kind_idx").on(t.userId, t.kind)],
);

// Tracker: an approved plan's roadmap actions as editable execution items.
// Populated by the approve_plan tool (due_date = plan creation + week offset);
// the user updates status/remarks on /tracker; track_progress reads it as the
// PRIMARY progress source.
export const trackerItems = pgTable(
  "tracker_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    planId: uuid("plan_id").notNull(),
    week: integer("week").notNull(),
    dueDate: date("due_date").notNull(),
    action: text("action").notNull(),
    ownerRole: text("owner_role"),
    hours: real("hours"),
    deliverable: text("deliverable"),
    // not_started | in_progress | done | blocked
    status: text("status").notNull().default("not_started"),
    remarks: text("remarks"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tracker_items_user_plan_idx").on(t.userId, t.planId, t.week)],
);

// ── MCP OAuth (self-hosted authorization server; ported from geo-radar-mcp) ──
// Pre-auth tables: RLS is enabled with NO policies (deny-all for anon/authed);
// only the server-side Drizzle service client touches them. DB-backed (not
// in-memory like geo-radar) so DCR clients + codes survive serverless restarts.
export const mcpOauthClients = pgTable("mcp_oauth_clients", {
  clientId: text("client_id").primaryKey(),
  name: text("name"),
  redirectUris: text("redirect_uris").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const mcpOauthCodes = pgTable("mcp_oauth_codes", {
  code: text("code").primaryKey(),
  clientId: text("client_id").notNull(),
  userId: uuid("user_id").notNull(),
  redirectUri: text("redirect_uri").notNull(),
  codeChallenge: text("code_challenge").notNull(),
  scopes: text("scopes").array().notNull().default([]),
  resource: text("resource"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export type ProfileRow = typeof profiles.$inferSelect;
export type ConfigRow = typeof configs.$inferSelect;
export type ConfigInsert = typeof configs.$inferInsert;
export type ApiKeyRow = typeof apiKeys.$inferSelect;
export type RunRow = typeof runs.$inferSelect;
export type AnswerRow = typeof answers.$inferSelect;
export type SovHistoryRow = typeof sovHistory.$inferSelect;
export type HallucinationRow = typeof hallucinations.$inferSelect;
export type CitationRow = typeof citations.$inferSelect;
export type PlanRow = typeof plans.$inferSelect;
export type ProgressSnapshotRow = typeof progressSnapshots.$inferSelect;
export type ReportRow = typeof reports.$inferSelect;
export type TrackerItemRow = typeof trackerItems.$inferSelect;
