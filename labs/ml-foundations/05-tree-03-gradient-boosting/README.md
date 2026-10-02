# Gradient boosting: XGBoost, LightGBM, and CatBoost

**Question:** How do three boosting libraries repair errors sequentially, and how do early stopping and monotonic constraints control them?

Read `explainer.html` for the conceptual lesson, then run `notebook.ipynb`
from top to bottom. Every executable block has conceptual Markdown and a small
example immediately before it.

## Run

```bash
cd ai-buildcraft/labs/ml-foundations
source .venv/bin/activate
jupyter lab
```

Open `05-tree-03-gradient-boosting/notebook.ipynb` and choose **Run All**. The notebook is
CPU-only, uses seed 0, and regenerates `key_figure.png`.

## Data

Scikit-learn Wisconsin breast-cancer dataset.

## Runtime budget

Planned clean-kernel runtime: 90 seconds; hard limit: 180 seconds. The
verified runtime is recorded in the root `PLAN.md`.

## Files

- `notebook.ipynb` — executable lesson
- `explainer.html` — double-click teaching page
- `key_figure.png` — notebook-generated central result
- `README.md` — this guide
