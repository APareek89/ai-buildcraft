#!/usr/bin/env python3
"""Render content.json against a reference template into a .pptx.

    python3 render_deck.py <reference.pptx|.potx> <profile.json> <content.json> <out.pptx> \
        [--catalog catalog.measured.json]

Slides that name an `archetype` are cloned from the reference deck and refilled.
Slides that name a `slide_type` are composed from measured house geometry. Both
kinds can sit in one deck. Fails loudly on any slot that overruns its measured
box, so overflow is caught before the file is written.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from deckkit.compose import ComposeError, compose_deck  # noqa: E402
from deckkit.models import ContentPlan, TemplateProfile  # noqa: E402
from deckkit.render import RenderError  # noqa: E402


def main() -> int:
    if len(sys.argv) < 5:
        print(__doc__.strip(), file=sys.stderr)
        return 2
    template, profile_path, content_path, output = (
        Path(argument).expanduser().resolve() for argument in sys.argv[1:5]
    )
    catalog = None
    if "--catalog" in sys.argv:
        catalog_path = Path(sys.argv[sys.argv.index("--catalog") + 1]).expanduser().resolve()
        catalog = json.loads(catalog_path.read_text(encoding="utf-8"))

    profile = TemplateProfile.from_dict(json.loads(profile_path.read_text(encoding="utf-8")))
    try:
        plan = ContentPlan.from_dict(json.loads(content_path.read_text(encoding="utf-8")))
        result = compose_deck(template, profile, plan, output, catalog)
    except (ComposeError, RenderError, ValueError, KeyError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, indent=2))
        return 1
    print(json.dumps({"ok": True, "deck": str(output), **result}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
