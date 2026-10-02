# Plotline · campaigns you can review at every step

Turn a campaign brief into structured creative directions, image boards, consistent references, generated media and a downloadable campaign bundle. Each expensive stage waits for an explicit approval. A conversational workspace keeps the current artifact beside its reasoning and revision history.

![Plotline campaign workspace](../../assets/screenshots/plotline.png)

*Historical portfolio UI illustration. The Gemini migration has been verified with mocked HTTP contracts; this screenshot is not evidence of a paid Gemini generation.*

## What you can explore

- **An agent workflow with review gates:** brief → options → script/board → references → generation → quality review → delivery.
- **Reusable brand references:** products, people and environments can condition images; video accepts a start frame and an optional end frame.
- **Direct Gemini media:** native image generation/editing and Veo video generation, with bounded transport and explicit failure states.
- **Account separation:** authenticated sessions, request-bound internal API proofs, PostgreSQL row policies and owner-scoped media.
- **Free prepared examples:** clearly labelled synthetic campaigns exercise the interaction without model charges.

## Start a free local preview

Requires Python 3.12, Node 24 and PostgreSQL 16 or later. FFmpeg is optional for mock video/stitching; without it the preview labels video placeholders.

From this app directory:

```bash
python3.12 -m venv api/.venv
api/.venv/bin/pip install -r api/requirements.txt
api/.venv/bin/pip install -e 'api/rag/[test]'
npm ci --prefix web
python3 scripts/setup-local.py
bash scripts/dev-local.sh
```

If PostgreSQL is installed outside your `PATH`, pass `--pg-bin /path/to/postgresql/bin` to `setup-local.py`. It creates a **new isolated database** on port 54329, an ordinary runtime role, and independent random session/bridge secrets. Configuration lives in ignored `.env.local`; data lives in ignored `.local/`. It refuses to overwrite an existing setup. Stop the preview with Ctrl+C.

Open **http://127.0.0.1:3100**, create a local account with a password of at least 12 characters, and choose **Try with an example**. Email addresses are local identifiers: no email is sent. Keep real model credentials absent for this preview; its startup guard enforces that boundary.

## Use real generation

The free preview deliberately cannot dispatch paid work. A separate operator-managed authenticated runtime must provide PostgreSQL, verified database TLS, private versioned S3 media storage, exact web origin, `AUTH_SECRET`, and an independent `PLOTLINE_BRIDGE_SECRET`. Apply `migrations/001_portfolio.sql` as a separate schema owner and give the runtime role DML privileges only. The included Dockerfiles package the services, but do not provision that infrastructure.

Set `MOCK_MEDIA=0`, `PLOTLINE_MEDIA_PROVIDER=gemini` and `GEMINI_API_KEY` in the **API service environment**. No key goes to the browser. `api/.env.example` lists model overrides. Gemini handles images and video; audio remains an optional, separately configured fal route. Text agents support the existing OpenAI/Anthropic adapters and require their own key when `MOCK_LLM=0`.

Image edits send the prompt and owned reference bytes using Gemini `inlineData`; generated image bytes are validated and saved directly. Veo jobs are polled on a fixed Google origin. A timeout never silently triggers a second paid submission. Provider USD cost remains unknown unless independently reconciled; operation limits are not price quotes.

## Read the implementation

- `api/app/campaign.py`: campaign state and approval transitions.
- `api/app/gemini_client.py`: image and Veo REST contracts.
- `api/app/media_transport.py`: bounded HTTP, dispatch accounting and uncertain outcomes.
- `api/app/media_storage.py`: private immutable media and reference ownership.
- `api/tests/test_gemini_contract.py`: mocked wire contracts, safety blocks and failure accounting.
- `web/app/studio/thread/[threadId]/page.tsx`: conversation and artifact review workspace.

```bash
cd api
.venv/bin/python -m pytest
cd ../web
npm run typecheck
node --experimental-strip-types --test tests/client-session.test.mjs tests/media-pricing.test.mjs tests/campaign-flow.test.mjs
```

See [BUILDCRAFT.md](BUILDCRAFT.md) for migration evidence, provenance and limits. Useful contributions include richer provider contract fixtures, a simpler deploy recipe, real-generation visual acceptance examples using owned media, and reproducible retrieval evaluation.
