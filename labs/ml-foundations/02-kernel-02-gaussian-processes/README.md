# Gaussian processes and Bayesian optimization

**Question:** How can a model say both what it predicts and where it knows too little, then use that uncertainty to choose the next experiment?

Read `explainer.html` for the conceptual lesson, then run `notebook.ipynb`
from top to bottom. Every executable block has conceptual Markdown and a small
example immediately before it.

## Run

```bash
cd ai-buildcraft/labs/ml-foundations
source .venv/bin/activate
jupyter lab
```

Open `02-kernel-02-gaussian-processes/notebook.ipynb` and choose **Run All**. The notebook is
CPU-only, uses seed 0, and regenerates `key_figure.png`.

## Data

Seeded synthetic one-dimensional objective with known truth and five noisy starting observations.

## Validation status

All seven code cells ran locally, in order, on CPU on 2026-10-02 with no
network calls or downloads. Runtime: **0.29 seconds** after imports/font-cache
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

Both searches now share five initial noisy observations and eight new measurements
with noise SD 0.08. Both curves score the **latent objective at queried points**,
never the noisy minimum for one and the noiseless minimum for the other. The
noise-free values are synthetic evaluation-only information. Fifty random runs
provide descriptive 10–90% spread; the single BO run is not evidence of general
superiority. The tuned and deliberately over-smooth kernels receive the same final
observations. Predictive bands include observation noise; grid truth-containment
is not a calibration estimate.

The corrected figure is bundled. Equal 13-point budgets, common latent scoring,
identical data for the two kernels, monotonically improving best-so-far curves,
and the zero-variance expected-improvement limit were checked.

In the verified run, tuned GP grid RMSE was 0.614 and the same-data mean baseline
was 1.231. The deliberately over-smooth GP had a lower RMSE (0.292), yet its narrow
predictive band contained latent truth at only 1.4% of grid points, versus 92.2%
for the tuned model. This illustrates that point error and uncertainty quality
are different properties; these percentages are descriptive, not calibration
estimates. Kernel fits emitted lower-bound convergence warnings for length scale
or noise: inspect such warnings and repeat across seeds before drawing a broader
conclusion. The notebook explains the remaining plug-in EI limitation with a
noisy incumbent.
