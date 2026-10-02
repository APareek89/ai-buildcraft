/**
 * One-time local bootstrap: create a project, issue a gateway key (printed ONCE),
 * and import any provider keys found in the environment (encrypted at rest).
 *
 *   pnpm --filter @blindspot/gateway bootstrap
 *
 * Requires DATABASE_URL + ENCRYPTION_KEY (and at least one provider key) in .env.
 */
import { randomBytes } from "node:crypto";
import { apiKeys, getDb, projects, providerKeys } from "@blindspot/db";
import { encryptSecret, loadRootEnv, type Provider } from "@blindspot/shared";
import { hashKey } from "../auth";

loadRootEnv(import.meta.url);

const PROVIDER_ENV: Array<[Provider, string]> = [
  ["anthropic", "ANTHROPIC_API_KEY"],
  ["openai", "OPENAI_API_KEY"],
  ["gemini", "GEMINI_API_KEY"],
  ["groq", "GROQ_API_KEY"],
  ["hf", "HF_TOKEN"],
  ["fireworks", "FIREWORKS_API_KEY"],
];

async function main() {
  const db = getDb();

  const project = (
    await db.insert(projects).values({ userId: "local-dev", name: "Local Dev" }).returning()
  )[0]!;

  const rawKey = `bs_live_${randomBytes(24).toString("hex")}`;
  await db.insert(apiKeys).values({
    projectId: project.id,
    prefix: rawKey.slice(0, 12),
    keyHash: hashKey(rawKey),
  });

  const imported: Provider[] = [];
  for (const [provider, envName] of PROVIDER_ENV) {
    const value = process.env[envName];
    if (!value) continue;
    await db
      .insert(providerKeys)
      .values({ projectId: project.id, provider, encryptedKey: encryptSecret(value) })
      .onConflictDoNothing();
    imported.push(provider);
  }

  console.log("✓ project id     :", project.id);
  console.log("✓ providers saved:", imported.join(", ") || "(none — set a provider key in .env)");
  console.log("\n⚠ gateway key (save now, shown once):\n  " + rawKey + "\n");
  console.log("Use it as:  Authorization: Bearer " + rawKey.slice(0, 12) + "…");
  process.exit(0);
}

main().catch((err) => {
  console.error("bootstrap failed:", (err as Error).message);
  process.exit(1);
});
