# Collection setup and verification

This is an edited source snapshot in AI Buildcraft. [SOURCE.json](SOURCE.json) records the original repository and committed revision. Source repositories and their deployments were not changed. No credentials, production state, source Git history or private deployment receipts are included.

## Run and scope

Follow [README.md](README.md) using the pinned pnpm workspace. Provision a fresh PostgreSQL database, apply the ordered `packages/db/drizzle/*.sql` files and `migrations/001_portfolio.sql`, then supply an application-scoped runtime role and fresh account secrets. Start gateway and dashboard separately with provider keys absent and inline evaluation configuration for the local example.

The SDK is a local workspace package; no hosted tarball or public registry release is promised. Legacy private-beta onboarding, product-planning notes and deployment receipts were omitted. Telemetry records only instrumented operations; it does not discover an entire source graph.

## Checks on 2026-10-02

- `node --import tsx --test apps/dashboard/tests/client-input.test.ts apps/dashboard/tests/client-session.test.ts apps/dashboard/tests/prepared-name.test.ts`: 12 passed.
- `node node_modules/typescript/bin/tsc -p packages/sdk/tsconfig.build.json`: passed.

The full monorepo build, fresh-account/database integration, external telemetry delivery and provider-backed evaluations were not run. Workspace dependencies were reused only for these bounded source checks.

Unless stated as a fresh installation, checks reused already-installed dependency runtimes through ignored local links while loading the exported source. Those links, build caches and local test state are not included in Git. No paid provider calls were made. Portfolio screenshots, where present, are historical UI illustrations rather than proof of this snapshot's live-provider behavior.
