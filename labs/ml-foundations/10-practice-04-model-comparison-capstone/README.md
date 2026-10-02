# Model comparison capstone

**Question:** Which of six model families performs best under one honest protocol, and are the differences larger than uncertainty?

Read `explainer.html` for the conceptual lesson, then run `notebook.ipynb`
from top to bottom. Every executable block has conceptual Markdown and a small
example immediately before it.

## Run

```bash
cd ai-buildcraft/labs/ml-foundations
source .venv/bin/activate
jupyter lab
```

Open `10-practice-04-model-comparison-capstone/notebook.ipynb` and choose **Run All**. The notebook is
CPU-only, uses seed 0, and regenerates `key_figure.png`.

## Data

Scikit-learn Wisconsin breast-cancer dataset; six families and 20 shared resamples.

## Runtime budget

Planned clean-kernel runtime: 150 seconds; hard limit: 180 seconds. The
verified runtime is recorded in the root `PLAN.md`.

## Files

- `notebook.ipynb` — executable lesson
- `explainer.html` — double-click teaching page
- `key_figure.png` — notebook-generated central result
- `README.md` — this guide
