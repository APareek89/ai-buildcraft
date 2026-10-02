# GLMs: Poisson and Gamma

**Question:** Why should counts and positive skewed amounts use a likelihood and link that respect their shape?

Read `explainer.html` for the conceptual lesson, then run `notebook.ipynb`
from top to bottom. Every executable block has conceptual Markdown and a small
example immediately before it.

## Run

```bash
cd ai-buildcraft/labs/ml-foundations
source .venv/bin/activate
jupyter lab
```

Open `01-linear-04-glm-poisson-and-gamma/notebook.ipynb` and choose **Run All**. The notebook is
CPU-only, uses seed 0, and regenerates `key_figure.png`.

## Data

Two seeded synthetic targets with known Poisson and Gamma means. No download or licence restriction.

## Runtime budget

Planned clean-kernel runtime: 30 seconds; hard limit: 180 seconds. The
verified runtime is recorded in the root `PLAN.md`.

## Files

- `notebook.ipynb` — executable lesson
- `explainer.html` — double-click teaching page
- `key_figure.png` — notebook-generated central result
- `README.md` — this guide
