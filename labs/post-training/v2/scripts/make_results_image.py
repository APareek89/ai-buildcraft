"""LinkedIn / README image: base vs SFT v1 vs SFT v2 (all with RAG) on dev_v2, from runs/headline_compare.json.
Run: ../.venv/bin/python scripts/make_results_image.py <output.png>
"""
import json
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib import font_manager  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "runs/v2_results.png"
data = json.loads((ROOT / "runs/headline_compare.json").read_text())
T = {(r["model"], r["eval_set"]): r for r in data["table"]}

# Tokens (reference palette, light mode): one accent for v2, neutral context for the others.
SURFACE, INK, INK2, MUTED, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#86857f", "#e4e3df"
ACCENT = "#2a78d6"
for name in ["Helvetica Neue", "Helvetica", "Arial"]:
    if any(name in f.name for f in font_manager.fontManager.ttflist):
        plt.rcParams["font.family"] = name
        break

SYSTEMS = [("base", "Base model + RAG", "no fine-tuning", MUTED),
           ("sft_v1", "SFT v1 + RAG", "first training data", MUTED),
           ("sft_v2", "SFT v2 + RAG", "rebuilt training data", ACCENT)]
PANELS = [("correct", "n_ans", "Answered correctly", "60 questions the documents can answer"),
          ("refused", "n_unans", "Said “I don't have that”", "80 questions the documents can't answer")]

fig = plt.figure(figsize=(10.8, 13.5), dpi=100, facecolor=SURFACE)
fig.text(0.06, 0.945, "Same 0.5B model. Same laptop.", fontsize=34, fontweight="bold", color=INK, va="top")
fig.text(0.06, 0.900, "Only the training data changed.", fontsize=34, fontweight="bold", color=ACCENT, va="top")
fig.text(0.06, 0.848, "Customer-support Q&A for a fictional scooter brand · 140 new test questions\n"
                      "worded differently from training · graded blind by Gemini against a rubric",
         fontsize=15, color=INK2, va="top", linespacing=1.5)

for i, (key, nkey, title, sub) in enumerate(PANELS):
    top = 0.738 - i * 0.285
    ax = fig.add_axes([0.06, top - 0.20, 0.88, 0.17], facecolor=SURFACE)
    fig.text(0.06, top + 0.012, title, fontsize=21, fontweight="bold", color=INK, va="bottom")
    fig.text(0.06, top - 0.005, sub, fontsize=14, color=INK2, va="top")
    ys = list(range(len(SYSTEMS)))[::-1]
    for y, (mid, label, note, color) in zip(ys, SYSTEMS):
        r = T[(mid, "dev_v2")]
        k, n = r[key], r[nkey]
        pct = 100 * k / n
        ax.barh(y, pct, height=0.56, color=color, edgecolor=SURFACE, linewidth=2, zorder=3)
        ax.text(pct + 1.2, y, f"{pct:.0f}%  ({k}/{n})", va="center", ha="left", fontsize=17,
                fontweight="bold" if mid == "sft_v2" else "normal", color=INK, zorder=4,
                bbox=dict(boxstyle="round,pad=0.18", facecolor=SURFACE, edgecolor="none"))
        ax.text(-1.5, y + 0.06, label, va="bottom", ha="right", fontsize=15,
                fontweight="bold" if mid == "sft_v2" else "normal", color=INK)
        ax.text(-1.5, y + 0.02, note, va="top", ha="right", fontsize=12, color=INK2)
    ax.axvline(80, color=INK2, linestyle=(0, (4, 3)), linewidth=1.4, zorder=2)
    ax.text(80, len(SYSTEMS) - 0.32, "80% target, set before training", fontsize=11.5, color=INK2, ha="center", va="bottom",
            bbox=dict(boxstyle="round,pad=0.15", facecolor=SURFACE, edgecolor="none"), zorder=5)
    ax.set_xlim(0, 118)
    ax.set_ylim(-0.6, len(SYSTEMS) - 0.25)
    ax.set_xticks([0, 20, 40, 60, 80, 100])
    ax.set_xticklabels([f"{t}%" for t in [0, 20, 40, 60, 80, 100]], fontsize=11, color=INK2)
    ax.set_yticks([])
    ax.grid(axis="x", color=GRID, linewidth=0.8, zorder=0)
    for s in ["top", "right", "left"]:
        ax.spines[s].set_visible(False)
    ax.spines["bottom"].set_color(GRID)
    ax.tick_params(axis="x", length=0)

# Left padding for labels: shift axes right so labels have room.
for ax in fig.axes:
    pos = ax.get_position()
    ax.set_position([0.36, pos.y0, 0.58, pos.height])

fig.text(0.06, 0.205, "What changed in v2", fontsize=19, fontweight="bold", color=INK, va="top")
bullets = ["Refusal examples for money and policy questions, not just missing specs",
           "Trained on the exact RAG prompts it is served with",
           "The same trap words on answer-side and refuse-side examples"]
for j, b in enumerate(bullets):
    fig.text(0.075, 0.168 - j * 0.031, "•  " + b, fontsize=15, color=INK, va="top")
fig.text(0.06, 0.03, "Qwen2.5-0.5B-Instruct · LoRA · Apple M4 laptop · one run · open-source template: github.com/APareek89/Post-Training-Lab",
         fontsize=11.5, color=INK2, va="bottom")
fig.savefig(OUT, facecolor=SURFACE, dpi=100)
print("saved", OUT)
