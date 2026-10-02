# k-nearest neighbours

**Question:** When does remembering nearby examples work, and why do units and extra dimensions quietly destroy the idea of nearby?

Read `explainer.html` for the conceptual lesson, then run `notebook.ipynb`
from top to bottom. Every executable block has conceptual Markdown and a small
example immediately before it.

## Run

```bash
cd ai-buildcraft/labs/ml-foundations
source .venv/bin/activate
jupyter lab
```

Open `03-instance-01-knn/notebook.ipynb` and choose **Run All**. The notebook is
CPU-only, uses seed 0, and regenerates `key_figure.png`.

## Data

Seeded two-feature synthetic classification with a deliberate 100× unit mismatch.

## Runtime budget

Planned clean-kernel runtime: 30 seconds; hard limit: 180 seconds. The
verified runtime is recorded in the root `PLAN.md`.

## Files

- `notebook.ipynb` — executable lesson
- `explainer.html` — double-click teaching page
- `key_figure.png` — notebook-generated central result
- `README.md` — this guide
