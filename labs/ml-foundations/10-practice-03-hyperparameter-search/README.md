# Grid, random, and Optuna search

**Question:** Under an identical 24-candidate budget, how differently do grid, random, and Bayesian search explore an SVM?

Read `explainer.html` for the conceptual lesson, then run `notebook.ipynb`
from top to bottom. Every executable block has conceptual Markdown and a small
example immediately before it.

## Run

```bash
cd ai-buildcraft/labs/ml-foundations
source .venv/bin/activate
jupyter lab
```

Open `10-practice-03-hyperparameter-search/notebook.ipynb` and choose **Run All**. The notebook is
CPU-only, uses seed 0, and regenerates `key_figure.png`.

## Data

Scikit-learn Wisconsin breast-cancer dataset.

## Runtime budget

Planned clean-kernel runtime: 100 seconds; hard limit: 180 seconds. The
verified runtime is recorded in the root `PLAN.md`.

## Files

- `notebook.ipynb` — executable lesson
- `explainer.html` — double-click teaching page
- `key_figure.png` — notebook-generated central result
- `README.md` — this guide
