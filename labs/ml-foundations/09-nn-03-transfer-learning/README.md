# Transfer learning on a small real image set

**Question:** Does a pretrained visual backbone learn faster than the same architecture starting from random weights under one small budget?

Read `explainer.html` for the conceptual lesson, then run `notebook.ipynb`
from top to bottom. Every executable block has conceptual Markdown and a small
example immediately before it.

## Run

```bash
cd ai-buildcraft/labs/ml-foundations
source .venv/bin/activate
jupyter lab
```

Open `09-nn-03-transfer-learning/notebook.ipynb` and choose **Run All**. The notebook is
CPU-only, uses seed 0, and regenerates `key_figure.png`.

## Data

FashionMNIST via torchvision (Zalando Research, MIT licence) plus MobileNetV3 ImageNet weights; generated fallback.

## Runtime budget

Planned clean-kernel runtime: 150 seconds; hard limit: 180 seconds. The
verified runtime is recorded in the root `PLAN.md`.

## Files

- `notebook.ipynb` — executable lesson
- `explainer.html` — double-click teaching page
- `key_figure.png` — notebook-generated central result
- `README.md` — this guide
