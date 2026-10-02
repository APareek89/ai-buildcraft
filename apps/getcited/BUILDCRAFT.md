# Collection setup and verification

This is an edited source snapshot in AI Buildcraft. [SOURCE.json](SOURCE.json) records the original repository and committed revision. Source repositories and their deployments were not changed. No credentials, production state, source Git history or private deployment receipts are included.

## Run and scope

Follow [README.md](README.md): Node 22+, pinned pnpm, a fresh PostgreSQL database initialized by `migrations/001_portfolio.sql`, restricted runtime credentials and a random account secret. Set the exact loopback origin from `.env.example`, enable mock mode and leave provider keys empty. The prepared visibility example is synthetic.

Fictional Northstar brand examples replace private brand-specific context. A sampled model API answer is evidence about that run, not a measurement of consumer search-product rankings. No live service is provisioned by this source snapshot.

## Checks on 2026-10-02

- `npm run typecheck`: passed.
- `npm test`: 73 passed across 11 files, 0 failed.

Tests cover request validation, scoring, orchestration and boundary behavior with test fixtures. Production build, fresh-database onboarding and real provider visibility measurements were not revalidated.

Unless stated as a fresh installation, checks reused already-installed dependency runtimes through ignored local links while loading the exported source. Those links, build caches and local test state are not included in Git. No paid provider calls were made. Portfolio screenshots, where present, are historical UI illustrations rather than proof of this snapshot's live-provider behavior.
