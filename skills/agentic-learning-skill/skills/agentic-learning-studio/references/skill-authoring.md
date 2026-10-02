# Capability B — turn a brief into an installable Agent Skill

This mirrors the hosted app's *LLM-Skills* feature: a free-text brief ("build a skill that
does X") becomes a real, installable Agent Skill directory. Start from the task, not the
file format — a good skill captures a repeatable behavior: the trigger, the steps, the
decisions, the output, and the checks that prove it's done.

## 1. Capture intent

Ask (or mine from the current chat if it already contains a successful workflow):
- **Task family** — the recurring job this skill handles.
- **Trigger phrases** — the natural wording a user would actually say to invoke it.
- **Inputs** — files, URLs, project state, context needed.
- **Output contract** — the artifact: a document, code patch, report, HTML file, PR.
- **Verification** — tests, a screenshot, a checklist, or a human approval point.

If the chat already shows a workflow that worked, extract the exact sequence: tools used,
file types touched, corrections the user made, the final format, and any verification
commands.

## 2. Write the `description` first — it's the discovery surface

The `description` is what makes the skill trigger. Put the high-signal phrases there
(capability **and** timing), using words a user would really type. Weak: "helps with
invoices." Strong: "Organize invoices and receipts for tax prep. Use when the user asks to
classify receipts, rename invoice files, extract totals, or prepare expense summaries."

If a skill under-triggers, add phrases the user actually used. If it over-triggers, narrow
the description (or make it manual-only).

## 3. Scaffold the directory

A skill is a directory. Minimal portable shape:

```text
<skill-name>/
  SKILL.md            # required: frontmatter + instructions
  references/         # optional: deep docs loaded on demand
  scripts/            # optional: helper scripts the skill runs
  examples/           # optional: sample inputs/outputs
  assets/             # optional: templates, images
```

`SKILL.md` frontmatter — the portable standard requires only `name` and `description`:

```markdown
---
name: invoice-organizer
description: Organize invoices and receipts for tax prep. Use when the user asks to classify receipts, rename invoice files, extract totals, or prepare an expense summary.
license: MIT
---

# Invoice Organizer

Follow this workflow:
1. Identify all invoice files.
2. Extract vendor, date, amount, tax, category.
3. Rename files consistently.
4. Produce a summary table and flag anything uncertain.
```

Useful optional fields where the host supports them (treat as progressive enhancement —
keep the skill useful even if a host ignores them): `license`, `compatibility`,
`allowed-tools`, `argument-hint` / `arguments`, `disable-model-invocation` (manual-only for
side-effecting workflows), `user-invocable`.

## 4. Keep `SKILL.md` tight; push depth into `references/`

The body is instructions, not an essay. Give the trigger, the numbered workflow, the key
decisions, the output contract, and the verification step. Move long reference material
(API details, schemas, templates, edge cases) into `references/*.md` and point to them by
name — the host loads them on demand (progressive disclosure), keeping the always-loaded
`SKILL.md` small.

Write instructions in terms of **actions** ("read the file", "run the script", "dispatch a
subagent"), not one runtime's specific tool names, so the skill is portable.

## 5. Bundle helpers as scripts, not prose

If the task has a deterministic step (validate, transform, render, fetch), put it in
`scripts/` as a small, dependency-light script and have `SKILL.md` call it. Deterministic
code beats asking the model to redo fiddly work each time — exactly how this very skill
uses `scripts/render.mjs`.

## 6. Verify, then explain install

- **Verify** by dry-running the skill's own workflow once on a realistic input and
  confirming the output contract is met.
- **Tell the user how to install it.** Two common paths:
  - **Drop-in skill:** copy/symlink the `<skill-name>/` folder into `~/.claude/skills/`.
  - **Plugin:** add `.claude-plugin/plugin.json` + a `marketplace.json` at the repo root so
    others can `/plugin marketplace add <user>/<repo>` then `/plugin install`. (See this
    repo's own layout for a working example.)

## Skill vs. other tools — pick the right thing

- **Agent Skill** — a repeatable *behavior/workflow* the model follows (this is usually
  what "build a skill for X" wants).
- **Slash command** — a thin manual trigger; a skill can also be invoked by name.
- **MCP server** — when you need live access to an external system/API with structured
  tools, not just instructions.

When the brief is "automate this repeatable task I keep doing", a Skill is the answer.

## Output

Write the new skill to a folder the user names (or the current working directory) — never
inside this skill's own directory. Then summarize: the file tree you created, how to test
it, and the exact install command.
