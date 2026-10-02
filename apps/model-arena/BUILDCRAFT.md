# Collection setup and verification

This is an edited source snapshot in AI Buildcraft. [SOURCE.json](SOURCE.json) records the original repository and committed revision. Source repositories and their deployments were not changed. No credentials, production state, source Git history or private deployment receipts are included.

## Run and scope

Follow [README.md](README.md): use Node 24, `npm ci`, a fresh local PostgreSQL database, a random Auth.js secret and `.env.local` with mock mode and zero spend. The app applies `migrations/001_portfolio.sql` at bootstrap, so the local database role needs schema creation permission. Start with `npm run dev -- --hostname 127.0.0.1 --port 3000` and choose the prepared comparison.

Generation and grading have separate provider configuration. The example does not imply that a current hosted model was called. Historical paid receipts and deployment notes were omitted.

## Checks on 2026-10-02

- `npm run test:client`: 29 passed, 0 failed.

These checks cover client state, stale-response rejection and comparison rendering helpers. Full backend/database integration, production build and live generation/grading were not re-run for this collection.

Unless stated as a fresh installation, checks reused already-installed dependency runtimes through ignored local links while loading the exported source. Those links, build caches and local test state are not included in Git. No paid provider calls were made. Portfolio screenshots, where present, are historical UI illustrations rather than proof of this snapshot's live-provider behavior.
