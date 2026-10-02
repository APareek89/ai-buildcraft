import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var _jhalakPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var _jhalakSchemaReady: Promise<void> | undefined;
}

export function getPool(): Pool {
  if (!global._jhalakPool) {
    global._jhalakPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      // Supabase's pgbouncer kills idle connections; recycle ours first and keep
      // sockets alive so we don't get handed dead clients on the next poll.
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 10_000,
      keepAlive: true,
      ssl: process.env.DATABASE_SSL === "disable" ? false : { rejectUnauthorized: true },
    });
    global._jhalakPool.on("error", (e) => console.error("[pg pool]", e.message));
  }
  return global._jhalakPool;
}

const BOOTSTRAP_SQL = `
create schema if not exists jhalak;

create table if not exists jhalak.businesses (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  category text not null default 'boutique',
  city text default '',
  phone text default '',
  whatsapp text default '',
  language text not null default 'english',
  template text not null default 'elegant',
  status text not null default 'draft',
  created_at timestamptz not null default now()
);

create table if not exists jhalak.site_content (
  business_id uuid primary key references jhalak.businesses(id) on delete cascade,
  content jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists jhalak.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references jhalak.businesses(id) on delete cascade,
  title text not null default '',
  description text not null default '',
  tags text[] not null default '{}',
  price_text text not null default '',
  original_url text not null default '',
  processed_url text not null default '',
  status text not null default 'processing',
  error text not null default '',
  visible boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists jhalak.reels (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references jhalak.businesses(id) on delete cascade,
  product_id uuid references jhalak.products(id) on delete set null,
  variant text not null default 'showcase',
  prompt text not null default '',
  video_url text not null default '',
  status text not null default 'generating',
  error text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists jhalak.leads (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references jhalak.businesses(id) on delete cascade,
  name text not null default '',
  phone text not null default '',
  message text not null default '',
  source text not null default 'website',
  created_at timestamptz not null default now()
);

create table if not exists jhalak.quotas (
  business_id uuid primary key references jhalak.businesses(id) on delete cascade,
  reel_packs_used int not null default 0,
  photos_used int not null default 0
);

create table if not exists jhalak.media (
  id uuid primary key default gen_random_uuid(),
  mime text not null default 'image/jpeg',
  bytes bytea not null,
  created_at timestamptz not null default now()
);

alter table jhalak.products add column if not exists category text not null default '';
alter table jhalak.products add column if not exists discount_pct int not null default 0;
alter table jhalak.businesses add column if not exists logo_url text not null default '';

create table if not exists jhalak.users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text not null default '',
  password_hash text not null,
  created_at timestamptz not null default now()
);
alter table jhalak.businesses add column if not exists owner_id uuid references jhalak.users(id);
alter table jhalak.reels add column if not exists kind text not null default 'video';
-- v6: AI image-generation budget (hero/section/product t2i). Capped per business.
alter table jhalak.quotas add column if not exists gens_used int not null default 0;
`;

export function ensureSchema(): Promise<void> {
  if (!global._jhalakSchemaReady) {
    global._jhalakSchemaReady = getPool()
      .query(BOOTSTRAP_SQL)
      .then(() => {})
      .catch((e) => {
        global._jhalakSchemaReady = undefined;
        throw e;
      });
  }
  return global._jhalakSchemaReady;
}

// Connection-level failures happen before the statement executes (dead pooled
// client), so one retry on a fresh client is safe even for writes.
function isConnectionError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  const code = (e as { code?: string })?.code || "";
  return (
    ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "57P01", "XX000"].includes(code) ||
    /Connection terminated|client has encountered a connection error|Connection ended unexpectedly/i.test(msg)
  );
}

export async function q<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  await ensureSchema();
  try {
    const r = await getPool().query(text, params as never[]);
    return r.rows as T[];
  } catch (e) {
    if (!isConnectionError(e)) throw e;
    const r = await getPool().query(text, params as never[]);
    return r.rows as T[];
  }
}

export type TxQuery = <T = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<T[]>;

/**
 * Run `fn` inside a single transaction (BEGIN/COMMIT, ROLLBACK on throw). Use for
 * multi-write create flows so a mid-sequence failure leaves no orphan rows. `fn`
 * receives a query bound to the transaction's client — do NOT use the shared `q()`
 * inside it (that would run on a different, non-transactional connection).
 */
export async function withTx<T>(fn: (query: TxQuery) => Promise<T>): Promise<T> {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const query: TxQuery = async (text, params = []) =>
      (await client.query(text, params as never[])).rows as never[];
    const out = await fn(query);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "business";
}
