# Autoencoders for anomaly detection

**Question:** Can reconstruction error identify images unlike the normal-only training distribution?

Read `explainer.html` for the conceptual lesson, then run `notebook.ipynb`
from top to bottom. Every executable block has conceptual Markdown and a small
example immediately before it.

## Run

```bash
cd ai-buildcraft/labs/ml-foundations
source .venv/bin/activate
jupyter lab
```

Open `09-nn-07-autoencoders-and-anomaly/notebook.ipynb` and choose **Run All**. The notebook is
CPU-only, uses seed 0, and regenerates `key_figure.png`.

## Data

Scikit-learn real 8×8 digits; normal classes 0–4 and anomaly classes 8–9.

## Runtime budget

Planned clean-kernel runtime: 90 seconds; hard limit: 180 seconds. The
verified runtime is recorded in the root `PLAN.md`.

## Files

- `notebook.ipynb` — executable lesson
- `explainer.html` — double-click teaching page
- `key_figure.png` — notebook-generated central result
- `README.md` — this guide
