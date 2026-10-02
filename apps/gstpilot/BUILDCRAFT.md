# Collection setup and verification

This is an edited source snapshot in AI Buildcraft. [SOURCE.json](SOURCE.json) records the original repository and committed revision. Source repositories and their deployments were not changed. No credentials, production state, source Git history or private deployment receipts are included.

## Run and scope

Follow [README.md](README.md): Node 24, pinned pnpm, a fresh PostgreSQL/pgvector database and the eleven ordered files in `supabase/migrations`. Use `.env.example` for the loopback preview, a new account secret, a restricted runtime role and `GSTPILOT_MOCK_MODE=1` with blank provider keys.

The bundled filing example is explicitly historical and bounded. Neither the snapshot nor these tests establish current GST rules or tax liability. Personal certificate paths, old project notes and an annotated private walkthrough were omitted.

## Checks on 2026-10-02

- `tsc --noEmit`: passed.
- `npm run test:providers`: 12 passed.
- `node --import tsx --test tests/client-identity.test.ts tests/client-citations.test.ts`: 11 passed.

The client tests use Node's test runner; they are not Vitest suites. Database migrations, corpus ingestion, current-law review, live retrieval and provider-backed answer evaluations were not re-run.

Unless stated as a fresh installation, checks reused already-installed dependency runtimes through ignored local links while loading the exported source. Those links, build caches and local test state are not included in Git. No paid provider calls were made. Portfolio screenshots, where present, are historical UI illustrations rather than proof of this snapshot's live-provider behavior.
