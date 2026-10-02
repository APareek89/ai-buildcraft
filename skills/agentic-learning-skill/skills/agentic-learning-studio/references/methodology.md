# The methodology — why this approach is reliable

This skill is a portable distillation of the hosted **Agentic Learning Studio**
(https://prathibhax.com). This file is the conceptual model; `blueprint-schema.md` is the
exact contract and `authoring-guide.md` is the pedagogy.

## The one invariant: data in, deterministic HTML out

> The model emits a typed **Blueprint** (JSON) and *nothing else* — never HTML, CSS, or
> JavaScript. A separate, hand-written, deterministic renderer turns a valid Blueprint
> into the interactive page.

That single rule is the whole robustness story. The (i) glossary popovers, the mental map,
the decision matrices, the predict-then-reveal code, the interactive visuals, and the
graded knowledge check **always work** because a tested template (`scripts/render.mjs`)
owns every tag, class, and event handler — not a hopeful one-shot generation that might
forget to close a `<div>` or wire a click. You focus all your effort on *what to teach and
how to sequence it*; the renderer guarantees it *behaves*.

Same Blueprint in → byte-identical HTML out. Everything (CSS, JS, glossary data) is inlined
so the file works offline by double-click.

## The pipeline, collapsed for a no-server world

The hosted app runs a multi-step agent graph. Running on the installer's own Claude with no
backend, you collapse it into one authoring pass, but the *stages* are still the right way
to think:

1. **Profiler** — read the request and resolve *who* (level / depth / examples) **and**
   *exactly what they asked for* (`lessonFocus`, `mustCover`, industry, buildGoal). Infer
   level from the ask and the topic's intrinsic complexity — don't reflexively pick
   "intermediate". (Capability A, Step 1–2.)
2. **Architect** — design the spine: the mental map + module outline + glossary +
   synthesis, all on ONE backbone. This is the reasoning-heavy step that sets the lesson's
   shape (procedural / dependency / conceptual / comparative).
3. **Module writer** — fill each module's content blocks, paced to the worked → completion
   → solo ramp with spaced retrieval of earlier ideas. (In the app these run in parallel
   per module; you just write them all into one complete Blueprint.)
4. **Renderer** — `render.mjs` validates, repairs, and renders. (Capability A, Step 4.)

In the hosted product, stages 2–3 are split (a cheap "overview" the learner approves before
paid module bodies are written). Offline you write the whole thing at once — so **every
module is fully built** (`loadState: "full"`, `blocks` populated). There is no background
fetch.

## What the renderer changed for portability

Three things in the hosted product depend on a server; the portable renderer replaces each:

| Hosted product | Portable skill |
|---|---|
| Background build queue fetches module bodies from `/api/module` | Every module is written into the Blueprint up front; nothing is fetched |
| Knowledge check graded server-side (answers kept out of the DOM) + free-text graded by an LLM via `/api/check` | **MCQ graded client-side** (answer key embedded); **free-text reveals a model answer** to self-compare |
| RAG retrieval from a knowledge base + the learner's uploads | None — you use your own knowledge; cite real canonical sources you're confident about, or omit citations |
| Auth, database, saved progress, library, the preview gate | None — a single self-contained file |

Everything else — the Blueprint schema, the renderer's components, the inline runtime, the
27-combination CSS gates, the look — is the real product.

## Reliability machinery you inherit for free

`render.mjs` runs the product's defensive passes before rendering, so a slightly-imperfect
Blueprint still produces a clean lesson:
- **Normalize** — fill safe defaults, coerce a `glossary`/`citations` array into the keyed
  object, strip nulls, force modules to "full".
- **Repair** — drop references to terms/citations that don't exist, align decision-matrix
  cells to the criteria, guarantee one always-visible block per module, wire the mental map
  to a module if none was linked.
- **Warn, don't crash** — anything it couldn't auto-fix prints to stderr; the HTML is still
  produced. Read the warnings and tighten the Blueprint.

## The mental model in one line

*Profile the learner → design one spine (map + modules + synthesis) → fill each module as
data → let the renderer make it real.* Get the Blueprint right and the lesson looks and
behaves like the hosted product.
