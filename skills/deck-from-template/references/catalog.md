# Authoring `catalog.json`

The catalog is the mapping from *a real slide in the reference deck* to *what new
content belongs in it*. `catalog_slides.py` gives you the raw material — a
thumbnail of each slide and a fingerprint of its shapes. The judgement is yours.

## How to read the two inputs together

`thumbs/slide-NN.png` tells you what the slide **means**: this is a feature
showcase, that is a competitive 2×2, this one is a phased roadmap.

`slides.json` tells you **which shape index** to write into. Each shape carries:

| Field | Use |
| --- | --- |
| `shape` | The index you put in a slot. Stable for a given deck. |
| `kind` | `text`, `table`, `picture`, `chart`, `shape`, `line`, `group`. |
| `box` | `[left, top, width, height]` as fractions of the slide — match this against the thumbnail to identify a shape by position. |
| `text` | First 160 characters, so you can recognise it. |
| `style.font_pt` | The size new text will inherit. |
| `repeating_groups` | `3x row` means three same-size shapes evenly spaced — the parallel slots of a card strip, listed in visual order. |

Work top-left to bottom-right using `box`, and confirm against `text`. When a
slide has a `3x row` group, its `shapes` array is already in left-to-right order,
so those indices map straight onto `*_1`, `*_2`, `*_3` slots.

## Fields

```json
{"archetypes": [
  {
    "id": "feature_showcase_3up",
    "name": "Feature showcase, three across with icons",
    "source_slide": 4,
    "use_for": "Three product capabilities of equal weight, each a short name plus one benefit line.",
    "avoid_for": "Sequential stages — use process_arrows_5, whose chevrons imply direction.",
    "slots": [
      {"name": "headline", "shape": 1},
      {"name": "feature_1_title", "shape": 4},
      {"name": "feature_1_body", "shape": 7},
      {"name": "footnote", "shape": 12, "on_empty": "delete"},
      {"name": "hero", "shape": 3, "on_empty": "keep"}
    ]
  }
]}
```

| Field | Meaning |
| --- | --- |
| `id` | Referenced from `content.json`. Lowercase, underscores. |
| `name` | Human label for the storyline you post to the user. |
| `source_slide` | 1-based slide number in the reference deck. |
| `use_for` | The rule you will apply when choosing this archetype. Say what content shape it fits. |
| `avoid_for` | The near-miss it will be confused with, and where to go instead. |
| `slots[].name` | The key used in `content.json`. Name by role, not position — `feature_1_title`, not `textbox_4`. |
| `slots[].shape` | Shape index from `slides.json`. |
| `slots[].on_empty` | `delete` (default) removes the shape when content omits it; `keep` leaves it as-is. |
| `slots[].bold` | Optional `true`/`false` to force the weight of written text. |

Everything you do **not** list as a slot is left untouched — banners, rules,
icons, background art, page furniture. That is the point: only name the shapes
whose text changes.

`measure_catalog.py` adds `kind`, `emu`, `font_pt`, `max_chars`, `sample` and, for
tables, `rows`/`cols`. Read the `sample` it prints back: it is the original text
of the shape you mapped, and it is the fastest way to catch an off-by-one index.

## What each slot kind accepts

**text** — a string, or a list for one paragraph per item.

```json
"stage_1_head": ["Reframe", "What the brand stands for"]
```

The source paragraphs' own formatting is preserved position by position, so a
two-tier banner keeps its 24pt title and 14pt subtitle. When you supply more
lines than the source had, extra paragraphs clone the last one.

**table** — a real grid takes `{"headers": [...], "rows": [[...]]}` and must match
the template table's column count; fewer rows than the template are fine, and the
spare rows are emptied. Its styling is untouched.

A **1×1 table** is a tinted content box, not a grid — decks use them constantly —
so it takes a string or a list of bullet lines directly.

**picture** — an absolute path to an image file. It is placed in the original
picture's exact frame and z-order.

**chart** — cannot be refilled in place. Leave a source chart out of the slots and
it stays as it was; to show new data, use the `chart_insight` slide type instead.

## Two failure modes to check for

**A wrong shape index writes into the wrong box and nothing errors.** After
measuring, read the `sample` for every slot. If `feature_2_body` samples a
heading, your index is off.

**Mixed inline emphasis cannot be reproduced.** A source line like
"**Understand** business context and expected outcome" is one paragraph with two
differently-weighted runs; new text becomes a single run and inherits whichever
weight carried most of the original characters. Set `"bold": false` on the slot
when that guess goes the wrong way.
