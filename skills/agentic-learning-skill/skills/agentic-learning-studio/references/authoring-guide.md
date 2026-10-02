# Authoring guide — how to make a lesson genuinely good

The schema tells you the *shape*; this tells you the *substance*. It's the distilled
pedagogy of the hosted product, generalized to any subject. Optimize for **durable
learning, not smooth reading** — a complete-feeling wall of prose is the failure mode.

## 1. Intent fidelity — answer the ACTUAL question

The lesson's structure must mirror the learner's goal. Classify `lessonFocus` and let it
drive the spine:
- **compare_and_choose** — the SPINE *is* the comparison. Lead toward a `decisionMatrix`
  of the specific named options; give each enough depth to judge; spend at most one short
  module on prerequisites; end with a clear recommendation tied to their context. Do NOT
  pad with a generic "intro to the field" tour.
- **understand_mechanism** — teach the one subject end to end (what → why → pieces → how →
  failure modes → next). Don't pad with neighboring tools.
- **how_to_build** — the modules ARE the build steps; the capstone IS the thing they're
  building.
- **survey** — the broad map.

Honor `mustCover`: every item there is a first-class module or a matrix row.

> "Give me an overview of agentic frameworks" means **compare the frameworks**, not "teach
> agent concepts". When the topic is a category of competing options, "overview / tell me
> about / which should I use" all mean compare_and_choose.

## 2. Subject fidelity — context personalizes examples, never the subject

The lesson subject is exactly what they asked about, taught as it would be to anyone. Use
their **role/industry/buildGoal** only to choose fitting *examples and analogies*. Never
retitle or restructure "X for <role>s" (a request to explain RAG is a lesson about RAG,
not "RAG for product managers"). If no industry is implied, keep examples general but
concrete.

## 3. Mental-map first (the advance organizer)

Open with the map: how the pieces relate, in the topic's true shape (`structureType`).
It's a concept/process map of uniform cards, NOT a table of contents. Keep each card
minimal — a 4–6 word headline + a 10–15 word `orient` line. Most cards link to a module.
Don't organize by difficulty (foundations/core/advanced) — use the real relationship
(ordered steps, dependencies, components, or options).

## 4. ONE spine, start to finish

The mental-map node order, the module order, and `synthesis.buildOrder` are the SAME
backbone — reconcile them into one sequence, never three. Give an ordered topic a single
unambiguous start. No orphan module: each module's `sub` says how it follows from the
previous one, so the learner always knows where they are.

## 5. The 7 questions a lesson must answer

Give each a home across the modules + synthesis (they won't all fit every topic — but make
sure the under-weighted ones, #2 #5 #7, get a home):
1. **What it is** — the defining idea (module 1 / the thesis).
2. **Why it exists** — the problem it solves and when you'd reach for it. The orientation
   hook; put it EARLY, framed as "why it was built", not history. Most-skipped move.
3. **The pieces & how they relate** — the mental model the rest hangs on (also the map's job).
4. **How it works / how to do it** — the core mechanism (middle modules). Necessary, rarely the gap — don't over-invest.
5. **When it breaks & what to watch for** — failure modes; for build topics, how to check
   the AI-generated version. A late, hands-on module. Highest value, most under-weighted.
6. **How do I know I've got it** — self-check / retrieval (woven through + the recap).
7. **What now & what's next** — the bridge to what they're building + the next rung (the
   capstone — never a dead end).

Arc: WHAT / WHY / PIECES early → HOW in the middle → WHEN-IT-BREAKS late → KNOW-IT /
WHAT-NEXT in synthesis.

## 6. The learning ramp — worked → completion → solo

Sequence for retention, not coverage:
- **Earlier modules carry WORKED examples** (show every step) but still make the learner
  **predict the result first** (a `predictThenReveal` on code, or a "Before reading on,
  predict: …" callout in prose).
- **Later modules shift to COMPLETION problems** — a near-complete artifact with the key
  piece missing for them to supply (e.g. a `codeExample` with the critical line as a TODO
  + a `predictThenReveal` asking what goes there).
- **The capstone is the SOLO build.** Don't jump from a worked example straight to
  from-scratch — plan the rungs in between. Match the rung to level (beginner → mostly
  worked; intermediate → completion; advanced → solo/predict).

## 7. Spaced & interleaved retrieval (not a quiz dump)

Put foundational concepts early enough that a **later** module can briefly bring one back
for effortful recall (answered from memory, not re-read) near its start. Spacing beats
massing — don't cluster all the testing at the end.

## 8. Failure modes are first-class content

For any technical/build topic, teach how it BREAKS in practice as deliberate content (a
"How this breaks" `note`/`conceptual` block, or a `decisionCallout`'s `avoidWhen`) — the
common and the non-obvious failure modes, and what to watch for. Don't scatter it as
one-off warnings.

## 9. Evaluate what you build with AI

When a module teaches code or a build step, include a short concrete "how to verify the
AI-generated version before trusting it" element — the specific things to check for THIS
topic (does it handle the failure mode just taught, call the right API, guard the edge
case). Teach the judgment, not just the happy path.

## 10. Level = scaffolding that FADES (not difficulty for its own sake)

- **beginner** — pre-teach vocabulary, concrete-before-abstract, fully worked, explain the
  why; add an `analogy` on conceptual/technical blocks; never an unexpanded acronym.
- **intermediate** — assume vocab; completion problems; tradeoffs / when-to-use; edge cases.
- **advanced** — STRIP explanations of what a practitioner already knows; problems over
  worked examples; focus on edge cases, failure modes, non-obvious interactions,
  performance. "More text" for an advanced learner must add DEPTH, never re-explain basics.

Gate genuinely advanced detail behind `depthTier: "deeper"` so a novice isn't overloaded
and an expert can still dig in.

## 11. Density controls words, never structure

- **low** — sharp and direct; short fragments; ~half the words; every sentence earns its place.
- **medium** — a clear sentence or two per point, then move on.
- **high** — fuller explanations, analogies, the "why" behind each point.

Keep the same modules, decisions, and visuals at every density.

## 12. Decision support

Wherever the learner must choose, include a `decisionMatrix` (named options × criteria,
with a required "When to choose"), a `decisionCallout`, or a `decisionTree`. For a
compare-and-choose lesson the matrix is the single most important block — don't replace it
with prose.

## 13. The glossary and (i) tooltips

Every core term gets a plain `laymanDefinition`; reference it in prose via a span
`{text, term:"<id>"}` so it renders as an inline (i). Add a `technicalNote` for depth.
ALL-CAPS acronyms need `acronymExpansion`. Don't over-tag — the most important terms, not
every word.

## 14. Examples — business + code

Honor the `examples` axis. `functionalExample` = a plain real-world scenario tied to the
learner's industry/build when given. `codeExample` = a short *correct* snippet in the
named `framework` (real APIs) or clean framework-agnostic pseudocode. When "Explain
syntax" is on, every codeExample carries a `syntax[]` breakdown of the parts a newcomer
wouldn't recognize.

## 15. Interactive visuals — only when they earn it

Emit these only when `visualsRequested` is on AND the concept is genuinely hard to picture
(typically 1–3 across the whole lesson, at most one per module). Pick by shape:
- **interactiveScatter** — similarity / clustering / embedding-or-vector space / "near vs
  far in meaning". Place points in a 0–100 plane so related ones sit close; add 1–3 queries.
- **interactiveSlider** — a threshold / tradeoff / one parameter's effect (temperature,
  chunk size, a cutoff). Give 2–5 `stops` explaining each value.
- **steppedFlow** — a multi-stage pipeline / lifecycle the learner clicks through.

Prefer ONE excellent visual for the hardest concept over many shallow ones.

## 16. Block order within a module + the knowledge gate

Lead with the EXPLANATION (conceptual/technical) → a real-world `functionalExample` → the
`codeExample` — each building on the last — then add the recall rungs above. Quiz and
`knowledgeCheck` blocks appear ONLY when knowledge check is on; when on, place ONE graded
`knowledgeCheck` (4–5 Qs) last (by default in the final module). The always-available
retrieval primitives (predict-then-reveal, a "predict first" hook, a scenario) are woven
in regardless of the quiz gate.

## 17. Synthesis — consolidate, don't summarize

Phrase `recap` as a retrieval prompt (reconstruct the structure from memory before it's
shown). `buildOrder` mirrors the module order exactly. `checklist` is the decisions drawn
from each module's `decisionItForces`. `capstone` is a solo build tied to their goal that
points explicitly at the NEXT rung — end with momentum, not a flat stop.
