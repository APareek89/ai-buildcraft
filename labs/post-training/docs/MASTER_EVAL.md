# Master evaluation on dev_v1

Use notebook 13 to decide which combination of training, prompting and retrieval passes the bar declared in `runs/00_bar.json`. Every selected model answers the same questions with the same generation settings. The original development set and its historical results remain available separately.

## Run it

1. Open `notebooks/13_master_eval.ipynb` with the project's Python environment.
2. Review `configs/master_eval.yaml`. The default is `run: false`, so Run All first shows the dataset, checkpoint inventory and execution plan without generating answers.
3. Select models and conditions in that YAML, set `run: true`, then run the notebook from the top. Generation is visible in the notebook. Only one answering model is loaded at a time.
4. Inspect the scoreboard, paired improvements/regressions and individual answers before interpreting an aggregate tie.

The five default models are base Qwen, CPT, SFT, SFT continued with DPO, and the additive CPT+SFT merge that notebook 12 builds. The DPO policy is `adapters/dpo`, not its frozen `ref/` copy. A missing checkpoint is reported as SKIPPED; the base model never substitutes for it. This notebook performs no training, merging or provider API calls.

The six default conditions are naive, engineered, all documents, similarity retrieval, reranked retrieval and oracle evidence. Oracle uses only the 30 answerable questions. The optional `trained_prompt` condition uses the short training system prompt and has no documents. The user's message is always the question; only the system message changes.

The engineered prompt is stored in `configs/master_eval.yaml` and is byte-identical to notebook 02's.

## The new question set

`evals/dev_v1.json` contains **50 questions: 30 answerable and 20 unanswerable**. There are 10 answerable questions per scooter. The unanswerable categories are eight price near misses, five specification near misses, four policy near misses and three out-of-scope questions.

The source contains **15 distinct numeric attributes**; the set covers all 15 twice. The three colour facts and Arc 110's numeric fast-charging sentinel are excluded because the unchanged lab scorer cannot reliably grade them.

Rebuild and audit the set with:

```bash
.venv/bin/python scripts/build_dev_v1.py
```

All questions are written inline in the builder. The manifest records source hashes, counts, styles, exclusions, exact-match and token-Jaccard audits, and the evidence that each unknown question is absent from the documents. The overlap audit includes the original dev set, SFT/DPO data, refusal seeds and CPT text. Heldout questions are compared by normalized-question hash only; their wording is never printed or copied.

These questions were designed after inspecting development failures. **dev_v1 is still a development set**, even after wording and topic-overlap checks. It does not establish held-out generalization. `evals/heldout.json` remains reserved for notebook 08.

## Retrieval and execution safeguards

Notebook 13 uses the local BGE models and PostgreSQL index configured in `configs/rag.yaml`. It prepares retrieval for all 50 questions once, measures similarity and reranked recall@1/recall@3/MRR, and releases BGE before loading an answering model. Notebook 11 must already have built the matching index.

PostgreSQL with pgvector must be running; see [SETUP](SETUP.md).

The notebook checks model evaluation mode, disabled gradient checkpointing, adapter/base compatibility, weight hashes and document content. It records prompt token counts and rejects prompts longer than 3,072 tokens rather than truncating evidence. Greedy generation allows up to 160 new tokens.

The full default plan is **1,400 requests**: each model receives five conditions with 50 questions, plus 30 oracle questions. The supplied timings imply about **35 minutes of answer generation**: 500 requests at 1.1 seconds and 900 document-bearing requests at 1.7 seconds. Retrieval, checkpoint loading, output length and hardware contention add time. This is a planning estimate, not a measured full-grid runtime.

## Read and save the results

Results are written to `runs/master_eval/dev_v1/<model>__<condition>.json`, plus `summary.json` and `summary.csv`. Per-answer cache entries live under `runs/master_eval/cache/`. Cache identity includes the actual model weights, system prompt, question and generation settings. A different `cache_tag` cannot silently replace an existing result; use a new output directory for a separate tagged experiment.

Each result retains the answer, scores, prompt tokens, chunk IDs, prompt hash, checkpoint identity and generation-time training state. Resume an interrupted run with the same settings to reuse completed answers. Read any incomplete/skipped states before comparing scores.

The scoreboard includes Wilson 95% intervals and the declared pass/fail bar. One answerable question changes accuracy by 3.33 percentage points; one unknown question changes appropriate refusal by 5 points. Overlapping intervals do not demonstrate a difference; these marginal intervals are not a paired significance test. Use the paired inspector to see which questions were fixed and broken, including changes that cancel in the total.

The existing lab scorer is intentionally unchanged for dev_v1. Numeric matching can overlook incorrect units or additional claims, and refusal detection uses phrases rather than semantic judgement. Gold evidence in a retrieved chunk does not prove that the generated answer used it correctly. Older runs appear in a separate historical appendix and are not used as matched baselines.
