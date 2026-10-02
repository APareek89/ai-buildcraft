# Retrieval: notebooks 11 and 12

Notebook 11 builds and measures a retrieval index. Notebook 12 measures whether each answering model
improves when its document block changes. Notebook 13 reuses both inside the master evaluation.

The pipeline runs entirely on your machine and needs no API keys:

```
question → BGE-small embedding → pgvector cosine search (top 10) → BGE reranker → top 3 chunks → answer model
```

## Setup

1. Download the models with notebook 00a (or `python scripts/download_models.py`).
2. Start PostgreSQL with pgvector and create the `meridian_rag` database; see [SETUP](SETUP.md).
3. Run notebook 11, then notebook 12. Change settings in `configs/rag.yaml`.

## Models and token limits

[BGE-small-en-v1.5](https://huggingface.co/BAAI/bge-small-en-v1.5) produces 384-dimensional vectors and
accepts at most 512 tokens. The CLS vector is L2-normalised. A short retrieval instruction is prepended to
questions only, never to documents.

[BGE-reranker-base](https://huggingface.co/BAAI/bge-reranker-base) reads a question and a chunk together,
with a combined 512-token limit. Its score is a relevance logit, not a probability.

Both are pinned to exact revisions in `configs/rag.yaml` and load from local files only. An input over a
model's limit raises an error; nothing is silently truncated. Bigger chunks need a model with a larger
context window and a new `index_name`; raising a number in the YAML does not enlarge a model's context.

## What is indexed

By default, only `data/raw/*.md`. Heading chunking keeps each `##` section, and each table row together with
its header row. Every chunk is prefixed with "document title > section heading", so the three near-identical
specification sheets keep their model names. Fixed-token chunking is also available (`chunk_tokens`,
`overlap_tokens`).

Each chunk is labelled with the fact IDs from `data/raw/facts.json` it contains. Those labels make retrieval
metrics and the "oracle" condition possible. Set `corpus.fact_labels: null` for a corpus without labels;
metrics and oracle are then skipped.

The table `rag_<index_name>` stores each chunk's text, source, token count, fact IDs, content hash, a
full-text index and its vector, with an HNSW cosine index. Ingestion is incremental: unchanged chunks keep
their vectors, and a changed embedding model requires a new `index_name`.

## Reading the comparison

Notebook 12 compares four conditions for each model, with everything else fixed (notebook 02's ENGINEERED
prompt, greedy decoding, 160 new tokens, a 3,072-token input cap):

| Condition | Evidence in the prompt |
|---|---|
| `all_docs` | every document |
| `rag_similarity` | the top 3 chunks by vector similarity |
| `rag_rerank` | the top 10 by similarity, reranked, top 3 kept |
| `oracle` | only the chunk(s) holding the answer; answerable questions only |

A low oracle score means the model fails even when handed the right evidence, so better retrieval cannot
fix it. Wrong answers are attributed either to a retrieval miss (the gold chunk was not in the prompt) or to
a generation error (it was).

The scorer is deliberately simple: numeric and substring matching plus refusal phrases. It can mark a correct
colour list wrong, miss a refusal phrased unusually, and treat Arc 110's fast-charge value `0` as a number
rather than "not supported". Read answers alongside the metrics.

## Outputs

- `runs/rag_cache/`: cached embeddings and rerank scores, keyed by model revision and exact input.
- `runs/11_rag_index_<index_name>.json`: retrieval metrics, token counts and timings.
- `runs/12_rag_<model>_<condition>.json`: answers, retrieved chunk IDs, scores and prompt sizes.
