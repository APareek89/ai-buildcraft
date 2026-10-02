# Power Coding — The Five Forces of Mindful Coding

*A structured framework for building scalable apps with AI coding agents, by Anand Pareek.*

Five forces quietly kill every AI-assisted project. Each one has a proven counter-discipline — borrowed from aerospace, the Toyota Production System, and modern eval-driven ML practice, and translated for LLM agents. Power Coding installs all five as one system, in plain markdown files your agent re-reads every session. Works with any agent (Claude Code, Codex, Gemini CLI…) — no daemons, no hooks, no lock-in.

## The Five Forces

| # | Force (what kills projects) | Counter-force | What gets installed |
|---|---|---|---|
| 1 | **Ambiguity** — the agent confidently builds the wrong thing | **Alignment** | A one-page brief (`PRD.md`) every eval and scan reads · plain-language **architecture sign-off** before code is built against it (and before every shape-changing enhancement) · a **decision log** that's never silently reversed · a **scope brake** (smallest version that proves it works, first) |
| 2 | **Amnesia** — every session starts from zero | **Memory** | `Handoff.MD` — one magic phrase chains sessions (*"Refer to Handoff.MD in `<path>` and begin"*), auto-updated before context runs out · `Learning.MD` — every bug gets a **5-whys** root-cause entry so no mistake is made twice · **git checkpoints** at every working state and before every risky change — rollback beats a debugging spiral |
| 3 | **Drift** — "done" is declared without proof | **The Loop** | `Loop.MD` **free evals** drafted from *your* brief, run for real after every change with per-eval ✅/❌ · a **golden set** for agentic apps (curated inputs + reference outputs + check method, drafted from the brief) that runs only with your approval — paid API calls are never spent automatically · a status machine that offers to turn the loop on the moment the first draft works · evals that pass 3 runs in a row **graduate into real automated tests** |
| 4 | **Opacity** — you can't see what was built, or where the effort went | **Sight** | Mermaid flow diagrams to a strict debuggable convention (one step per box, AGENT vs FUNCTION, gates with real thresholds) + a standalone HTML viewer + optional local-only in-app debug tab — **debug by pointing at a box instead of reading code** · **Session Pulse**: a 2-line effort split (🎯 feature · 🔧 support · 🔁 rework) after major milestones |
| 5 | **Entropy** — silent failures accumulate until production finds them | **Foresight** | **FMEA** scans cross-referencing your diff against the PRD and architecture (Severity×Occurrence×Detection → RPN → P0/P1/P2, mandatory 12-category walkthrough) · **Sentinel Scan**: a silent four-lens sweep after every major completion (misuse traps, stop signals, silent failures, waste) — one-line flags only when something fires · a **day-one security baseline** (no committed secrets, server-side enforcement, validated inputs) |

## The lineage

None of this is invented from scratch — each counter-force is a reliability discipline with decades of production behind it, applied to LLM coding:

- **FMEA** — aerospace/automotive failure-mode analysis
- **5-whys, Poka-Yoke, Andon, Jidoka, Muda** — the Toyota Production System (they power Learning.MD and Sentinel's four lenses)
- **OEE** from Total Productive Maintenance — the insight behind Session Pulse: your bottleneck is almost never what you think it is
- **The Loop** — Andrew Ng's agentic-workflow argument: output quality comes from the build→check→revise loop more than from the model

## The consent model

Every behavior fits one of three tiers — so the framework helps without nagging:

- **Cheap, append-only** (Sentinel, Pulse, file updates) → you opt in once at setup, then it runs silently. No per-run popups for cheap things — question fatigue trains yes-clicking, which destroys the questions that matter.
- **Expensive** (full FMEA scan, golden-set / paid eval runs) → asks before running; configurable to auto. Turning the loop on consents only to the free evals — paid runs are always consented separately.
- **State-mutating** (git commits, architecture changes) → commits are auto-with-announcement or propose-first (your pick at setup); architecture changes **always** wait for your approval — no config can silence that.

## How it works (the whole trick)

Agents only reliably re-read two things: their platform instructions file and the files it points to. Setup writes one pointer block into `CLAUDE.md` / `AGENTS.md` / `GEMINI.md`, and every "automatic" behavior is a written instruction in `Handoff.MD` / `Learning.MD` / `Loop.MD` that the pointer forces back into context — with deliberate redundancy so triggers survive across sessions and across models. No scheduler exists; the agent is the runtime.

## Install

**Claude Code:**
```bash
git clone https://github.com/APareek89/power-coding.git ~/.claude/skills/power-coding
```

**Other agents (Codex, Gemini CLI, …):** clone anywhere and point your agent's skill/instructions mechanism at `SKILL.md`.

## Use

- `power-coding` — first invoke in a repo runs setup (a few short questions, asked once); later invokes resume ongoing duties
- `power-coding brief` — create/update the one-page PRD (if you skipped it at setup)
- `power-coding fmea` — run an FMEA scan now · `fmea-config` — change when it runs
- `power-coding sentinel` — run a Sentinel Scan now · `sentinel-config` — change when it runs
- `power-coding pulse` — show the Session Pulse now · `pulse-config` — change when it shows

## Layout

```
SKILL.md                    the orchestrator (start here)
references/                 full protocols: loop-engineering, fmea, diagram convention, debug-tab recipes
assets/                     templates: PRD.md, Handoff.MD, Learning.MD, Loop.MD, module config
scripts/                    mermaid validation + standalone HTML viewer builder (node, dependency-free)
```
