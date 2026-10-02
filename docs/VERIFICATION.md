# Verification record

Review edition assembled on **2 October 2026**. Checks below apply to this collection's source snapshots. They do not certify the earlier deployments or establish production readiness.

## Collection and learning pages

Run from the repository root:

```bash
python3 scripts/validate_collection.py
gitleaks git --pre-commit --staged --redact=100 --no-banner
```

The collection validator checks catalog targets, entry READMEs/provenance, root documentation links, forbidden company markers in app/lab/learning source, platform-viewer state, selected credential patterns, machine paths, oversized assets and notebook outputs. It also runs the learning validator: local HTML references, document structure, Python syntax and inline JavaScript syntax when Node is available.

Gitleaks scans the exact staged payload before the first commit. Its only configured exclusions are two explicitly synthetic Langfuse test values used to verify redaction. Runtime credentials, dependency directories, model-training caches, original Claude exports and browser account state are outside the staged payload.

Learning validation passed for **201 catalog entries, 204 HTML pages, 429 local references, 73 inline JavaScript scripts, and 43 ML notebooks**. Nine additional Claude topics were included: seven sanitized imports and two tree lessons rebuilt from scratch with deterministic synthetic data.

The collection browser is checked in the in-app browser for navigation, search, filters, image loading and responsive layout. The learning navigator and representative recovered lessons are checked interactively. Portfolio screenshots are reviewed as illustrations; they are historical captures, not fresh live-provider evidence.

## Gemini application migrations

| Application | Checks executed | Material limits |
|---|---|---|
| [Demo Studio](../apps/demo-studio/BUILDCRAFT.md) | 10 Gemini contracts; 5 synthetic-example checks; 444 stage/player cases; 24 upload checks; 3 smoke phases; 28 release-journey checks including browser behavior | Synthetic art and silent narration; no real image, speech or hosted-auth acceptance |
| [Plotline](../apps/plotline/BUILDCRAFT.md) | 308 Python tests passed, 4 FFmpeg skips; 22 Gemini contracts within the suite; 15 client contracts; TypeScript; fresh local database and authenticated API/BFF smoke | No new live media generation, cloud acceptance or visual-quality assessment |
| [Jhalak](../apps/jhalak/BUILDCRAFT.md) | 7 media HTTP contracts; TypeScript; Next.js production build | Full database/signup/generation/storefront journey not rerun |

The implementations use the documented Gemini image API and, for video, Veo. Tests cover request shape, parsing, polling, bounded failures and credential handling. **No paid model call was made for these migrations.** A provider contract test cannot establish model access, quota or generated-media quality for a particular account.

## Remaining applications, skills and labs

The additional application audit recorded the following checks. Each application has a `BUILDCRAFT.md` with commands and limits.

| Application | Local verification |
|---|---|
| Agentic Learning Studio | Typecheck; 12 provider/embedding/boundary tests; 100 fixture pages and full offline demo journey |
| Citadel Studio | Typecheck and build; 208 tests passed, 4 skipped |
| Market Research Agents | 44 backend/frontend tests; frontend build |
| Model Arena | 29 client tests |
| Blindspot | 12 focused client/session tests; SDK build |
| GSTPilot | Typecheck; 23 provider/identity/citation tests |
| GetCited | Typecheck; 73 tests |
| LLM Anatomy | 28 tests, including gradients and a small CPU training run; build; restored pinned model-asset integrity |
| Framewise | Typecheck; 29 tests; scoped dependency updates followed by zero known advisories in the current npm audit response |
| GEO Radar MCP | Fresh locked install; five-package typecheck; 68 tests; server and worker build |

Each exported application has its own setup, configuration and verification scope. Portability checks reuse available installed dependencies without distributing those directories. Source scripts that depended on private operational resources were removed or generalized. Export audits also restored required code/data that a conservative file filter had omitted.

Skill and lab verification passed: **Agentlane 25 tests; ESCI 29 passed and one tokenizer-dependent skip; Keel selftest with eight tools and an isolated synthetic brain; 60 Python sources parsed; 22 post-training/ESCI notebooks with cleared outputs; local Markdown links resolved.** The post-training audit covers 21 notebooks and 111 files.

Skill and lab packaging checks inspect local links, syntax, portable setup, notebook outputs and source notices. Training notebooks and historical experiments have not been rerun end to end. Live integrations such as analytics, payments, search, model APIs, databases and slide-rendering tools require the user's own configuration.

## Before a public release

The repository remains private. A separate owner review decides whether to publish it. Verify the selected live provider paths on an appropriately configured account, reproduce important quickstarts on a clean machine, and resolve any remaining factual, licensing or security issue relevant to the intended use. Existing recorded numerical results remain historical unless independently reproduced.
