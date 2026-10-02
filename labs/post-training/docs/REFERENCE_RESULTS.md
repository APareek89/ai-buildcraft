# Reference results

One run per setting, on 30 September 2026. **Not guaranteed**: use these to sanity-check your own runs, not
as benchmarks. Read [KNOWN_LIMITATIONS](KNOWN_LIMITATIONS.md) first.

**Setup:** Apple M4, 24 GB unified memory, MPS, float32. Qwen2.5-0.5B-Instruct with LoRA rank 16, alpha 32,
on all seven attention and MLP projections. Greedy decoding, up to 160 new tokens, scored with
`lab.score_answer`. Development set: 36 questions, 27 answerable and 9 that the documents cannot answer.

## Training runs

| Stage | Data | Settings | Time | Result |
|---|---|---|---|---|
| CPT | 1,341 synthetic passages; 69,242 tokens in 136 windows of 512 | 2 epochs, lr 2e-4, effective batch 8 (34 updates) | 4 min | train loss 1.10; validation loss 1.33 → 1.20 |
| SFT | 995 question/answer pairs covering all 48 facts, 224 of them refusals | 3 epochs, lr 2e-4, effective batch 8 | 11 min | train loss 0.18 |
| DPO | 59 preference pairs, starting from the SFT adapter | 1 epoch, lr 5e-6, beta 0.1, effective batch 8 (8 updates) | 40 s | loss 0.60; reward margin +0.26; pair accuracy 0.74 |

## Master evaluation: dev_v1, every model and context (notebook 13)

50 questions: 30 answerable and 20 the documents cannot answer, in four categories (8 price-like, 5 spec-like,
4 policy-like, 3 out of scope). dev_v1 rewords the facts differently from the training data, so it is harder
than the original dev set. "RAG" means the top 10 chunks by similarity, reranked, top 3 kept.

| Model | Evidence in the prompt | Correct (of 30) | Declined unknowns (of 20) | Wrongly declined (of 30) |
|---|---|---|---|---|
| Base | none, engineered prompt | 0% | 1 | 0 |
| Base | all 5 documents | 66.7% | 2 | 0 |
| Base | RAG, similarity only | 86.7%* | 0 | 0 |
| Base | RAG, reranked | 90.0%* | 0 | 0 |
| CPT | none, engineered prompt | 20.0% | 0 | 0 |
| CPT | RAG, reranked | 80.0% | 0 | 0 |
| SFT | none, engineered prompt | 76.7% | 10 | 3 |
| SFT | all 5 documents | 86.7% | 13 | 1 |
| SFT | RAG, similarity only | 83.3% | 14 | 1 |
| SFT | RAG, reranked | 86.7% | 11 | 1 |
| SFT + DPO | none, engineered prompt | 80.0% | 10 | 3 |
| SFT + DPO | RAG, reranked | 86.7% | 11 | 1 |
| CPT + SFT, additive merge | RAG, reranked | 43.3% | 0 | 0 |

\* The base model often runs past the 160-token answer limit, so notebook 13 marks these cohorts incomplete
and does not score them. The figures above score every answer anyway; in each RAG cohort one answerable
question was cut off.

With the gold chunk handed over directly ("oracle"), SFT scored 93.3% and the base model 90.0%: the remaining
errors come from the answer model, not from retrieval. Retrieval itself found the right chunk in the top 3 for
all 30 answerable questions (recall@1: 86.7% by similarity, 96.7% after reranking).

SFT + DPO gave identical answers to SFT on 38 to 48 of 50 questions, depending on the condition.

## Original dev set (36 questions)

### Answer quality on the dev set

"Engineered" is notebook 02's grounding-and-refusal instruction. "Declined" counts the 9 unanswerable questions.

| Model | Evidence in the prompt | Correct (of 27) | Hallucinated (of 27) | Declined unknowns (of 9) | Wrongly declined |
|---|---|---|---|---|---|
| Base | none, naive prompt | 0.0% | 59.3% | 66.7% | 40.7% |
| Base | none, engineered prompt | 0.0% | 100% | 0% | 0% |
| Base | all 5 documents | 66.7% | 33.3% | 0% | 0% |
| Base | RAG, 3 retrieved chunks | **92.6%** | 7.4% | 0% | 0% |
| CPT | none, naive prompt | 11.1% | 88.9% | 0% | 0% |
| CPT | none, engineered prompt | 18.5% | 81.5% | 0% | 0% |
| CPT | all 5 documents | 66.7% | 33.3% | 0% | 0% |
| CPT | RAG, similarity only | 74.1% | 25.9% | 0% | 0% |
| CPT | RAG, reranked | 81.5% | 18.5% | 0% | 0% |
| SFT | none, engineered prompt | 96.3% | 3.7% | **77.8%** | 0% |
| SFT | all 5 documents | 92.6% | 7.4% | 66.7% | 0% |
| SFT | RAG | 96.3% | 3.7% | 77.8% | 0% |
| SFT + DPO | none, engineered prompt | 96.3% | 3.7% | 77.8% | 0% |
| SFT + DPO | all 5 documents | 92.6% | 7.4% | 66.7% | 0% |
| SFT + DPO | RAG | 96.3% | 3.7% | 77.8% | 0% |
| CPT + SFT, additive merge | all 5 documents | 66.7% | 33.3% | 0% | 0% |
| CPT + SFT, additive merge | RAG, reranked | 59.3% | 40.7% | 0% | 0% |

The quality bar declared in notebook 01, before any training, was: at least 80% correct, at most 10%
hallucinated, at least 80% of unknowns declined, at most 15% wrongly declined. **No setup passed all four.**
The closest, SFT with or without RAG, declined 7 of 9 unknowns (77.8%). Every unknown it missed was about
money: resale value in both cases, plus a replacement-battery cost without documents, or an insurance
premium with RAG.

## Retrieval (27 answerable dev questions, 21 chunks)

| Stage | Recall@1 | Recall@3 | MRR |
|---|---|---|---|
| Vector similarity | 92.6% | 100% | 0.963 |
| + reranker | 100% | 100% | 1.000 |

## What these numbers do and do not say

- **Retrieval fixed the base model's confusion.** With all five documents it often quoted the right kind of
  number from the wrong scooter; three retrieved chunks took it from 67% to 93% with no training.
- **SFT was the only step that taught selective declining:** 7 of 9 unknowns, with no answerable question
  refused. Its 96% accuracy is recall of facts it was trained on (see limitation 2).
- **CPT learned the style of the documents, not their numbers,** and never declined.
- **DPO left behaviour unchanged at these settings.** Its metrics equal SFT's in every condition.
- **Adding independently trained CPT and SFT adapters together made everything worse.**

## v2 (1 October 2026)

Same model, LoRA settings and hardware; rebuilt training data and a Gemini judge. Full method and
tables in [v2/README.md](../v2/README.md); raw numbers in `v2/data/reference_results_*.json`.

| Model + RAG (reranked) | dev_v2 correct (of 60) | dev_v2 declined (of 80) | dev_v1 correct (of 30) | dev_v1 declined (of 20) |
|---|---|---|---|---|
| Base | 98% | 10% | 87% | 10% |
| SFT v1 | 92% | 55% | 87% | 35% |
| SFT v2 | 98% | 79% | 97% | 90% |

Scored by the Gemini judge (`gemini-flash-latest`, reported as `gemini-3.8-flash`; 60/60 on its
calibration set), all models judged together, blind. The judge counts a refusal that also invents a
detail as a failure, so its v1 refusal rates are lower than the keyword scorer's above. SFT v2 training:
1,759 examples, 2 epochs, 119 minutes on an Apple M4 (MPS, float32).
