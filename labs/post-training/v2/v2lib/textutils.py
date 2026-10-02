"""Small text helpers: realistic typos, normalisation and overlap measures."""
from __future__ import annotations

import random
import re
import unicodedata

KEYBOARD = {c: n for c, n in zip("qwertyuiopasdfghjklzxcvbnm", "wqeryutoipsadgfhkjlxzcvnbm")}
PROTECTED = re.compile(r"(meridian|arc|pulse|volt|mumbai|bengaluru|delhi|\d)", re.I)


def add_typo(text: str, rng: random.Random) -> str:
    """One realistic single-character slip in one content word (never numbers or model/city names)."""
    words = text.split(" ")
    idx = [i for i, w in enumerate(words) if len(re.sub(r"\W", "", w)) >= 5 and not PROTECTED.search(w)]
    if not idx:
        return text
    i = rng.choice(idx)
    w = words[i]
    letters = [j for j, ch in enumerate(w) if ch.isalpha()]
    j = rng.choice(letters[1:-1] or letters)
    kind = rng.choice(["drop", "swap", "double", "neighbour"])
    if kind == "drop":
        w = w[:j] + w[j + 1:]
    elif kind == "swap" and j + 1 < len(w) and w[j + 1].isalpha():
        w = w[:j] + w[j + 1] + w[j] + w[j + 2:]
    elif kind == "double":
        w = w[:j] + w[j] + w[j:]
    else:
        ch = w[j].lower()
        w = w[:j] + KEYBOARD.get(ch, ch) + w[j + 1:]
    words[i] = w
    return " ".join(words)


def norm(text: str) -> str:
    text = unicodedata.normalize("NFKC", text).casefold()
    text = re.sub(r"[\W_]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def tokens(text: str) -> set[str]:
    return set(norm(text).split())


def jaccard(a: str, b: str) -> float:
    ta, tb = tokens(a), tokens(b)
    return len(ta & tb) / max(1, len(ta | tb))
