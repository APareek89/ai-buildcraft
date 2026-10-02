# Verification record

Review edition assembled on **2 October 2026**. Checks below apply to this collection's source snapshots. They do not certify the earlier deployments or establish production readiness.

## Collection and learning pages

Run from the repository root:

```bash
python3 scripts/validate_collection.py
python3 scripts/test_learning_bundle.py
node --test scripts/test_learning_viewer.js
python3 scripts/build_learning_guide.py --check
gitleaks git --pre-commit --staged --redact=100 --no-banner
```

The collection validator checks catalog targets, entry READMEs/provenance, root documentation links, forbidden company markers in app/lab/learning source, platform-viewer state, selected credential patterns, machine paths, oversized assets and notebook outputs. It also runs the learning validator: local HTML references, document structure, Python syntax and inline JavaScript syntax when Node is available.

Gitleaks scans the exact staged payload before the first commit. Its only configured exclusions are two explicitly synthetic Langfuse test values used to verify redaction. Runtime credentials, dependency directories, model-training caches, original Claude exports and browser account state are outside the staged payload.

The learning collection now contains **50 selected entries: 24 visual guides and 26 notebook/HTML labs**. The depth review removed 129 diagram cards and 22 other entries. Seven retained topics came from the Claude artifact library: six sanitized imports and one tree-boosting lesson rebuilt with synthetic data. See [curation criteria](../learn/CURATION.md) for the editorial bar and the two corrected experiment protocols.

Collection validation **passed** for 50 learning entries and 26 ML notebooks. All 48 notebooks across the complete repository have cleared execution outputs. Full-history Gitleaks scanning of the original two commits found no leaks; publication changes are scanned again before committing.

The regularization and Gaussian-process notebooks were corrected and rerun offline, regenerating their figures. Their checks verify split/selection boundaries and equal-budget comparison invariants respectively. Other retained notebook experiments were reviewed but not rerun for this curation; the static checks below do not execute training.

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

## Public learning edition

The owner approved public publication on 2 October 2026 after consolidation of the selected lessons. The single-file guide contains all 50 lessons, 26 paired notebook downloads, 26 figures, a glossary, and pinned offline math/code libraries with their license texts. Its nine subject groups and three ordered routes are built from an explicit mapping that requires every selected lesson exactly once.

Nine bundle tests check source and asset hashes, all decoded text for publication hygiene, inline JavaScript syntax, deterministic builds, rejection of unexpected external dependencies and cloud-lesson navigation when browser storage fails. Seven viewer regression tests cover malformed hashes, lesson/fragment routing, sequence boundaries, clean offline exports, message-source validation, keyboard focus and unavailable storage. Clipboard fallback tests cover twelve success/denial/missing-API/error cases across three exported lessons. Agentic Learning Studio also passed TypeScript and two support-mail tests after removing the original owner mailbox as a runtime default.

Browser smoke checks opened all 50 lessons inside the isolated reader. Math rendering, embedded figures, search, format and category filters, learning paths, previous/next controls, progress, notebook downloads and offline export are checked separately. The downloaded HTML was parsed to confirm all 50 payloads and all 26 notebooks, with no live iframe or user progress serialized. A downloaded notebook matched its source byte-for-byte. Direct `file://` opening was blocked by the automation browser URL policy, so browser rendering was verified through the local HTTP preview. Source pages remain editable; CI rejects a stale generated guide. Hosted grading/generation features from five original exports are explicitly disabled or ungraded in the offline edition.

These checks establish packaging and tested interactions, not the factual accuracy of every statement or successful execution of every notebook. Live providers and important application quickstarts still need reproduction on the user's own configured account. Existing recorded numerical results remain historical unless independently reproduced.
