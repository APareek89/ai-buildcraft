# Regularization: ridge, lasso, and elastic net

**Question:** How do coefficient penalties trade a little bias for stability and feature selection?

Read `explainer.html` for the conceptual lesson, then run `notebook.ipynb`
from top to bottom. Every executable block has conceptual Markdown and a small
example immediately before it.

## Run

```bash
cd ai-buildcraft/labs/ml-foundations
source .venv/bin/activate
jupyter lab
```

Open `01-linear-03-regularization/notebook.ipynb` and choose **Run All**. The notebook is
CPU-only, uses seed 0, and regenerates `key_figure.png`.

## Data

Seeded synthetic correlated regression with three known nonzero coefficients. No download or licence restriction.

## Validation status

All seven code cells ran locally, in order, on CPU on 2026-10-02 with no
network calls or downloads. Runtime: **3.83 seconds** after imports/font-cache
setup. Both the experiment and `key_figure.png` were regenerated. Notebook outputs
remain cleared for distribution.

Environment: Python 3.12.14, NumPy 2.5.3, pandas 3.0.6, scikit-learn 1.9.1.
The lesson uses Matplotlib directly and does not require seaborn.

## Files

- `notebook.ipynb` — executable lesson
- `explainer.html` — double-click teaching page
- `key_figure.png` — notebook-generated central result
- `README.md` — this guide

## Evaluation correction

The previous version fitted scaling before internal cross-validation. Selection now
uses the existing 60/20/20 split: learn the scaler and all candidates on training
rows; choose each penalty and the family by validation RMSE; evaluate only the
frozen winner and the mean baseline on final test rows. The elastic-net path fixes
L1 ratio at 0.5; model selection tries 0.2, 0.5, and 0.8. The regenerated plot shows the corrected coefficient paths. In the checked run,
validation selected lasso; its final test RMSE was 0.936 versus 6.984 for the mean
baseline. Split disjointness, training-only scaling, validation selection, and all
35 coefficient-path points per family were checked.
