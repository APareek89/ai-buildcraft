# Collection setup and verification

This is an edited source snapshot in AI Buildcraft. [SOURCE.json](SOURCE.json) records the original repository and committed revision. Source repositories and their deployments were not changed. No credentials, production state, source Git history or private deployment receipts are included.

## Run and scope

Follow [README.md](README.md): `npm ci --ignore-scripts`, then `DEMO_MODE=true npm run dev`; open `http://localhost:3000`. The deterministic demo needs neither a database nor provider keys. Live calibration/generation needs your own providers, PostgreSQL, Redis, private storage and separately running queue worker.

The collection updates Next.js to 16.3.8, Vitest to 4.1.11 and the PostCSS override to 8.5.28, plus compatible transitive lockfile fixes, after the fresh installation exposed security advisories. No major-version migration or forced audit fix was used. Examples of the upstream issues are [Next ImageResponse](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j) and [image optimization](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4). Historical deployment claims and private planning notes were omitted.

## Checks on 2026-10-02

- Fresh `npm ci --ignore-scripts`: installed the initial locked dependencies; dependency fixes subsequently updated the lockfile.
- `npm run typecheck`: passed after dependency changes.
- `npm test`: 29 passed across 8 files after dependency changes.
- `npm run build`: passed after the scoped dependency updates.
- `npm audit`: 0 known advisories after the scoped fixes (2026-10-02 registry response).

The app declares Node 22.x; these source checks ran on the available Node 24.8.0 host. Queue/Redis, database migrations, storage and real model calls were not exercised. The demo is deterministic and does not establish live image quality.

Unless stated as a fresh installation, checks reused already-installed dependency runtimes through ignored local links while loading the exported source. Those links, build caches and local test state are not included in Git. No paid provider calls were made. Portfolio screenshots, where present, are historical UI illustrations rather than proof of this snapshot's live-provider behavior.
