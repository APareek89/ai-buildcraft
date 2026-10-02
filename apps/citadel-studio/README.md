# Citadel Studio

Map an agent codebase, design its workflow, inspect recorded runs and turn failures into evaluations. Citadel distinguishes source-derived relationships from events actually observed during a run; hidden supporting nodes remain inspectable.

![Agent workflow workbench](../../assets/screenshots/citadel-studio.png)

## Run locally

Requires Node 22+ and a fresh local PostgreSQL database.

```bash
npm ci
cp .env.example .env
```

Set `DATABASE_URL` to your new local database and `AUTH_SECRET` to a fresh random value of at least 32 characters. Keep `WORKBENCH_PROVIDER_MODE=mock`, fixture storage and zero spending limits. The application initializes its two account tables, so this local database role needs schema creation permission. That bootstrap is not a least-privilege production migration.

```bash
npm run build
node --env-file=.env --import tsx server/index.ts
```

Open **http://127.0.0.1:8951**, create a local account and choose **Try with an example**. **Run cached workflow** executes the scheduler with prepared responses and records events without model charges. Source import alone does not execute the imported repository.

## What to inspect

- **Build:** editable agents, prompts, checks, schemas and edges, bounded execution and runnable exports.
- **Connect & Debug:** source-backed maps, filtered imports and instrumented observations.
- **Red Team:** finite probe plans with reproduced, suspected and inconclusive findings.
- **Model Lab and Evals:** fixed inputs, per-slot failures, deterministic assertions and comparable reports.

See [connection setup](docs/CONNECTIONS.md), [architecture](docs/ARCHITECTURE_FLOW.md) and [collection evidence](BUILDCRAFT.md). Optional private-repository/provider keys stay in server-side sessions. Arbitrary code requires the documented sandbox; unavailable execution capabilities fail closed. Static discovery does not establish complete runtime coverage.

```bash
npm run typecheck
npm run build
npm test
```

The screenshot is a historical portfolio illustration. No paid source mapping, real-provider workflow or production deployment was validated for this collection. Provenance is recorded in [SOURCE.json](SOURCE.json).
