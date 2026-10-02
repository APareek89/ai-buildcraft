# Model Arena

Compare up to three Hugging Face models on the same prompts and reference material. Shuffle and anonymize completed answers, grade them with a selected model, inspect per-model averages and export JSON/CSV.

![Side-by-side model comparisons](../../assets/screenshots/model-arena.png)

## Local setup

Use Node 24 and a fresh local PostgreSQL database.

```bash
npm ci
cp .env.example .env.local
```

Fill in the new database URL/name, exact loopback web origin and an independently generated `AUTH_SECRET` of at least 32 characters. Keep `MODEL_ARENA_MOCK_MODE=1` and provider keys empty. On first startup the application applies its idempotent `migrations/001_portfolio.sql`; the local database role needs schema creation permission.

```bash
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Open **http://127.0.0.1:3000**, create a local account, then choose **Try with an example → Run all → Grade all**. Unchanged prepared prompts use cached answers and illustrative scores. They demonstrate the workflow and are not a model benchmark. Editable ordinary prompts are a separate path.

## Comparison boundaries

Prompt/reference imports have explicit count and size limits. Browser state is separated by verified account ID; it is not synchronized across devices. Grade keys entered in Configure remain in page memory and are sent only for an explicit authenticated request. Accuracy/helpfulness/format scores are model judgments, not factual proof. Stop prevents queued work; calls already dispatched may still finish.

The ordinary generation route needs funded Hugging Face access and a priced route. Grading uses its separately supplied Gemini/OpenAI/Claude key. No live generation or grading was run for this collection.

```bash
npm run test:client
npm run build
```

Backend integration tests require an isolated fixture database/server; do not run them against an existing account environment. [BUILDCRAFT.md](BUILDCRAFT.md) records the bounded verification. [SOURCE.json](SOURCE.json) identifies the source snapshot. Screenshot: historical portfolio illustration.
