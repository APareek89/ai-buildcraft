# Deck from Template

Reuse a reference PowerPoint’s actual slide composition and theme, then fill it
with a new story. The skill extracts a template profile, catalogs reusable slides,
measures text capacity, composes slides and renders a preview for visual review.

## Setup

Use Python 3.10+, LibreOffice (`soffice` on PATH), and the fonts required by your
reference deck. From this package:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

Install this whole folder into your coding agent’s skill directory, or invoke
[SKILL.md](SKILL.md) with its absolute location. Keep `scripts/` and `references/`
next to the skill. `SKILL_DIR` in its examples means this folder.

Supply a `.pptx`/`.potx` reference and a content brief. The skill guides the
profile → catalog → storyline → render → lint → visual-review workflow. Fonts
must be installed locally; substitution can change line breaks. Use only a
reference deck and media that you are allowed to reuse.

No private or third-party reference deck is included. This export has passed
Python syntax checks; it has not rendered a new deck or proven cross-platform
font/layout equivalence. Source: [SOURCE.json](SOURCE.json). Original package
code is covered by the collection’s [MIT license](../../LICENSE).
