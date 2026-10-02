# Adapting the lab to your own domain

The notebooks' structure carries over to any domain: freeze an evaluation, measure prompting, train, retrieve,
compare. **The data builders do not.** They were written for three fictional scooters, and you should expect
to rewrite them. This page lists every file that encodes Meridian-specific knowledge.

## 1. Replace the source of truth

`data/raw/facts.json` drives everything. Each fact is one record:

```json
{"id": "x_battery_kwh", "model": "Meridian Volt X", "attribute": "battery_kwh",
 "label": "battery capacity", "value": 4.6, "unit": "kWh", "source_doc": "spec_sheet"}
```

Replace it with your facts, and replace the documents in `data/raw/*.md` with your own. Keep one fact per
record and keep numbers numeric: the scorer compares numbers.

## 2. Rewrite the data builders

| File | What it encodes | What to do |
|---|---|---|
| `src/build_data.py` | generates the Meridian documents and the dev/held-out questions from facts | keep your own documents; reuse its question templates only if they fit your facts |
| `scripts/build_session_cpt.py` | sentence patterns for scooters, prices and warranties | rewrite the patterns for your domain |
| `scripts/build_session_sft.py` | question/answer patterns and wording styles | rewrite the patterns |
| `data/generated/sft_session/policy_refusal_seed.json` | 32 families of questions the documents cannot answer, plus policy and mixed families | write your own; this is the most important file for teaching refusals |
| `scripts/build_dev_v1.py` | 50 evaluation questions written inline, with absence checks | write your own evaluation questions |
| notebook 06, "Build the preference pairs" | how rejected answers are faked (`corrupt()`, fabrications) | make rejected answers plausible for your domain |

Notebook 03 is an alternative route to SFT data: it generates candidates with Gemini, then curates them.

## 3. Update prompts and configs

- The `ENGINEERED` system prompt in notebooks 02, 05 and 06, and in `configs/master_eval.yaml`.
- The short training `SYSTEM` prompt in notebook 05 (and notebook 06 must match it).
- `configs/rag.yaml`: `corpus.paths`, `corpus.fact_labels`, and a new `index_name`.
- `configs/config.yaml`: the base model, if you change it (see notebook 00a).

## 4. Rebuild and re-freeze

Regenerate your data, build fresh evaluation sets, rebuild the retrieval index, and **declare your quality bar
in notebook 01 before training anything**. If you change facts or evaluation labels later, you have a new
ruler: do not compare new numbers with old ones.

## 5. Check the scorer fits

`lab.score_answer` counts an answer correct when it contains the expected value and does not refuse. That
works for numbers and short strings. For free-text answers, lists or multi-fact questions, extend the scorer
or add a judge model, and measure how often the judge agrees with you.
