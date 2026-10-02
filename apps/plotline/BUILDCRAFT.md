# Plotline: collection edition

## Provenance and scope

Exported from the author's `plotline-full` repository at commit `3cec4708763e91062f19772a19f7a70406afc54a`. The source checkout and existing deployment were left untouched. Its uncommitted local work is not part of this export. This directory is a clean source snapshot rather than a Git history transplant.

The collection includes the Next.js application, FastAPI/LangGraph orchestration, prompts, synthetic retrieval fixtures, retrieval package, database migration, existing tests and font licenses. Historical handoffs, private operational receipts, design documents/HTML, accounts, uploads, generated media, local credentials and cloud bootstrap scripts are omitted. Existing portfolio screenshots are illustrative historical UI captures, not migration verification.

## Implemented changes

The image/video path now uses Google's Gemini API directly. Native image requests contain a text prompt and optional inline reference bytes, `responseModalities`, and image aspect/size configuration. Responses are parsed across content parts, safety refusals are handled separately, and returned PNG/JPEG/WebP bytes are validated with Pillow before storage. Signed reference URLs and provider error prose are not logged.

Veo uses `predictLongRunning`, validates the returned operation path before polling, and downloads the generated MP4 with credentials confined to Google's API origin. Signed redirects are fetched without that key through the existing public-network safeguards. Up to two existing approved references map to start/end frames. Duration is snapped to 4/6/8 seconds and the returned metadata records that requested provider duration when local probing is unavailable. Only 9:16 and 16:9 video are accepted.

All media submissions retain account-scoped reservations. Ambiguous responses keep an uncertain outcome; no automatic retry or cross-provider failover can double-submit the work. Audio remains on the optional fal adapter. UI badges and cost handling refer to the actual Gemini provider; no USD conversion is fabricated.

Added an isolated PostgreSQL setup script and local preview launcher. The setup generates fresh private credentials, applies the schema as an operator, and gives the runtime role ordinary DML permissions. Machine-specific CA paths and preselected cloud resources are removed.

## Setup and runtime limits

Follow [README.md](README.md) for the exact free local setup. `scripts/setup-local.py --pg-bin /path/to/postgresql/bin` uses a fresh local PostgreSQL cluster and `.env.local`; it does not reuse an existing server or identity. All generated state is ignored by Git. The loopback preview enforces `MOCK_LLM=1`, `MOCK_MEDIA=1`, no provider keys and local fixture storage.

Real image/video generation requires a separately configured authenticated runtime with private versioned S3 storage. The source's provider-reference boundary intentionally accepts only owner-scoped, short-lived signed references. No alternative unowned URL upload path was introduced to simplify the demo. Real text additionally needs an OpenAI or Anthropic key. Gemini model availability, paid quota and visual fidelity require a subsequent authorized live test.

No claim is made that historical successful runs validate this provider migration. The synthetic retrieval corpus is teaching/demo material; it is not a production knowledge corpus. Account recovery email and social sign-in are not configured. Model choice remains an operator configuration. The existing lifetime operation allowances remain; this is not a subscription billing system.

## Official contracts checked

The migration was checked against Google's documentation on 2026-10-02:

- [Gemini generateContent image generation/editing](https://ai.google.dev/gemini-api/docs/generate-content/image-generation)
- [Veo generation, image frames, polling and download](https://ai.google.dev/gemini-api/docs/veo)

The adapter uses the documented REST contract without copying provider SDK source. `gemini-3.1-flash-image` is the default image model, `gemini-3-pro-image-preview` is the optional pro tier, and `veo-3.1-generate-preview` is the video default. Configuration is checked against supported adapter models before a paid request.

## Verification

Verified on 2026-10-02 using Python 3.12 and Node 24:

- Complete exported Python suite with a fresh, isolated PostgreSQL test database: **308 passed, 4 skipped**. The four skips require FFmpeg, which was absent from the validation environment.
- **22 direct Gemini mocked HTTP contract tests** cover native image generation/reference edits, HTTP errors, safety blocks, malformed/no image responses, no duplicate dispatch, Veo operation validation/poll/download, owner checks and byte persistence through the actual media router.
- `npm run typecheck`: passed.
- Node session, media-pricing and campaign-flow contracts: **15 passed**.
- Fresh local database bootstrap: passed; real restricted-role API/BFF health, anonymous CSRF session and compiled root redirect also passed using temporary local ports.
- Source scan: no former employer/provider identifiers or historical design HTML in this export. Font licenses remain with their assets.

The first post-sanitization full test run exposed a retrieval fixture that depended on the old default cloud table/region. The fixture now names its synthetic table explicitly, and stores respect an injected session's region; the final complete suite above passes.

No real provider request or paid generation has been performed. Browser visual acceptance, a production deployment and real Gemini/Veo visual quality remain unverified. FastAPI emits an existing startup-event deprecation warning; it does not fail these checks.
