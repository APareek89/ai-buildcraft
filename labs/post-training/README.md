# Post-Training Lab

Hands-on notebooks for putting new knowledge and behaviour into a **small** language model, on a laptop:
freeze an evaluation, measure prompting, then try continued pretraining, supervised fine-tuning, DPO
and retrieval, and compare them all on the same questions.

```
freeze the eval → measure prompting → CPT → SFT → DPO → retrieval (RAG) → compare everything → decide
```

The domain is **Meridian Motors**, a fictional electric-scooter company: 3 scooters, 5 short documents,
48 facts. Fictional on purpose. The base model (Qwen2.5-0.5B-Instruct) cannot already know these numbers,
so any improvement comes from the technique, not from pretraining memory. The documents, synthetic training
data and evaluation sets all ship with the repo, so every core notebook runs without API keys.

## New: v2 teaches the same model to say "I don't know"

v1 (below) ended with every setup failing the refusal bar. [`v2/`](v2/README.md) keeps the same 0.5B
model, LoRA settings, documents and laptop, and rebuilds only the training data and the measurement:
- refusal examples for the money and policy questions v1 never saw
- training on the exact RAG prompts the model is served with
- trap words on both the answer side and the refuse side
- a calibrated Gemini judge

![Base vs SFT v1 vs SFT v2 with RAG on dev_v2](docs/images/v2_results.png)

On 140 new questions (dev_v2), all with RAG and graded together by the judge:

| | Base | SFT v1 | SFT v2 |
|---|---|---|---|
| Answered correctly (of 60) | 98% | 92% | **98%** |
| Declined unanswerable questions (of 80) | 10% | 55% | **79%** |

SFT v2 sits at the 80% bar, inside the judge's run-to-run variation. Read
[v2/README.md](v2/README.md) for the method, the trade-offs and how to run it on your own data.

## v1: what one run on a laptop showed

Qwen2.5-0.5B-Instruct (0.93 GB) with LoRA, scored by the master evaluation (notebook 13) on `dev_v1`:
50 questions, 30 answerable and 20 that the documents cannot answer.

| Setup | Answers correct (of 30) | Unknowns declined (of 20) |
|---|---|---|
| Base model, no documents | 0% | 1 |
| Base model, all 5 documents pasted into the prompt | 67% | 2 |
| Base model + RAG (3 retrieved chunks) | **90%** | **0** |
| SFT, no documents | 77% | **10** |
| SFT + RAG | **87%** | 11 |
| SFT + DPO + RAG | 87% | 11 |

Retrieval supplied the facts: the untrained model went from 67% to 90% by reading three retrieved chunks
instead of every document, but it never declined a question it could not answer. SFT supplied the judgement:
it was the only step that taught the model to say "I don't know". DPO, at the settings used, left 48 of 50
answers identical to SFT. No setup met the bar declared before training (decline at least 80% of unknowns).

Read the caveats before quoting any of this: single runs, small evaluation sets, and SFT saw every evaluated
fact during training. Details are in [docs/REFERENCE_RESULTS.md](docs/REFERENCE_RESULTS.md) and
[docs/KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md).

## The notebooks

| # | Notebook | The question it answers | Needs |
|---|---|---|---|
| 00a | Download the models | Get the base and retrieval models onto disk | internet |
| 00b | Setup and hardware | What can this machine train? | |
| 01 | Define the task, build the eval | What does "good" mean, before any model exists? | |
| 02 | Baseline and the prompting ceiling | Should we fine-tune at all? | |
| 03 | Synthetic data *(optional)* | Is generated data safe to train on? | `GEMINI_API_KEY` |
| 03b | Data exploration | What exactly is in each dataset? | |
| 04 | Continued pretraining | Can facts go into the weights? | |
| 05 | Supervised fine-tuning | Can behaviour, such as declining, be taught? | |
| 06 | DPO | Can we train a preference for declining over guessing? | 05 |
| 07 | Quantise and serve | What does serving cost per accepted answer? | Apple Silicon |
| 08 | Final comparison and decision | Would you deploy it? One pass on the held-out set. | 02–06 |
| 09 | RLHF, from reward to weight update *(standalone)* | Where does the gradient come from when the reward is just a number? | |
| 10 | Model comparison | How do my adapters compare with API models on the same questions? | optional API keys |
| 11 | Build the retrieval index | Does retrieval find the right evidence? | PostgreSQL + pgvector |
| 12 | Retrieval-augmented answers | Does retrieval help each model answer? | 11 |
| 13 | Master evaluation | Which combination passes the bar, and what does each technique add? | 11, trained adapters |

The v2 notebooks (`v2/notebooks/00`–`04`: data audit, SFT v2, DPO pairs, DPO v2, final evaluation) build on these; see [v2/README.md](v2/README.md).

Run them in order. Each notebook opens with the decision it supports and ends with what you should be able
to say afterwards. Nothing is pre-run: outputs are stripped, so what you see is what your machine produced.

The reported metrics below are historical source-run results, retained with their limitations; this private-review export has not rerun model training. Model weights, adapters and saved notebook outputs are excluded.

## Quickstart

```bash
git clone https://github.com/APareek89/ai-buildcraft.git
cd ai-buildcraft/labs/post-training
python3.13 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # optional: only for the Gemini/OpenAI cells or gated models
jupyter lab                 # or open the folder in VS Code and select the .venv interpreter
```

Then open `notebooks/00a_download_models.ipynb`. No token is needed for the default models.

The retrieval notebooks (11–13) also need PostgreSQL with the pgvector extension. [docs/SETUP.md](docs/SETUP.md)
covers that, API keys, Hugging Face tokens and every other optional component.

## What is in the repo, and what your runs create

```
configs/     all settings: model, training, retrieval, evaluation
data/raw/    the five Meridian documents and facts.json, the single source of truth
data/generated/  shipped synthetic CPT and SFT data (see its README)
evals/       dev (36), dev_v1 (50) and held-out (24) question sets
notebooks/   00a–13
scripts/     data builders, model download, smoke test, repository audit
src/         lab.py (paths, config, keys, device, scorer) and rag.py (retrieval)
docs/        setup, adapting to your domain, limitations, reference results
```

Your runs write `models/`, `adapters/`, `runs/` and `outputs/` locally. All are git-ignored.

## Before you trust a number

- **Tested on:** macOS arm64 (Apple M4, 24 GB unified memory), Python 3.13, torch 2.14, transformers 5.17,
  peft 0.21, trl 1.14, float32 on MPS. `lab.device()` also selects CUDA or CPU, but those paths are untested.
- Check your install with `python scripts/smoke_test.py`: it loads the model, runs a LoRA step and a DPO step,
  and confirms generation still works.
- Read [docs/KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md). It lists what these experiments do **not** show.

## Use it for your own domain

The notebooks are domain-agnostic in structure; the data builders are not. [docs/ADAPTING.md](docs/ADAPTING.md)
lists exactly which files encode Meridian-specific logic and what to rewrite.

## Critique welcome

This lab is shared so people can find its weaknesses. Open an issue with the **Critique** template, or see
[CONTRIBUTING.md](CONTRIBUTING.md).

## Share your results

Ran the notebooks on another model, machine or domain? Open an issue with the **Share your results**
template ([CONTRIBUTING.md](CONTRIBUTING.md)). It asks for the same small table every run produces,
so results from different people can be compared side by side. Negative results are welcome.

## Licence

Apache-2.0 for the code, notebooks and fictional data (see [LICENSE](LICENSE) and [NOTICE](NOTICE)).
Downloaded models keep their own licences: Qwen2.5-0.5B-Instruct is Apache-2.0; the BGE models are MIT.
