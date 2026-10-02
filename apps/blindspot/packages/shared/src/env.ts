import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

/**
 * Load the monorepo-root `.env` into process.env, once.
 *
 * Walks up from the calling module to find `pnpm-workspace.yaml`, then loads the
 * sibling `.env`. Never throws when `.env` is absent — Phase 0 must run with a
 * blank environment. Pass `import.meta.url` from the caller.
 */
export function loadRootEnv(fromUrl: string): void {
  let dir = dirname(fileURLToPath(fromUrl));
  for (let i = 0; i < 8; i++) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) {
      config({ path: resolve(dir, ".env") });
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: default dotenv behavior (loads ./.env from cwd if present).
  config();
}

/** True if an env var is present and non-empty. Never returns the value itself. */
export function hasEnv(key: string): boolean {
  const v = process.env[key];
  return typeof v === "string" && v.length > 0;
}
