---
name: deck-from-template
description: Build a PowerPoint deck that reuses an existing reference deck's own slides as templates — cloning their exact composition and refilling them with new content, plus theme, fonts and master decoration. Use whenever someone wants slides "in our template", "using this deck as the reference", "on-brand", "matching this PPT", "like slide 4 but for X", or hands over a .pptx/.potx to copy the look of. Asks for the reference deck and the content brief, catalogues what each reference slide is FOR, agrees a storyline, then renders and lints a real .pptx. Also use for "make a deck like this one", "rebuild this in our format", "brand this deck".
---

# Deck from a reference template

Produce a `.pptx` whose *look* comes from a reference deck and whose *content*
comes from a brief. Two mechanisms, used together in one deck:

| Mechanism | What happens | When |
| --- | --- | --- |
| **Archetype** | A real slide from the reference deck is cloned — every shape, icon, banner, table and image — and its text slots are refilled. | The reference deck already has a slide that does this job. Prefer this. |
| **Slide type** | A slide is composed from measured house geometry on the reference deck's master, so theme, fonts and decoration still carry. | Nothing in the reference deck fits the content. |

Text capacities are **measured** against the real font, so overflow is rejected
before the file is written rather than discovered on screen.

## Step 0 — collect the two inputs

If the user invoked the skill without both, ask for both in one message and stop:

1. **The reference deck** — a path to a `.pptx` or `.potx`. They can drag the file
   into the terminal to get its path. A PDF, a Google Slides link or a screenshot
   will not work: say so and ask for an exported `.pptx`.
2. **The content brief** — what the deck argues, for whom, and roughly how long.
   If they give only a topic, ask for the audience and the decision the deck is
   meant to drive.

Do not start with only one of them. Then:

```bash
WORK=<project-dir>/deck-build
mkdir -p "$WORK"
```

`SKILL_DIR` below is this skill's own directory.

## Step 1 — read the reference deck two ways

Run both. They answer different questions.

```bash
python3 "$SKILL_DIR/scripts/extract_template.py" <reference.pptx> "$WORK"
python3 "$SKILL_DIR/scripts/catalog_slides.py"   <reference.pptx> "$WORK"
```

`extract_template.py` → `$WORK/profile.json`: slide size, theme colours, fonts,
and the eleven generic slide types with measured slot capacities. Check
`fonts_installed` — `false` means the theme font is absent here, capacities were
measured with a substitute and cut 10%, and line breaks may differ on the user's
machine. Say so once.

`catalog_slides.py` → `$WORK/slides.json` + `$WORK/thumbs/*.png`: every real slide
in the deck, with each shape's index, kind, geometry, font size, text, and any
detected n-up rhythm (`3x row` is the tell for a three-card strip).

## Step 2 — decide what each reference slide is FOR

**This is the step that matters, and it is yours — no script can do it.**

Read the thumbnails. For each slide, look at it and ask what job it does: a key
feature showcase, a competitive 2×2, a phased roadmap, a customer proof point, a
context band over a three-stage strip. Then match the picture to the shape
indices in `slides.json` — the thumbnail tells you what it means, the fingerprint
tells you which shape number to write into.

Skip slides that are one-offs, dense data dumps you would never refill, or
duplicates of an archetype you already have. Three to eight good archetypes beat
a mechanical pass over every slide.

Write `$WORK/catalog.json`. The full field reference is in
`references/catalog.md` — read it before authoring your first one.

```json
{"archetypes": [
  {"id": "context_then_three_stages",
   "name": "Context band, then a three-stage approach strip",
   "source_slide": 2,
   "use_for": "Framing a piece of work: the situation in a tinted band, then three named stages each with a detail card.",
   "avoid_for": "Parallel options of equal weight — the pentagon arrows imply sequence.",
   "slots": [
     {"name": "headline", "shape": 1},
     {"name": "context", "shape": 0},
     {"name": "stage_1_head", "shape": 3},
     {"name": "stage_1_body", "shape": 8},
     {"name": "note", "shape": 2, "on_empty": "delete"}
   ]}
]}
```

`use_for` and `avoid_for` are not documentation — they are how you pick the right
archetype in the next step, so write them as decision rules, not descriptions.

Then measure it:

```bash
python3 "$SKILL_DIR/scripts/measure_catalog.py" <reference.pptx> "$WORK/catalog.json" "$WORK/catalog.measured.json"
```

This resolves every slot to a real shape and prints its `kind` and `max_chars`.
If a slot's `kind` is not what you expected, your shape index is wrong — fix it
now, because a wrong index writes text into the wrong box silently.

Report the catalogue to the user in one short list — "your deck gives us five
reusable slides: …" — before moving on. They will often correct you, and a
correction here is cheap.

## Step 3 — agree the storyline

Post a numbered storyline: for each slide, the archetype or slide type, and the
one sentence that slide makes. Show the argument, not the layout. Ask for
approval and wait.

This gate exists because rewriting a storyline costs a message and rewriting a
built deck costs a rebuild. Do not render an unapproved storyline. If the user
edits it, re-post the amended version and confirm.

Reach for an archetype first; fall back to a generic type only when nothing in
the catalogue fits. A deck that is 80% cloned archetypes looks like the user's
deck. One that is 80% generic types looks like mine.

The generic types are `title`, `section`, `big_numbers`, `cards_2/3/4`,
`chart_insight`, `table`, `ranked_list`, `flow`, `closing` — slot names and the
chart/table/flow object shapes are in `references/slide-types.md`.

## Step 4 — write `$WORK/content.json`

Each slide names **either** an `archetype` **or** a `slide_type`, never both:

```json
{"slides": [
  {"n": 1, "archetype": "context_then_three_stages",
   "slots": {"headline": "Reclaiming three points of share",
             "context": ["Share fell from 43% to 39% over eight quarters.",
                         "The loss is entirely in the SUV segment."],
             "stage_1_head": ["Reframe", "What the brand stands for"],
             "stage_1_body": "Move the story from reliability to capability."}},
  {"n": 2, "slide_type": "closing",
   "slots": {"headline": "Fund the SUV ladder first", "cta": "Decision needed this cycle"}}
]}
```

Rules the renderer enforces:

- Slot names must exist in that archetype or type. Unknown names are an error.
- Every string must be within the slot's measured `max_chars`. Write to roughly
  85% of it; the cap is a hard stop, not a target.
- A **list** writes one paragraph per item, reusing the source paragraphs' own
  formatting — that is how you fill a bulleted box or a two-tier banner.
- `n` runs 1..N in order.
- An omitted archetype slot has its shape **deleted** by default, so a three-card
  archetype cleanly renders two. Set `"on_empty": "keep"` in the catalog for
  decoration that must survive regardless.

Write headlines that assert something. "Q3 results" is a label; "Churn doubled
after the pricing change" is a claim.

## Step 5 — render, lint, repair

```bash
python3 "$SKILL_DIR/scripts/render_deck.py" <reference.pptx> "$WORK/profile.json" \
    "$WORK/content.json" "$WORK/<name>.pptx" --catalog "$WORK/catalog.measured.json"
python3 "$SKILL_DIR/scripts/lint_deck.py" "$WORK/<name>.pptx" <minor_font>
```

Both fail loudly rather than shipping a broken slide. Overflow means cut words,
not shrink type. Lint covers bounds, the 0.4in safe margin, measured overflow,
minimum 10pt type, 4.5:1 contrast, leftover placeholder text and overlap. Fix
every issue and re-render; if one genuinely cannot be resolved, say which and why.

## Step 6 — look at it

```bash
python3 "$SKILL_DIR/scripts/preview_deck.py" "$WORK/<name>.pptx" "$WORK/preview"
```

Read the PNGs — every cloned slide at minimum, since a clone can be structurally
perfect and semantically wrong (text in the box that used to hold a caption).
Lint catches geometry; only your eyes catch a slide that reads as filler.

Then send the `.pptx` with `SendUserFile` and say in one line which slides were
cloned from which reference slides, and which used house geometry.

## Requirements

`python-pptx` and `Pillow`. Thumbnails and previews need LibreOffice (`soffice`)
plus PyMuPDF or Poppler — without them you cannot see the reference deck, so
Step 2 degrades to guessing from `slides.json` alone; tell the user rather than
pretending otherwise. `flow` slides use Graphviz (`dot`) when installed and fall
back to a deterministic stage layout when not; that fallback is normal.

```bash
python3 -c "import pptx, PIL; print('ok')"
```
