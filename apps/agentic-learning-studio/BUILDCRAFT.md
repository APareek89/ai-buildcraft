# Collection setup and verification

This is an edited source snapshot in AI Buildcraft. [SOURCE.json](SOURCE.json) records the original repository and committed revision. Source repositories and their deployments were not changed. No credentials, production state, source Git history or private deployment receipts are included.

## Run and scope

The supported first run is the database-free fixture demo in [README.md](README.md): `npm ci --ignore-scripts`, then `npm run demo`; open `http://127.0.0.1:5070`. The launcher removes inherited credentials and serves prepared content. It does not invoke a provider or read `.env`.

The full authenticated application additionally needs PostgreSQL/pgvector with the original base schema, private S3 storage and runtime configuration. The retained ownership migration assumes existing tables and is not a fresh-schema installer. [Full configuration](docs/auth-and-launch.md) records that boundary. Historical deployment instructions, copying scripts, private operational logs and search-console verification were omitted.

## Checks on 2026-10-02

- `npm run check`: passed.
- `npm run test:provider-wire`: 4 passed.
- `npm run test:embedding-batches`: 5 passed.
- `npm run test:boundaries`: 3 passed.
- `npm run demo` plus `npm run test:demo` on an isolated loopback port: all 100 fixture HTML pages rendered; overview → build → reading → progress → download passed; paid/mutation routes rejected.

Full account/database integration, object storage and live lesson generation were not exercised.

Unless stated as a fresh installation, checks reused already-installed dependency runtimes through ignored local links while loading the exported source. Those links, build caches and local test state are not included in Git. No paid provider calls were made. Portfolio screenshots, where present, are historical UI illustrations rather than proof of this snapshot's live-provider behavior.
