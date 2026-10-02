#!/usr/bin/env python3
"""Rasterise a deck to PNGs so the slides can actually be looked at.

    python3 preview_deck.py <deck.pptx> <outdir> [--slides 1,4,7]

Requires LibreOffice (`soffice`) plus PyMuPDF or Poppler.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from deckkit.rasterise import render_thumbnails  # noqa: E402


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__.strip(), file=sys.stderr)
        return 2
    deck = Path(sys.argv[1]).expanduser().resolve()
    outdir = Path(sys.argv[2]).expanduser().resolve()
    wanted: set[int] | None = None
    if "--slides" in sys.argv:
        raw = sys.argv[sys.argv.index("--slides") + 1]
        wanted = {int(part) for part in raw.split(",") if part.strip()}
    try:
        images = render_thumbnails(deck, outdir, wanted)
    except (RuntimeError, subprocess.SubprocessError, OSError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, indent=2))
        return 1
    print(json.dumps({"ok": True, "images": images}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
