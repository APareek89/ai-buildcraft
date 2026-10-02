# FMEA — the scan protocol

Read this fully before every scan. The value of FMEA is **systematic coverage** — the
obvious catches are free; the discipline of walking every category against real product
context is what finds the webhook race and the missing backpressure.

## 1. Input collection

**Code context** (by trigger):
- `on_pre_commit` → `git diff --staged`
- `on_feature_complete` → `git diff main...HEAD` (or the repo's default branch)
- `smart_suggest` / manual → files touched in the current session (fall back to
  `git diff HEAD` + recent commits if the session view is incomplete)

**Product context — critical, never skip:**
- Read `context_sources.prd_path` from `.power-coding/config.json`. Not set? Look for a
  brief/PRD/README. Still nothing? Ask: **"What is this feature supposed to do? A
  one-liner is fine."** Without product intent, FMEA degrades to generic code review —
  you cannot find "PRD says batch-50 but queue has no limit" without knowing about the 50.

**System context:**
- Architecture docs (`docs/mermaid/`, `docs/ARCHITECTURE_FLOW.md` if this repo uses
  power-coding), `context_sources.architecture_doc`, infra constraints
  (`infra_constraints`: rate limits, quotas, instance memory), past incidents
  (`known_incidents`, and Learning.MD if present). Not set → infer what you can from
  package.json / docker-compose / deploy configs, and say what you're inferring.

## 2. Analysis process

1. **Map changes to user-facing flows.** Never analyze a helper in isolation — trace it
   up to the user action it serves ("this retry util sits inside the checkout webhook
   path"). Failure modes are stated in terms of that flow.
2. **Walk the mandatory checklist** — every category in
   `config.failure_categories`, explicitly, for each flow:

   | Category | The question to actually ask |
   |---|---|
   | unhandled_error_paths | Which throw/reject/non-200 has no handler? What does the user see? |
   | external_dependency_failures | Each API/SaaS call: timeout? 429/5xx? partial response? Their outage = our what? |
   | race_conditions_and_state | Two things arriving in surprising order (webhook vs record creation, double-click, concurrent edits)? |
   | resource_exhaustion | Unbounded queue/loop/upload/memory? What breaks first at 10× load, and does it take neighbors down? |
   | security_access_control | New surface reachable without the check the PRD assumes? IDs guessable? Secrets in logs? |
   | data_integrity_partial_writes | Multi-step write with no transaction/compensation — what state remains if step 2 of 3 dies? |
   | observability_gaps | If this fails at 3am, what tells us — alert, log, or a user tweet? |
   | scale_and_load_failures | Works at dev scale; at the PRD's stated scale (users, batch sizes), what's the first bottleneck? |
   | billing_credit_mismatches | Any path where money moves but value doesn't, or value moves but money doesn't? |
   | retry_idempotency_issues | Anything retried that isn't idempotent (double-charge, double-send)? Anything not retried that should be? |
   | config_feature_flag_drift | Behavior forked on env/flag — what happens when prod config diverges from what dev assumed? |
   | edge_cases_from_prd | Re-read the PRD: which promised edge cases ("up to 50", "any currency", "resume later") does the code not handle? |

3. **Cross-reference the PRD** — every quantitative promise (limits, SLAs, "always"/
   "never" statements) is a test the code must survive.
4. **Score S / O / D** — calibrated, not dramatic. Anchors:

   | Score | Severity (user/business impact) | Occurrence (at REAL usage) | Detection (before a user hits it) |
   |---|---|---|---|
   | 1–2 | Cosmetic; log typo | Nearly impossible | Existing test/typecheck catches it |
   | 3–4 | Degraded UX, workaround exists | Rare edge input | CI, eval, or staging would catch |
   | 5–6 | Feature broken for some users | Weekly at current scale | An alert/log fires in prod |
   | 7–8 | Wrong data or money for some; recoverable | Daily under normal load | Only a user report surfaces it |
   | 9–10 | Data/money loss at scale; breach; irreversible | Most uses hit it | Silent — corrupts quietly, found much later |

   A typo in a log line is not S8. A race needing a 5ms window on one user's double
   webhook is not O9. Something covered by an existing test is D1–2 — say so and move on.
5. **RPN = S × O × D**, sort descending, cap at `output.max_failure_modes`. Priority
   from config thresholds: RPN ≥ 200 → 🔴 P0 · 100–199 → 🟡 P1 · < 100 → 🟢 P2.
6. **Recommended actions** — specific and code-anchored ("add `concurrency: 5` to the
   BullMQ worker in `bulkJobProcessor.ts:42`"), never "consider adding error handling".

## 3. Output format

```markdown
## 🔍 FMEA Analysis — <feature/branch>
**Scan scope**: <N> files changed, <N> lines · **Product context**: <one-liner + source>
**Failure modes found**: <N> (<n> P0, <n> P1, <n> P2)

| # | Component | Failure Mode | Effect | Root Cause | S | O | D | RPN | Priority |
|---|-----------|--------------|--------|------------|---|---|---|-----|----------|
| 1 | `file.ts` | <what goes wrong> | <what the user feels> | <why> | 9 | 6 | 7 | 378 | 🔴 P0 |

### 🔴 P0 — Fix before merge
1. **<specific action>** in `file.ts:line` — <why it prevents the failure>
### 🟡 P1 — Fix this sprint
### 🟢 P2 — Track / next sprint

**Coverage**: 12/12 categories checked. Nothing found in: <list the empty ones>.
```

The **Coverage line is mandatory** — it proves the walkthrough happened and keeps the
table honest (an empty category is a finding about the scan, not a reason to pad).

## 4. Pre-commit gate (`on_pre_commit`)

Light and fast — this runs on every commit the agent makes:
- Staged diff only; skip the architecture pass; top ~8 modes max; skip categories with
  no plausible relation to the diff (but still list them in Coverage as "n/a to diff").
- **Any P0 → block**: show the finding, ask **"Fix now or commit anyway?"** — the user
  decides, always. P1/P2 only → one-line summary, don't block, commit proceeds.
- Honesty: this gate runs when the AGENT commits. A human committing from their own
  terminal bypasses it — say so at setup; offer a plain `git` pre-commit hook that
  merely prints a reminder if they want belt-and-braces.

## 5. Smart suggest (`smart_suggest`)

- Watch for the signals in `config.smart_suggest_signals` (new webhook handler, new
  external API, payment/billing or auth code, async/queue/worker changes, error-handling
  or retry changes, migrations, env-config changes, 200+ line diffs).
- **Never interrupt mid-flow.** Wait for a natural pause — a file finished, tests run,
  the user asks a question — then: "I noticed <signals>. Want me to run an FMEA scan on
  these changes?"
- Declined or ignored → do not re-suggest for the same change-set (note the declined
  ref in `.power-coding/fmea-state.json`); new signals on NEW changes may suggest again.

## 6. After the scan

- Offer to fix P0s immediately (they're "before merge" by definition).
- If the repo runs power-coding's other layers: P0/P1 items land in Handoff.MD's
  pending points; any failure mode that later actually occurs gets a Learning.MD entry
  linking back to the scan (calibration feedback — was it scored right?).
- Recurring failure modes across scans → suggest a Loop.MD eval that locks the fix in.
