# Collection setup and verification

This is an edited source snapshot in AI Buildcraft. [SOURCE.json](SOURCE.json) records the original repository and committed revision. Source repositories and their deployments were not changed. No credentials, production state, source Git history or private deployment receipts are included.

## Run and scope

Follow the Python 3.11 and frontend setup in [README.md](README.md). Its explicit fixture command clears inherited environment variables, enables mock/in-memory storage, disables account gating and binds Uvicorn to `127.0.0.1:8600`. Prepared examples are fictional; they do not establish market facts.

Authenticated persistence is separate: PostgreSQL with `app/migrations/001_portfolio.sql`, account secrets and private versioned object storage. Private deployment and evaluation-history notes were omitted.

## Checks on 2026-10-02

- `python -m unittest discover -s tests -p test_backend_contracts.py`: 16 passed.
- `python -m unittest discover -s tests -p test_safe_network.py`: 9 passed.
- `python -m unittest discover -s tests -p test_upload_storage.py`: 6 passed.
- Frontend `npm test`: 13 passed.
- Frontend `npm run build`: passed (bundle-size warning only).

The separate HTTP-account harness needs an explicitly prepared disposable database/server and was not run. Paid research, real evidence quality and production storage were not validated.

Unless stated as a fresh installation, checks reused already-installed dependency runtimes through ignored local links while loading the exported source. Those links, build caches and local test state are not included in Git. No paid provider calls were made. Portfolio screenshots, where present, are historical UI illustrations rather than proof of this snapshot's live-provider behavior.
