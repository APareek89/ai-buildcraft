# Time-series decomposition and baselines

**Question:** What does trend-seasonal decomposition reveal, and why must a seasonal-naive forecast be beaten?

Read `explainer.html` for the conceptual lesson, then run `notebook.ipynb`
from top to bottom. Every executable block has conceptual Markdown and a small
example immediately before it.

## Run

```bash
cd ai-buildcraft/labs/ml-foundations
source .venv/bin/activate
jupyter lab
```

Open `08-ts-01-decomposition-and-baselines/notebook.ipynb` and choose **Run All**. The notebook is
CPU-only, uses seed 0, and regenerates `key_figure.png`.

## Data

Seeded 96-month trend-seasonal series with a known intervention.

## Runtime budget

Planned clean-kernel runtime: 15 seconds; hard limit: 180 seconds. The
verified runtime is recorded in the root `PLAN.md`.

## Files

- `notebook.ipynb` — executable lesson
- `explainer.html` — double-click teaching page
- `key_figure.png` — notebook-generated central result
- `README.md` — this guide
