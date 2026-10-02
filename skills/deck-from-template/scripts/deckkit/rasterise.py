"""Slide -> PNG, via LibreOffice and whichever PDF rasteriser is installed."""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path


def deck_to_pdf(deck: Path, workdir: Path) -> Path:
    soffice = shutil.which("soffice") or shutil.which("libreoffice")
    if not soffice:
        raise RuntimeError("LibreOffice (soffice) is not installed; cannot rasterise slides")
    subprocess.run(
        [soffice, "--headless", "--convert-to", "pdf", "--outdir", str(workdir), str(deck)],
        check=True,
        capture_output=True,
        timeout=300,
    )
    pdf = workdir / f"{deck.stem}.pdf"
    if not pdf.exists():
        raise RuntimeError("LibreOffice produced no PDF")
    return pdf


def pdf_to_png(pdf: Path, outdir: Path, wanted: set[int] | None = None, dpi: int = 110) -> list[str]:
    outdir.mkdir(parents=True, exist_ok=True)
    written: list[str] = []
    try:
        try:
            import pymupdf as fitz  # type: ignore
        except ImportError:
            import fitz  # type: ignore
        with fitz.open(pdf) as document:
            for index, page in enumerate(document, start=1):
                if wanted and index not in wanted:
                    continue
                target = outdir / f"slide-{index:02d}.png"
                page.get_pixmap(dpi=dpi).save(target)
                written.append(str(target))
        return written
    except ImportError:
        pass
    if not shutil.which("pdftoppm"):
        raise RuntimeError("Install PyMuPDF (pip install pymupdf) or Poppler to rasterise slides")
    subprocess.run(
        ["pdftoppm", "-png", "-r", str(dpi), str(pdf), str(outdir / "slide")],
        check=True,
        capture_output=True,
        timeout=300,
    )
    for path in sorted(outdir.glob("slide-*.png")):
        if wanted and int(path.stem.split("-")[-1]) not in wanted:
            path.unlink()
            continue
        written.append(str(path))
    return written


def render_thumbnails(deck: Path, outdir: Path, wanted: set[int] | None = None, dpi: int = 110) -> list[str]:
    with tempfile.TemporaryDirectory(prefix="deckkit-raster-") as temp:
        return pdf_to_png(deck_to_pdf(deck, Path(temp)), outdir, wanted, dpi)
