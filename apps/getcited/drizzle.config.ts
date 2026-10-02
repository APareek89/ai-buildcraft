import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

// Load .env.local for drizzle-kit CLI (generate/migrate/push).
config({ path: ".env.local" });

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Supabase manages the auth/storage schemas; only touch our public tables.
  schemaFilter: ["public"],
  verbose: true,
  strict: true,
});
