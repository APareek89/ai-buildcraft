#!/usr/bin/env python3
"""Extract a reusable profile (theme, fonts, layouts, measured slot capacities) from a deck.

    python3 extract_template.py <reference.pptx|.potx> <workdir>

Writes <workdir>/profile.json and prints a compact, model-readable summary.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from deckkit.profile import compact_profile, extract_template_profile  # noqa: E402


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__.strip(), file=sys.stderr)
        return 2
    template = Path(sys.argv[1]).expanduser().resolve()
    workdir = Path(sys.argv[2]).expanduser().resolve()
    if not template.exists():
        print(f"error: {template} does not exist", file=sys.stderr)
        return 1
    if template.suffix.lower() not in {".pptx", ".potx"}:
        print("error: reference must be a .pptx or .potx file", file=sys.stderr)
        return 1
    workdir.mkdir(parents=True, exist_ok=True)

    profile = extract_template_profile(template)
    (workdir / "profile.json").write_text(
        json.dumps(profile.to_dict(), indent=2) + "\n", encoding="utf-8"
    )
    summary = compact_profile(profile)
    summary["template_path"] = str(template)
    summary["profile_path"] = str(workdir / "profile.json")
    summary["fonts_installed"] = profile.theme.font_available
    summary["slide_type_origins"] = {item.id: item.origin for item in profile.slide_types}
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
