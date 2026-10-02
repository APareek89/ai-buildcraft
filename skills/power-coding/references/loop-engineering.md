# Loop Engineering — Loop.MD in full

The principle (Andrew Ng's agentic-workflow argument): output quality comes from the
**loop** the model runs in — build → check → revise — more than from the model itself.
An agent with a concrete list of pass/fail checks self-corrects cheaply; an agent
without one "finishes" and waits for the human to find what's broken. Loop.MD makes the
checks concrete, and the status machine makes the loop start itself.

## Drafting the example evals (setup step 2a)

Draft from the project's own material, never generic:

- **Existing project:** read the brief / README / product docs / any `docs/*.md`. Pick
  the 3–6 behaviors those docs actually promise. Each eval = one concrete input and the
  observable expected output.
- **New project:** derive from the user's stated goal. If the goal is one line, write
  evals for the obvious core path plus one failure case (bad input, empty state).
- **Shapes by project type:**
  - Q&A / agentic system → `Q: <user question>` → `Expect: <the answer must contain /
    cite / refuse …>`
  - App / CLI → `Do: <action or command>` → `Expect: <visible result, exit code, file
    produced>`
  - API → `Call: <endpoint + payload>` → `Expect: <status + key fields>`
- Always include at least one **negative eval** (what the system must NOT do — wrong
  answer, crash, silent failure) — quality is defined by both edges.
- Label them all `(EXAMPLE — replace me)`. The user's own evals are the real yardstick;
  the examples exist so the user edits instead of staring at a blank page.

## Golden set (agentic apps, or any product flow that calls paid APIs)

Free evals check *functionality* (does the endpoint answer, does the button work). An
agentic app also needs a **golden dataset**: curated inputs with reference outputs,
because LLM output varies run to run and "works once" proves little.

- **Classify at setup (2a):** if the product's core output is LLM-generated or a core
  flow calls paid APIs, draft a golden set alongside the free evals — 8–12 samples
  from the brief: typical cases, hard/edge-of-scope cases, and must-refuse cases.
  All labeled `(EXAMPLE — replace me)`; tell the user these are the ones most worth
  curating personally, since they define product quality.
- **Each golden entry has a check method:** `exact` (deterministic output), `contains`
  (must include / cite / refuse), or `rubric` (a one-line grading criterion — graded by
  running the model as judge, which itself costs a call; count it in the cost estimate).
- **Where it lives:** inline in Loop.MD up to ~10 entries; beyond that, `evals/golden.md`
  with a link from Loop.MD — the golden set grows over the project's life (every
  interesting production failure becomes a golden entry).

## Cost consent — free and paid evals are consented separately

"Turn on the loop" consents ONLY to the free tier. The golden set (and any eval that
hits a paid API) is the expensive tier of the consent model:

- **Free evals** → run automatically after every meaningful change while `status: on`.
- **Golden set / paid evals** → NEVER automatic per-change. Governed by
  `consent.paid_evals` in `.power-coding/config.json`:
  - `ask` (default) — offer at milestones ("feature complete — run the golden set?
    ~<N> paid calls, est. <rough cost if computable>") and run on request ("run the
    golden set").
  - `auto` — only if the user explicitly set it, understanding the cost.
- **Always disclose the split when offering the loop** — the user must know what
  they're consenting to: "the N free checks run every change; the M golden evals cost
  API money and only run when you approve."

## The status machine

Loop.MD's frontmatter carries one line the agent reads every session:

```
status: waiting_for_first_draft | offered | on | off
```

- `waiting_for_first_draft` — the default after setup. The agent watches for the
  **first working draft**: the core path runs end-to-end once (an app serves and its
  main action works; an agent answers its main question; a CLI processes one real
  input). "Compiles" is not a draft; "demo-able" is.
- When that happens → **make the offer immediately, in the same session**:
  > "First draft is working. Want me to turn on the Loop? I'll run every eval in
  > Loop.MD after each change, show per-eval pass/fail, and keep finetuning until they
  > pass."
  Set `status: offered` the moment the question is asked (so a session that dies
  mid-answer doesn't re-detect the draft and nag twice; an unanswered `offered` is
  re-asked at next session start, once).
- User accepts → `status: on`. Declines → `status: off` (they can say "turn the loop
  on" any time later).

**Why the offer fires "automatically":** the trigger instruction is written in three
places — the instructions-file pointer block (re-read every session), Loop.MD itself
(read every session per that pointer), and a Handoff.MD pending item ("offer the loop
when first draft is ready"). Any one of the three surviving into context is enough. This
triple redundancy is the whole mechanism; there is no scheduler.

## Running the loop (`status: on`)

After each meaningful change:

1. **Cheapest first.** Typecheck / lint / unit tests if the repo has them. A failure
   here never proceeds to evals.
2. **Walk the FREE evals.** Execute each one for real (run the app, call the endpoint,
   ask the agent) — never predict from reading the code. The golden set is NOT part of
   this per-change walk (see Cost consent above). Produce the table:

   | # | Eval | Result | Note |
   |---|------|--------|------|
   | 1 | late-fee for 5-day GSTR-3B delay | ✅ | cites s47 |
   | 2 | refuses out-of-scope legal advice | ❌ | answered instead of refusing |

3. **Fix ❌, re-run, repeat** — until green or genuinely blocked. Blocked twice on the
   same eval → stuck protocol (Learning.MD entry + ask the user, pointing at the
   diagram box where it lives).
4. **Report honestly** — regressions alongside wins ("evals 1,3 now pass; eval 2 was
   passing and now fails").

## Spend discipline (when checks cost real money or minutes)

Most Loop.MD evals should be free (running your own app costs nothing). When an eval
hits a paid API or takes many minutes:

- **Hypothesis before spend** — one line in Loop.MD's run journal *before* the run:
  "changed X, expect eval N to flip because W". Can't write it → you're debugging, and
  debugging belongs on free checks.
- **Failure → free reproduction.** A paid eval fails → capture the failing case as a
  free check (fixture, unit test, mocked call), iterate against that, re-run the paid
  eval ONCE to confirm.
- **One paid confirmation per hypothesis.** A second identical run measures noise, not
  progress.

This is where eval money disappears in practice: using a paid run to *find out what
happens* instead of to *confirm what you predicted*.

## Eval graduation (the loop matures into a test suite)

A manual eval walkthrough scales badly: 6 evals is minutes, 20 is a tax on every change.
The fix is graduation — when an eval has passed **3 consecutive loop runs**, offer to
codify it as an automated test:

- **No test setup in the repo?** Create the minimal one: one test runner appropriate to
  the stack, one example test, a one-line run command. Explain to the user what it's for
  — they may never have had a test suite, and this is how they learn what tests buy.
- Mark the eval `(graduated → <test file>)` in Loop.MD's table. It now runs in step 1
  ("cheapest first") automatically instead of the manual walkthrough.
- A graduated test that starts failing is a **regression** — report it exactly like a
  failing eval, and never delete or weaken the test to make it pass.

Net effect: the loop gets *faster* as the app matures, and the user ends up with a real
regression suite without ever being asked to "write tests".
