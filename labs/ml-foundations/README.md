# ML foundations: 43 hands-on labs

**[Browse the curriculum](index.html)** · [Glossary](GLOSSARY.html) · [Visual learning library](../../learn/index.html)

Each lesson pairs a notebook, a conversational HTML explainer and a saved teaching figure. The sequence covers foundations, linear models, kernels, probabilistic methods, trees, geometry, latent factors, time series, neural networks and evaluation practice.

## Run a lesson

Use Python 3.11. From this folder:

```bash
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
jupyter lab
```

Open a lesson's `notebook.ipynb`. Run it from its own lesson directory, as Jupyter normally does, so relative figure and cache paths resolve correctly. Start with `00-foundations-01-the-ml-workflow` and follow numeric order.

The dependency file preserves the original curriculum's pinned environment. A clean installation and all 43 training runs have not been repeated for this packaged edition. Some compiled libraries require platform-specific setup. On macOS, `python setup_env.py` is an optional compatibility helper that adjusts the lab's virtual-environment OpenMP search path for LightGBM/XGBoost; it refuses environments outside this folder.

## Data and model downloads

Most lessons generate seeded synthetic data or load datasets included with their Python libraries. No downloaded datasets or weights are included. Read each lesson's Data section before running it.

For the following lessons, run the helper before opening the notebook:

```bash
python 07-latent-03-matrix-factorization-recsys/data/download.py
python 09-nn-02-cnn-image-classification/data/download.py
python 09-nn-03-transfer-learning/data/download.py
python 09-nn-04-unet-segmentation/data/download.py
```

These download MovieLens 100k, Fashion-MNIST and torchvision MobileNetV3 weights to `_shared_data/`. Downloads require internet access and storage; they do not require paid API credentials. MovieLens is provided by [GroupLens](https://grouplens.org/datasets/movielens/100k/); review its research-use terms. [Fashion-MNIST](https://github.com/zalandoresearch/fashion-mnist) and [torchvision models](https://pytorch.org/vision/stable/models.html) have their own licenses and provenance. This repository's license does not replace those terms. Vector search has a deterministic TF-IDF fallback when an embedding model is not cached.

## Evidence and validation

Notebook outputs, execution counts and personal metadata have been removed. Saved PNGs are historical teaching figures, not evidence of a fresh execution of this repository. Running a notebook produces your own metrics and replaces its figure. Keep baseline comparisons, split choices and failure cases alongside any result you share.

`python ../../learn/validate.py` performs static packaging checks without running the experiments. This initial edition has not freshly executed all notebooks; compatibility fixes and reproduced results are valuable contributions.

## Contribute a lesson

Keep model code visible in the notebook. Explain each code cell, use a small worked example, separate training/validation/test roles, compare against a baseline, and include a deliberate failure experiment. Prefer CPU-sized experiments. Clear outputs and exclude caches before committing.
