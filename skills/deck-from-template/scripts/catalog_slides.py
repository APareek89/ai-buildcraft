#!/usr/bin/env python3
"""Fingerprint every slide in a reference deck and render it for inspection.

    python3 catalog_slides.py <reference.pptx> <workdir> [--no-thumbs]

Writes <workdir>/slides.json (structure) and <workdir>/thumbs/*.png (appearance).
Read both, then author catalog.json: the semantic judgement of what each recurring
slide is FOR is yours to make, not something this script guesses.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from deckkit.catalog import fingerprint_deck  # noqa: E402
from deckkit.rasterise import render_thumbnails  # noqa: E402


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__.strip(), file=sys.stderr)
        return 2
    deck = Path(sys.argv[1]).expanduser().resolve()
    workdir = Path(sys.argv[2]).expanduser().resolve()
    if not deck.exists():
        print(f"error: {deck} does not exist", file=sys.stderr)
        return 1
    workdir.mkdir(parents=True, exist_ok=True)

    data = fingerprint_deck(deck)
    (workdir / "slides.json").write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")

    thumbs: list[str] = []
    warning = None
    if "--no-thumbs" not in sys.argv:
        try:
            thumbs = render_thumbnails(deck, workdir / "thumbs")
        except (RuntimeError, subprocess.SubprocessError, OSError) as exc:
            warning = f"thumbnails unavailable: {exc}"

    print(
        json.dumps(
            {
                "source": data["source"],
                "slide_count": data["slide_count"],
                "slides_json": str(workdir / "slides.json"),
                "thumbnails": thumbs,
                "warning": warning,
                "overview": [
                    {
                        "slide": item["slide"],
                        "layout": item["layout"],
                        "shapes": item["shape_count"],
                        "repeating_groups": [
                            f"{group['count']}x {group['axis']}"
                            for group in item["repeating_groups"]
                        ],
                        "title": next(
                            (
                                shape["text"]
                                for shape in item["shapes"]
                                if shape["kind"] == "text" and shape["box"][1] < 0.25
                            ),
                            "",
                        )[:70],
                    }
                    for item in data["slides"]
                ],
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
