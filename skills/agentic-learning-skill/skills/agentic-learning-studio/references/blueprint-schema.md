# The Blueprint schema — the contract between you and the renderer

A **Blueprint** is one JSON object describing a complete lesson as *structured data*. You
write it; `scripts/render.mjs` turns it into the interactive HTML. You never write HTML.

The renderer is forgiving: it fills safe defaults, converts a `glossary`/`citations`
*array* into the keyed object it expects, drops references to terms/citations that don't
exist, aligns decision-matrix cells, guarantees one always-visible block per module, and
wires the mental map to a module if you forgot. It prints warnings to stderr but still
renders. Aim to get it right anyway — the closer your Blueprint, the better the lesson.

Top-level shape:

```jsonc
{
  "schemaVersion": "1.0",
  "meta": { ... },
  "learnerProfile": { ... },
  "mentalMap": { ... },
  "modules": [ ... ],          // 4–6, each fully written
  "glossary": { "<termId>": { ... } },
  "synthesis": { ... },
  "citations": { "<citId>": { ... } },   // optional
  "whatsNew": [ ... ]                     // optional
}
```

---

## `meta`

```jsonc
{
  "topic": "Retrieval-Augmented Generation (RAG)",   // canonical subject
  "title": "How RAG Works: Grounding LLMs in Your Own Data",
  "thesis": "One-sentence promise of the lesson.",   // shown under the title
  "estTotalMinutes": 18,                              // optional
  "accent": "#2563eb",                                // optional hex; recolors the theme
  "recap": { "previousTitle": "...", "points": ["..."] }  // optional (multi-part courses)
}
```

## `learnerProfile` — the 3 axes (their product = 27 combinations) + personalization

The renderer puts `level/depth/examples` on `<body data-*>`; CSS then shows/hides content
per combination with no JavaScript.

```jsonc
{
  "level": "beginner" | "intermediate" | "advanced",
  "depth": "conceptual" | "technical" | "conceptual_technical",
  "examples": "functional" | "code" | "functional_code",
  "topic": "RAG",
  "industry": "customer support",        // optional — personalize EXAMPLES, not the subject
  "buildGoal": "a support assistant…",   // optional
  "framework": "Python (LangChain-style)", // optional — drives codeExample APIs
  "density": "low" | "medium" | "high",  // verbosity, not structure (default "medium")
  "visualsRequested": true,              // emit interactive visuals only if true
  "explainSyntax": true,                 // codeExamples carry a syntax[] breakdown if true
  "showTermPopovers": true,              // keep true — drives the (i) tooltips
  "expandAcronymsOnFirstUse": true,      // true for beginner/intermediate
  "readingMode": "vertical"              // this portable renderer supports "vertical"
}
```

## `mentalMap` — ALWAYS rendered first (the advance organizer)

A small graph that shows how the pieces relate, then gets out of the way. Choose the
`structureType` that matches the topic's TRUE shape:

- `procedural` — a how-to / build / pipeline → an ordered path. Give every node an
  `order` (1..N) and set `entryNodeId` to the order-1 node.
- `dependency` — a layered system where some ideas must precede others (ordered).
- `conceptual` — "how does X work" / "what is Y" → a relationship map; **omit `order`**.
- `comparative` — "X vs Y / which should I use" → the nodes are the options being weighed.

```jsonc
{
  "title": "RAG, end to end",
  "structureType": "procedural",
  "entryNodeId": "n1",                  // ordered maps: the single unambiguous start
  "oneLineThesis": "…",
  "nodes": [
    {
      "id": "n1",
      "label": "Why ground an LLM?",    // HEADLINE, 4–6 words (not a sentence)
      "order": 1,                       // ordered maps only
      "icon": "❓",                      // emoji badge for unordered maps
      "orient": "The hallucination problem RAG was built to solve.", // 10–15 word card line
      "moduleId": "m1",                 // makes the card clickable → opens that module
      "emphasis": "spine"               // marks the main path
    }
  ],
  "edges": [ { "from": "n1", "to": "n2" } ]
}
```

The richer per-node lines (`what`, `relevance`, `laymanExplanation`) render in the module
header, not on the overview card — set them on the matching node when you write the module.

## `modules[]` — 4–6, the unit of progressive disclosure

```jsonc
{
  "id": "m3",
  "order": 3,
  "icon": "🧩",                          // optional
  "title": "Chunking & embeddings",
  "sub": "ONE phrase: how this follows from the previous module.",
  "summary": "1–2 sentences shown at the top of the module.",
  "decisionItForces": "Chunk size vs overlap.",   // optional — if it forces a choice, include a decision block
  "objectives": ["After this you'll be able to …", "…"],   // 2–4
  "termIds": ["chunking", "embedding"],  // glossary ids this module uses
  "loadState": "full",                   // ALWAYS "full" in this portable skill
  "citations": ["c2"],                   // optional
  "blocks": [ ... ]                      // 2–5 content blocks (see below)
}
```

## Blocks — the closed component vocabulary

Every block has an `id` (any unique string) and `kind`. Optional on any block:
`visibleWhen` (gate to certain combos — omit for "core", always-visible), `termIds`,
`sources` (citation ids), `depthTier: "deeper"` (hidden behind a "Go deeper" toggle).
At least ONE block per module must be core (no `visibleWhen`).

**Rich text** (`body`, `explain`, walkthrough `detail`) is an array of nodes — never raw
HTML:
```jsonc
[
  { "t": "p", "spans": [ { "text": "An ", }, { "text": "embedding", "term": "embedding" }, { "text": " is …" } ] },
  { "t": "h", "level": 3, "spans": [ { "text": "A heading" } ] },
  { "t": "ul", "items": [ [ {"text":"item one"} ], [ {"text":"item two"} ] ] },
  { "t": "ol", "items": [ [ {"text":"step one"} ] ] },
  { "t": "callout", "tone": "info"|"good"|"warn"|"danger", "spans": [ { "text": "…" } ] }
]
```
A **span** is `{ text, term?, em?, strong?, code? }`. A `term` id that exists in the
glossary renders as an inline **(i)** button.

Block kinds:

| `kind` | Key fields | Use for |
|---|---|---|
| `conceptual` | `title?`, `body`, `analogy?` | the "why/what"; add `analogy` (one everyday sentence) for beginner/intermediate |
| `technical` | `title?`, `body`, `analogy?` | the "how" (depth-gated) |
| `functionalExample` | `title?`, `body` | a plain real-world scenario (renders collapsible) |
| `codeExample` | `language`, `code`, `filePath?`, `explain?`, `predictThenReveal?{prompt,answer}`, `syntax?[{part,explains}]` | a short correct snippet; `predictThenReveal` makes them guess first; `syntax` powers "Explain syntax" |
| `decisionCallout` | `useWhen`, `avoidWhen`, `ruleOfThumb` | a quick when-to-use/avoid call |
| `decisionMatrix` | `criteria[]`, `options[]`, `howToRead?` | weigh named options — the spine of a compare lesson (see below) |
| `decisionTree` | `root` (recursive `{question?, outcome?, branches?[{label,to}]}`) | branching choices |
| `walkthrough` | `steps[{label, detail}]` | a numbered procedure |
| `taxonomy` | `groups[{name, items[]}]` | grouped lists |
| `scenario` | `ask`, `implies` | a short "what if → therefore" prompt |
| `note` | `tone?`, `body` | a callout (great for "How this breaks") |
| `interactiveScatter` | `points[{label,x,y,group?}]` (x,y in 0–100), `queries[{label,x,y}]` | similarity / embedding-space / clustering |
| `interactiveSlider` | `min`, `max`, `unit?`, `stops[{at,label,note}]` | a threshold / tradeoff / one parameter's effect |
| `steppedFlow` | `steps[{label, detail, icon?}]` | a pipeline / lifecycle clicked through |
| `selfCheckQuiz` | `prompt`, `format`, `options?`, `acceptableAnswer?`, `explanation` | a single ungraded self-check |
| `knowledgeCheck` | `title?`, `intro?`, `questions[]` | the graded end-of-lesson check (see below) |

**`decisionMatrix`** — rows are options, columns are your `criteria`. The renderer always
appends "When to choose", "Cost", "Complexity" columns, so DON'T duplicate those in
`criteria`. Each option's `cells` must cover every criterion:
```jsonc
{
  "kind": "decisionMatrix",
  "criteria": ["Setup effort", "Scales to millions"],
  "options": [
    { "name": "pgvector", "whenToUse": "You already run Postgres.", "cost": "Low", "complexity": "Low",
      "cells": [
        { "criterion": "Setup effort", "text": "Reuse Postgres", "rating": "good" },   // good|ok|bad → green/amber/red dot
        { "criterion": "Scales to millions", "text": "Fine with an index", "rating": "ok" }
      ] }
  ],
  "howToRead": "Green = strength…"
}
```

**`knowledgeCheck`** — graded **client-side** in this portable build (the answer key is
embedded). MCQ grades instantly; free-text reveals a model answer to self-compare and is
not auto-scored (the score line counts MCQs).
```jsonc
{
  "kind": "knowledgeCheck",
  "title": "Check your understanding",
  "intro": "…",
  "questions": [
    { "id": "q1", "kind": "mcq", "prompt": "…",
      "options": [ {"text":"…","correct":true}, {"text":"…","correct":false} ],
      "explanation": "Why the right answer is right." },
    { "id": "q4", "kind": "freeText", "prompt": "…",
      "acceptableAnswer": "The model answer to compare against.", "explanation": "…" }
  ]
}
```

## `glossary` — keyed by term id

```jsonc
{
  "embedding": {
    "id": "embedding",
    "label": "Embedding",
    "acronymExpansion": "…",       // REQUIRED for ALL-CAPS acronyms (e.g. RAG, API)
    "laymanDefinition": "Plain one-sentence meaning (always shown).",
    "technicalNote": "Shown only when depth includes technical.",   // optional
    "sources": ["c1"]               // optional
  }
}
```
Every `term` you reference in a span, and every id in a module's `termIds`, must exist
here — otherwise the renderer drops the reference.

## `synthesis` — always last (consolidate + create forward pull)

```jsonc
{
  "recap": [ { "t":"p", "spans":[{"text":"Phrase as a RETRIEVAL prompt — ask them to reconstruct from memory."}] } ],
  "buildOrder": [ { "step": 1, "label": "…", "detail": "…" } ],   // mirrors the module order
  "checklist": [ { "id": "c1", "label": "A decision to make", "fromModuleId": "m1" } ],
  "capstone": { "prompt": "A solo build tied to their goal + the next rung.", "scopedTo": "…" }
}
```

## `citations` — keyed by id (optional)

```jsonc
{ "c1": { "id": "c1", "kind": "canonical", "title": "Source name", "url": "https://…" } }
```
`kind` ∈ `canonical` | `kb` | `liveSearch` | `upload`. For a portable lesson you'll
usually use `canonical` (a real, well-known source you're confident about) or omit
citations entirely.

---

## The validation gates the renderer enforces (so you don't have to)

It auto-repairs these, but authoring them correctly makes a cleaner lesson:
1. **Term integrity** — referenced term ids exist in `glossary`.
2. **Acronym policy** — ALL-CAPS labels get `acronymExpansion` (beginner/intermediate).
3. **Decision coverage** — a module with `decisionItForces` includes a decision block.
4. **Mental-map wiring** — ≥1 node links to a real module via `moduleId`.
5. **Citation integrity** — referenced citation ids exist.
6. **Matrix alignment** — every option's cells cover the criteria.
7. **Combo soundness** — each module has ≥1 always-visible (core) block.

See `examples/blueprint.sample.json` for a complete, valid Blueprint that exercises every
major feature, and `authoring-guide.md` for how to make the content genuinely good.
