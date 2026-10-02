#!/usr/bin/env python3
"""Validate a hand-authored catalog and attach measured capacities to every slot.

    python3 measure_catalog.py <reference.pptx> <catalog.json> <out.measured.json>

Resolves each slot to a real shape on its source slide, records that shape's
geometry and font size, and measures how many characters actually fit. Errors
here mean the catalog points at a shape that is not what it claims to be.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from deckkit.catalog import measure_catalog  # noqa: E402


def main() -> int:
    if len(sys.argv) != 4:
        print(__doc__.strip(), file=sys.stderr)
        return 2
    deck, catalog_path, output = (
        Path(argument).expanduser().resolve() for argument in sys.argv[1:4]
    )
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    try:
        measured = measure_catalog(deck, catalog)
    except (ValueError, KeyError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, indent=2))
        return 1
    output.write_text(json.dumps(measured, indent=2) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "ok": True,
                "catalog": str(output),
                "archetypes": [
                    {
                        "id": item["id"],
                        "source_slide": item["source_slide"],
                        "use_for": item.get("use_for", ""),
                        "slots": [
                            {
                                "name": slot["name"],
                                "kind": slot["kind"],
                                "max_chars": slot.get("max_chars"),
                                "rows": slot.get("rows"),
                                "cols": slot.get("cols"),
                            }
                            for slot in item.get("slots", [])
                        ],
                    }
                    for item in measured.get("archetypes", [])
                ],
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
