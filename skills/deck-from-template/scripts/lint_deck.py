#!/usr/bin/env python3
"""Deterministic pre-flight on a rendered deck.

    python3 lint_deck.py <deck.pptx> [fallback-font]

Checks bounds, the 0.4in safe margin, measured text overflow, minimum font size,
4.5:1 text contrast, leftover placeholder text, empty placeholders, and overlap.
Exit code 1 when any issue is found.
"""

from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from deckkit.lint import lint_deck  # noqa: E402


def main() -> int:
    if not 2 <= len(sys.argv) <= 3:
        print(__doc__.strip(), file=sys.stderr)
        return 2
    deck = Path(sys.argv[1]).expanduser().resolve()
    font = sys.argv[2] if len(sys.argv) == 3 else "Arial"
    issues = lint_deck(deck, font)
    print(
        json.dumps(
            {
                "deck": str(deck),
                "issue_count": len(issues),
                "by_code": dict(Counter(issue["code"] for issue in issues)),
                "issues": issues,
            },
            indent=2,
        )
    )
    return 1 if issues else 0


if __name__ == "__main__":
    raise SystemExit(main())
