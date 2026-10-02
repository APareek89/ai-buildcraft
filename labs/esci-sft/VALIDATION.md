# Validation

## AI Buildcraft export — 2026-10-02

The private review copy was checked without downloading data or model assets:

- Unit tests: **29 passed, 1 skipped** (30 discovered). The skipped integration test requires a real tokenizer installed locally.
- Python scripts and all 11 exploration notebook code cells parsed successfully.
- The notebook has no saved outputs or execution counts. Its data-root resolver supports this collection layout and explains which preparation commands are required when data is absent.
- The download script passed `bash -n`.
- Raw data, prepared data, cached tokenizers, virtual environments, run logs and historical notebook outputs are excluded.

The unit tests exercise cleaning, filtering, query isolation, sampling, quotas, output validation, prediction parsing and metric arithmetic with small fixtures. These checks do **not** establish a fresh full-dataset run, model quality or successful training. No model weights, training, inference or paid API requests were used for this export.

## Repeat locally

From this package directory, after the dependency setup in [README.md](README.md):

```bash
HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 python -m unittest discover -s tests -v
bash -n scripts/download.sh
```

Follow the README download and preparation steps to create the data required by `explore_esci.ipynb`. The notebook reads that generated data locally. An optional `train.json` viewing copy is supported but is not required.

## Historical source runs

The original local project reported successful preparation, deterministic sampling, scorer round trips and an executed exploration notebook in September 2026. Those run artifacts are not distributed here, and those claims have not been reproduced for this export. This package includes reproducible preparation code and tests rather than treating historical logs or gold-response round trips as model performance evidence.

Public upstream dataset attribution remains in [LICENSE](licenses/LICENSE) and [NOTICE](licenses/NOTICE); dataset access and model tokenizer access retain their respective upstream terms.
