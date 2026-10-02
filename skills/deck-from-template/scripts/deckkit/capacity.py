from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path

from PIL import ImageFont

FONT_DIRS = (
    Path("/System/Library/Fonts"),
    Path("/Library/Fonts"),
    Path.home() / "Library/Fonts",
    Path("/usr/share/fonts"),
    Path("/usr/local/share/fonts"),
)


def _normalise(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


@lru_cache(maxsize=1)
def font_index() -> dict[str, Path]:
    index: dict[str, Path] = {}
    for directory in FONT_DIRS:
        if not directory.exists():
            continue
        for path in directory.rglob("*"):
            if path.suffix.lower() not in {".ttf", ".otf", ".ttc"}:
                continue
            key = _normalise(path.stem)
            index.setdefault(key, path)
    return index


def resolve_font(typeface: str) -> tuple[Path, bool]:
    requested = _normalise(typeface)
    index = font_index()
    if requested in index:
        return index[requested], True
    for key, path in index.items():
        if requested and (requested in key or key in requested):
            return path, True
    for fallback in ("arial", "calibri", "aptos", "dejavusans", "liberationsans"):
        for key, path in index.items():
            if fallback in key and "bold" not in key:
                return path, False
    raise FileNotFoundError("No usable TrueType/OpenType font was found")


@lru_cache(maxsize=128)
def load_font(typeface: str, font_pt: float) -> tuple[ImageFont.FreeTypeFont, bool]:
    path, exact = resolve_font(typeface)
    size_px = max(1, round(font_pt * 96 / 72))
    return ImageFont.truetype(str(path), size_px), exact


def wrap_lines(text: str, font: ImageFont.FreeTypeFont, width_px: float) -> list[str]:
    lines: list[str] = []
    paragraphs = text.splitlines() or [""]
    for paragraph in paragraphs:
        words = paragraph.split()
        if not words:
            lines.append("")
            continue
        line = words[0]
        for word in words[1:]:
            candidate = f"{line} {word}"
            if font.getlength(candidate) <= width_px:
                line = candidate
            else:
                lines.append(line)
                line = word
        lines.append(line)
    return lines


def text_fits(
    text: str,
    *,
    typeface: str,
    font_pt: float,
    width_emu: int,
    height_emu: int,
    safety_margin: float = 1.0,
) -> bool:
    font, exact = load_font(typeface, font_pt)
    width_px = width_emu / 914400 * 96
    height_px = height_emu / 914400 * 96
    lines = wrap_lines(text, font, width_px)
    box = font.getbbox("Ag")
    line_height = max(1, box[3] - box[1]) * 1.18
    margin = safety_margin if exact else max(safety_margin, 1.1)
    return len(lines) * line_height * margin <= height_px


def measured_capacity(
    *, typeface: str, font_pt: float, width_emu: int, height_emu: int
) -> int:
    sample = (
        "Evidence points to a clear change in the market and the decision now depends "
        "on where the next move creates the greatest value "
    )

    def candidate(length: int) -> str:
        repeated = (sample * ((length // len(sample)) + 2))[:length]
        cut = repeated.rsplit(" ", 1)[0]
        return cut or repeated

    low, high = 1, 4096
    while low < high:
        mid = (low + high + 1) // 2
        if text_fits(
            candidate(mid),
            typeface=typeface,
            font_pt=font_pt,
            width_emu=width_emu,
            height_emu=height_emu,
        ):
            low = mid
        else:
            high = mid - 1
    _, exact = load_font(typeface, font_pt)
    return max(1, int(low if exact else low * 0.9))

