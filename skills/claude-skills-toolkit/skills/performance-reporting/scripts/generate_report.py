#!/usr/bin/env python3
"""
Performance Reporting Skill — DOCX Report Generator

Generates a polished Word document report from PostHog funnel data.

Usage:
    python3 generate_report.py [--period weekly|monthly] [--output report.docx]

Requires: python-docx (`pip install python-docx`)
"""

import os
import json
from datetime import datetime
from pathlib import Path

try:
    from docx import Document
    from docx.shared import Inches, Pt, RGBColor
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.enum.table import WD_TABLE_ALIGNMENT
    from docx.oxml.ns import nsdecls
    from docx.oxml import parse_xml
except ImportError:
    print("ERROR: python-docx not installed. Run: pip install python-docx")
    exit(1)

# ── Color palette ──
DARK = RGBColor(0x1A, 0x1A, 0x2E)
ACCENT = RGBColor(0x4A, 0x6C, 0xF7)
GREEN = RGBColor(0x10, 0xB9, 0x81)
RED = RGBColor(0xEF, 0x44, 0x44)
GRAY = RGBColor(0x6B, 0x72, 0x80)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
HEADER_BG = "1A1A2E"
ROW_ALT = "F1F5F9"


def set_cell_shading(cell, color_hex):
    shading = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{color_hex}"/>')
    cell._tc.get_or_add_tcPr().append(shading)


def fmt(n):
    return f"{n:,}"


def pct_change(curr, prior):
    if prior == 0:
        return "—" if curr == 0 else "+∞"
    change = ((curr - prior) / prior) * 100
    sign = "+" if change > 0 else ""
    return f"{sign}{change:.1f}%"


def add_styled_table(doc, headers, rows):
    table = doc.add_table(rows=1 + len(rows), cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.style = "Table Grid"

    for i, h in enumerate(headers):
        cell = table.rows[0].cells[i]
        cell.text = ""
        p = cell.paragraphs[0]
        run = p.add_run(h)
        run.bold = True
        run.font.size = Pt(9)
        run.font.color.rgb = WHITE
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        set_cell_shading(cell, HEADER_BG)

    for r_idx, row in enumerate(rows):
        for c_idx, val in enumerate(row):
            cell = table.rows[r_idx + 1].cells[c_idx]
            cell.text = str(val)
            cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
            cell.paragraphs[0].runs[0].font.size = Pt(9) if cell.paragraphs[0].runs else None
            if r_idx % 2 == 1:
                set_cell_shading(cell, ROW_ALT)

    return table


def generate_report(data, period="weekly", output_path=None):
    """Generate a DOCX report from dashboard data."""
    doc = Document()

    # Title
    title = doc.add_heading(f"Performance Report — {period.title()}", 0)
    doc.add_paragraph(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    doc.add_paragraph("")

    # Executive Summary
    doc.add_heading("Executive Summary", level=1)
    doc.add_paragraph(
        "This report covers key performance metrics including conversion funnels, "
        "user engagement, and revenue indicators."
    )

    # Funnel Section
    if "funnels" in data:
        doc.add_heading("Conversion Funnels", level=1)
        for tool, periods_data in data["funnels"].items():
            doc.add_heading(f"{tool.title()} Funnel", level=2)
            if "7d" in periods_data:
                steps = periods_data["7d"]
                headers = ["Step", "Users", "Conversion"]
                rows = []
                step_labels = [f"Step {i+1}" for i in range(len(steps))]
                for i, val in enumerate(steps):
                    conv = f"{val/steps[0]*100:.1f}%" if steps[0] > 0 else "—"
                    rows.append([step_labels[i], fmt(val), conv])
                add_styled_table(doc, headers, rows)
                doc.add_paragraph("")

    # Save
    if not output_path:
        output_dir = Path(__file__).resolve().parent.parent
        output_path = output_dir / f"report-{period}-{datetime.now().strftime('%Y%m%d')}.docx"

    doc.save(str(output_path))
    print(f"Report saved to: {output_path}")
    return output_path


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--period", default="weekly", choices=["weekly", "monthly"])
    parser.add_argument("--output", default=None)
    args = parser.parse_args()

    # Load latest data
    data_file = Path(__file__).resolve().parent.parent / "references" / "latest-data.json"
    if not data_file.exists():
        print(f"ERROR: No data file found at {data_file}")
        print("Run fetch_data.py first to populate dashboard data.")
        return

    with open(data_file) as f:
        data = json.load(f)

    generate_report(data, args.period, args.output)


if __name__ == "__main__":
    main()
