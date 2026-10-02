# Reinforcement learning: Q-learning and PPO

**Question:** How do value updates learn a grid policy, and what changes when PPO learns a neural policy on CartPole?

Read `explainer.html` for the conceptual lesson, then run `notebook.ipynb`
from top to bottom. Every executable block has conceptual Markdown and a small
example immediately before it.

## Run

```bash
cd ai-buildcraft/labs/ml-foundations
source .venv/bin/activate
jupyter lab
```

Open `09-nn-12-reinforcement-learning/notebook.ipynb` and choose **Run All**. The notebook is
CPU-only, uses seed 0, and regenerates `key_figure.png`.

## Data

Local seeded gridworld and Gymnasium CartPole-v1; no download.

## Runtime budget

Planned clean-kernel runtime: 150 seconds; hard limit: 180 seconds. The
verified runtime is recorded in the root `PLAN.md`.

## Files

- `notebook.ipynb` — executable lesson
- `explainer.html` — double-click teaching page
- `key_figure.png` — notebook-generated central result
- `README.md` — this guide
