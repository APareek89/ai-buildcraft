# Generated training data

Everything here is **fictional** and derived from `data/raw/facts.json`, so the documents, the training
data and the evaluation sets cannot contradict one another. The files are committed so every notebook
runs without API keys; the builders regenerate them offline and deterministically.

| Path | Used by | Rebuild with |
|---|---|---|
| `cpt_session/train.jsonl`, `validation.jsonl` | notebook 04 (continued pretraining) | `python scripts/build_session_cpt.py` |
| `cpt_session/*.txt` | readable exports of the same passages | same |
| `sft_train.json`, `sft_val.json` | notebook 05 (supervised fine-tuning) | `python scripts/build_session_sft.py` |
| `sft_session/policy_refusal_seed.json` | refusal, policy and mixed question families; notebooks 03, 06 and 09 also draw training-only refusal questions from it | authored by hand |
| `sft_session/examples.md` | sample SFT questions and answers | `python scripts/build_session_sft.py` |
| `*/manifest.json` | counts, hashes and checks for each dataset | the matching builder |

Notebook 06 writes `dpo_train.json` and `dpo_val.json` here when it runs; notebook 03 writes to
`gemini/`. Both are git-ignored.

**Corpus sizes:** CPT has 1,341 training and 195 validation passages. SFT has 995 training and
131 validation examples, covering all 48 facts plus refusals for information the documents do not contain.

**Important:** the SFT data contains every fact the evaluation asks about. SFT accuracy on these
evaluation sets therefore measures recall of trained facts, not generalisation to new ones. See
`docs/KNOWN_LIMITATIONS.md`.
