# Linear regression

**Question:** How does a straight-line model turn several measurements into an honest numerical prediction?

Read `explainer.html` for the conceptual lesson, then run `notebook.ipynb`
from top to bottom. Every executable block has conceptual Markdown and a small
example immediately before it.

## Run

```bash
cd ai-buildcraft/labs/ml-foundations
source .venv/bin/activate
jupyter lab
```

Open `01-linear-01-linear-regression/notebook.ipynb` and choose **Run All**. The notebook is
CPU-only, uses seed 0, and regenerates `key_figure.png`.

## Data

Seeded synthetic regression with known coefficients `[2.0, -1.5, 0.7]` and heteroscedastic Gaussian noise. No download or licence restriction.

## Runtime budget

Planned clean-kernel runtime: 15 seconds; hard limit: 180 seconds. The
verified runtime is recorded in the root `PLAN.md`.

## Files

- `notebook.ipynb` — executable lesson
- `explainer.html` — double-click teaching page
- `key_figure.png` — notebook-generated central result
- `README.md` — this guide
