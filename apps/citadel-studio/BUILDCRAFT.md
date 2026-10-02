# Collection setup and verification

This is an edited source snapshot in AI Buildcraft. [SOURCE.json](SOURCE.json) records the original repository and committed revision. Source repositories and their deployments were not changed. No credentials, production state, source Git history or private deployment receipts are included.

## Run and scope

Follow [README.md](README.md): install with `npm ci`, configure a fresh local PostgreSQL database and an at-least-32-character random `AUTH_SECRET`, keep both spend limits at zero and `WORKBENCH_PROVIDER_MODE=mock`, then `npm run build` and `node --env-file=.env --import tsx server/index.ts`. Open `http://127.0.0.1:8951`. Local bootstrap creates account tables and needs schema creation permission; production requires a separately reviewed role/migration plan.

The export retains `server/integration-secrets.ts`, a runtime redaction implementation with no credential values. Removing it by filename would break imports. Legacy deployment receipts, personal workbench notes and private hosting diagrams were omitted; architecture documentation now describes the retained runtime.

## Checks on 2026-10-02

- `npm run typecheck`: passed.
- `npm run build`: passed (Vite frontend and compiled server).
- `npm test` after building: 208 passed, 4 skipped, 0 failed (212 total).

The suite covers isolated HTTP boundaries, redaction, ownership, exports and mocked providers. Four source-adapter checks require the original external source checkout and were skipped. Set `WORKBENCH_TEST_SOURCE_REPO` to the explicitly reviewed original checkout to opt into those adapter checks. The first test attempt without a frontend build correctly failed; the documented order now builds before testing. Fresh account/database onboarding and real-provider execution were not revalidated here.

Unless stated as a fresh installation, checks reused already-installed dependency runtimes through ignored local links while loading the exported source. Those links, build caches and local test state are not included in Git. No paid provider calls were made. Portfolio screenshots, where present, are historical UI illustrations rather than proof of this snapshot's live-provider behavior.
