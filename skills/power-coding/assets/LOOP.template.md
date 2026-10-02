# Loop.MD — <project>
status: waiting_for_first_draft

> AGENT INSTRUCTION — read every session and obey:
> - While `status: waiting_for_first_draft`: the moment the first working draft exists
>   (core path runs end-to-end once — demo-able, not just compiling), ASK the user:
>   "First draft is working. Want me to turn on the Loop? After each change I'll run
>   the FREE evals below (they cost nothing) and show per-eval pass/fail. The golden
>   set costs real API money — I'll only run it when you approve or at milestones."
>   Set `status: offered` when asked; `on` or `off` per the answer. Re-ask an
>   unanswered `offered` once at next session start.
> - While `status: on`: after each meaningful change run cheapest checks first
>   (typecheck/tests), then execute every FREE eval below for real (run the app —
>   never predict from code), report a per-eval ✅/❌ table including regressions,
>   fix, repeat.
> - GOLDEN SET (paid/graded evals): NEVER runs automatically per-change. Obey
>   `consent.paid_evals` in .power-coding/config.json — `ask` (default): offer it at
>   milestones ("feature complete — run the golden set? ~<N> paid calls") and on
>   request; `auto` only if the user explicitly set it. Before ANY paid run: one-line
>   hypothesis in the run journal; reproduce failures as free checks; one paid
>   confirmation per hypothesis.
> - GRADUATION: when an eval has passed 3 consecutive runs, offer to codify it as an
>   automated test (create the minimal test setup if none exists). Mark it
>   `(graduated → <test file>)` below — it then runs with the cheap checks, not the
>   manual walkthrough.

## Goal
<USER: one or two sentences — what the app/agent must do, and what "done" looks like>

## Free evals — run after every change while the loop is on
<USER: replace/extend these examples. Free = running them costs nothing but time:
your own app, local checks, deterministic assertions.>

| # | Input (question / action / call) | Expected (answer / behavior / output) |
|---|----------------------------------|----------------------------------------|
| 1 | (EXAMPLE — replace me) <drafted from the project brief> | <expected> |
| 2 | (EXAMPLE — replace me) <core-path case> | <expected> |
| 3 | (EXAMPLE — replace me) <negative case: what it must NOT do> | <expected refusal/error> |

## Golden set — paid/graded evals (agentic apps, or any flow that calls paid APIs)
<USER: curate these — they are your quality yardstick. The agent drafted them from the
brief; replace with real cases from your domain. 10+ entries → move to evals/golden.md
and keep a link here. Runs ONLY with your approval (consent.paid_evals) or at
milestones — never automatically per-change.>

| # | Input | Reference output / must-haves | Check (exact / contains / rubric) |
|---|-------|-------------------------------|-----------------------------------|
| G1 | (EXAMPLE — replace me) <typical real case from the brief> | <what a good answer must contain / cite / do> | contains |
| G2 | (EXAMPLE — replace me) <hard case / edge of scope> | <reference behavior> | rubric: <1-line grading criteria> |
| G3 | (EXAMPLE — replace me) <must-refuse / must-not-do case> | <expected refusal or safe behavior> | contains |

## Run journal (paid/slow checks only)
| Date | Hypothesis (changed X, expect eval N to flip because W) | Result | Cost note |
|------|----------------------------------------------------------|--------|-----------|
