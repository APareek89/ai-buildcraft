# ✂️ sharpen

Invisible expert-persona review for LLM outputs — in **Claude Code, Codex, opencode,
or any agent that reads markdown instructions**.

Pick a pre-built expert (8 personas distilled from 20 interrogation frameworks —
Minto, premortem, TAM/SAM/SOM, Seven Powers, unit-economics integrity, Crossing the
Chasm, Working Backwards…), or build a custom persona from a description of your
boss/client and documents they've written — or both. Every subsequent output is
drafted, interrogated by the persona behind the scenes, revised against the findings,
and delivered with an honest 2–3 line note on what the review caught.

Born from the Agent Council project (agent-council.onrender.com), where the same
review loop measurably caught conclusion-changing errors — contradictory theses,
unquantified cannibalization, broken unit-economics math — that single-pass LLM
output shipped with confidence.

## Install

**One-liner (auto-detects Claude Code, Codex, opencode):**

```bash
curl -fsSL https://raw.githubusercontent.com/APareek89/sharpen/main/install.sh | bash
```

**Claude Code, as a plugin:**

```
/plugin marketplace add APareek89/sharpen
/plugin install sharpen@sharpen
```

**Codex (manual):** the skill uses Codex's native skills format —

```bash
git clone --depth 1 https://github.com/APareek89/sharpen /tmp/sharpen && cp -R /tmp/sharpen/skills/sharpen ~/.codex/skills/sharpen
```

**Anything else (Cursor, ChatGPT, Gemini, …):** paste `skills/sharpen/SKILL.md`
into the agent's instructions (rules file, AGENTS.md, custom GPT). It embeds a
compact persona catalog so it works as a single file; add the `personas/` cards for
deeper reviews.

## Use

Invoke with `/sharpen` (or "sharpen this"). Choose: **pre-built expert** (it shows
the 2–4 most relevant for your task), **custom** (describe the person and/or attach
their review emails/docs), or **both**. Then just work — every substantive output is
reviewed and revised invisibly, ending with:

> ✂️ **Sharpened by Marg** — the ₹199 tier lost money at full utilization; pricing
> restated from unit costs. CAC was absent from the LTV claim; now derived from the
> stated channel.

Say "show the review" to see the full findings, "sharpen off" to stop.

**Custom personas are saved automatically** to `personas/custom/` inside the skill
(they survive updates — the installer preserves that folder). Re-invoke any persona
directly, no re-setup:

```
/sharpen marg          # pre-built, straight to work
/sharpen rahul         # your saved custom persona
/sharpen list          # everything available
```

## Layout

- `skills/sharpen/SKILL.md` — the whole protocol (self-sufficient single file)
- `skills/sharpen/personas/` — 8 pre-built expert cards + selection index
- `skills/sharpen/templates/custom-persona.md` — persona synthesis from documents
- `install.sh` — multi-agent installer · `.claude-plugin/` — Claude plugin metadata

No tools, no APIs, no dependencies — plain markdown any capable model can follow.
