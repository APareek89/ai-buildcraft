import { loadRootEnv } from "@blindspot/shared";
import { defineConfig } from "drizzle-kit";

// Load the monorepo-root .env so drizzle-kit sees DATABASE_URL.
loadRootEnv(import.meta.url);

// `db:generate` reads the schema and writes SQL migrations offline (no DB needed).
// `db:push` / `db:studio` require DATABASE_URL (provided by the secrets session).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
  // Only manage/introspect Blindspot's own schema — the DB may be shared.
  schemaFilter: ["blindspot"],
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
