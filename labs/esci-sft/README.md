# ESCI SFT dataset builder

Build pointwise and listwise chat datasets for a product-search relevance judge.
This folder contains data preparation and scoring scripts plus a small exploration
notebook. There is no training code, inference call, or model weight download. The default tokenizer is
`Qwen/Qwen2.5-3B`; `Qwen/Qwen3-4B-Base` is also supported.

## Start from a fresh clone

This edition contains the code, clean exploration notebook, tests and upstream
license notices. **Raw ESCI files, prepared JSONL, tokenizer caches and historical
run outputs are not bundled.** Run the pipeline before the notebook.

```bash
python3 -m venv .venv       # Python 3.10+
.venv/bin/python -m pip install -r requirements.txt
bash scripts/download.sh
.venv/bin/python scripts/prepare_esci_sft.py --small
```

The downloader reads the official Amazon Science repository, validates the file
schemas and checks downloaded bytes against an immutable upstream revision.
It preserves valid local files. If direct download fails, the fallback needs
Git LFS installed on your machine. The three source files total about 1.16 GB.
The builder downloads the chosen tokenizer; it does not download model weights
or make inference calls. Public downloads need network access, but no API key.

Outputs are generated into `data/sft/`. The builder refuses to overwrite existing
outputs unless `--overwrite` is explicit. Use `--output-dir` for a new run.

## Explore the data

After preparing the data:

```bash
.venv/bin/python -m pip install -r requirements-explore.txt
```

Open `explore_esci.ipynb` in VS Code and select `.venv/bin/python`. Run the cells
in order. The notebook shows split counts, label distributions, full conversations,
search filters, measured token statistics and data-leakage checks. Its saved
outputs have been cleared. It reads local data and makes no provider calls.
An optional `train.json` viewing copy is checked against JSONL when present;
otherwise the notebook reads `train.jsonl` directly.

## Sizes and controls

Default counts are train 8,000 pointwise + 1,000 listwise; validation 600 + 100;
test 2,000 + 300. `--small` changes them to 800 + 100, 100 + 20, and 300 + 50.

Training pointwise targets 40% Exact, 30% Substitute, 20% Irrelevant and 10%
Complement, with at most three pointwise rows per query. When a class quota is
infeasible, eligible rows from other classes fill the gap. Validation/test
pointwise sample shuffled query blocks without label stratification; finite
samples and the length filter can change their observed proportions.

Listwise records contain 4–8 products from a single query, with at least two
labels when available among unused eligible products. Listwise diversity is an
explicit sampling constraint, so its label mix need not match natural source
proportions. Every original `example_id` is used at most once across all output
files and formats. The two test files therefore use different source pairs.

All text is cleaned, title/bullet/description character limits applied, and
rows with empty titles removed. Full chat token lengths include the gold
assistant message and special tokens. Limits default to 768 pointwise and
1,536 listwise tokens. Rejected candidates are counted and sampling continues
to reach the requested sizes when enough eligible data remains.

Useful commands:

```bash
# Full default sizes in a separate output directory.
.venv/bin/python scripts/prepare_esci_sft.py --output-dir data/sft_full

# Use the other base model's own tokenizer and native chat template.
.venv/bin/python scripts/prepare_esci_sft.py --small --model Qwen/Qwen3-4B-Base --output-dir data/sft_qwen3

# Optional: use a tokenizer directory you downloaded and pinned yourself.
.venv/bin/python scripts/prepare_esci_sft.py --small --tokenizer-path /path/to/local-tokenizer --output-dir data/sft_repeat

.venv/bin/python scripts/prepare_esci_sft.py --help
```

CLI options include `--seed`, `--val-fraction`, `--model`, `--revision`,
`--tokenizer-path`, both token limits, and each of the six
`--{train,val,test}-{pointwise,listwise}` counts. Explicit counts override the
selected size preset. Keep source bytes, tokenizer revision and dependencies
fixed for deterministic output. The Qwen3 native template may add an empty
thinking wrapper during serialization; it is included in token counts. Saved
assistant message contents remain exactly the label word or label JSON.

## Outputs

- `data/sft/train.jsonl`: shuffled mixture of both training formats.
- `data/sft/val.jsonl`: both validation formats.
- `data/sft/test_pointwise.jsonl` and `test_listwise.jsonl`: separate test formats.
- `data/sft/stats.json`: counts, class distributions, length percentiles,
  filtering, checks, source/tokenizer identities and output hashes.
- `data/sft/README.md`: actual recipe, source citation and the exact system rubrics.

The official train queries are split into train/validation by query ID, with 5%
assigned to validation using seed 42. Official test stays test. Any training
query IDs also found in official test are quarantined and counted before the
split. All overlap and output-label assertions run before writing datasets.

Each JSONL line contains `messages` and `meta`. Supply only the messages as model
input. For evaluation, remove the final gold assistant turn before prompting the
model. Keep metadata outside the prompt; it contains the answer labels and IDs.

## Score saved predictions

Provide one JSONL record per prediction with fields `id` and `prediction`.
Prediction is a string: model response text for pointwise, or JSON text for
listwise. The test files deliberately follow the requested `messages`/`meta`
schema without an extra top-level ID:

- Pointwise ID: `str(row["meta"]["example_ids"][0])`.
- Listwise ID: `"listwise:" + sha256("\n".join(example_ids).encode()).hexdigest()[:16]`,
  preserving candidate order. `record_id(row)` in `scripts/score.py` implements it.

```bash
.venv/bin/python scripts/score.py --test-file data/sft/test_pointwise.jsonl --predictions predictions_pointwise.jsonl --output scores_pointwise.json
.venv/bin/python scripts/score.py --test-file data/sft/test_listwise.jsonl --predictions predictions_listwise.jsonl --output scores_listwise.json
```

Pointwise scoring uses the first whole label word, case-insensitively. Listwise
scoring uses strict JSON parsing, separately reports valid JSON and valid schemas,
and measures every expected product decision. Missing/invalid outputs count as
wrong; extra or duplicate listwise keys invalidate that response. Unknown or
duplicate prediction IDs are errors. Accuracy, fixed-four-class macro F1,
per-class metrics and confusion counts are printed in terminal tables. No model
is called by this helper.

## Validation and licensing

```bash
.venv/bin/python -m unittest discover -s tests -v
.venv/bin/python -m pip check
```

`VALIDATION.md` distinguishes this export’s free checks from historical source
runs. Scorer fixtures test arithmetic and parsing, not model quality. The optional
local-tokenizer integration test skips when its assets are absent.

ESCI is distributed under Apache-2.0. Original `LICENSE` and `NOTICE` are kept in
`licenses/`. Source: [Amazon Science ESCI](https://github.com/amazon-science/esci-data).
Citation: *Shopping Queries Dataset: A Large-Scale ESCI Benchmark for Improving
Product Search* (2022), [arXiv:2206.06588](https://arxiv.org/abs/2206.06588).
