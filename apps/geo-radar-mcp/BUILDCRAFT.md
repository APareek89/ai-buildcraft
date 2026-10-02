# Collection setup and verification

This is an edited source snapshot in AI Buildcraft. [SOURCE.json](SOURCE.json) records the original repository and committed revision. Source repositories and their deployments were not changed. No credentials, production state, source Git history or private deployment receipts are included.

## Run and scope

Follow [README.md](README.md): install the pinned pnpm workspace, build it, copy `.env.example` with provider keys left empty, then `GEO_STORE=memory pnpm dev:mcp`. This serves a deterministic mock panel over stdio and clears data on restart. For a client configuration use the absolute path to the built MCP server and `GEO_STORE=memory`.

The optional HTTP/PostgreSQL/queue setup requires your own resources; see [hosting notes](docs/HOSTING.md). Northstar is a fictional example. API-panel answers do not establish consumer ChatGPT or Google AI Overview rankings. No hosted OAuth or connector configuration is included.

## Checks on 2026-10-02

- Fresh `pnpm install --frozen-lockfile --ignore-scripts`: passed.
- `pnpm typecheck`: passed across 5 packages.
- `pnpm test`: 68 passed (31 core, 27 MCP server, 7 database fixture, 3 shared).
- `pnpm build`: passed for MCP server and worker.

Tests use deterministic mocked panels and fixture databases. No paid provider, production OAuth deployment, persistent database migration or live queue worker was validated.

Unless stated as a fresh installation, checks reused already-installed dependency runtimes through ignored local links while loading the exported source. Those links, build caches and local test state are not included in Git. No paid provider calls were made. Portfolio screenshots, where present, are historical UI illustrations rather than proof of this snapshot's live-provider behavior.
