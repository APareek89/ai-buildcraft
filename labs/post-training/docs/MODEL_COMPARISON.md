# Model comparison: compare the models you actually have

[Notebook 10](../notebooks/10_model_comparison.ipynb) compares selected local models and optional API models on the Meridian development questions. Edit [configs/model_comparison.yaml](../configs/model_comparison.yaml), then run the notebook cells in order. Model loading, generation, response checks, caching and scoring remain visible in the notebook.

The default selects `base` and `cpt`, with `execution.run: false`. Setup does not make API calls or establish improved model scores. Selecting an adapter does not train it or create its files.

## Choose a comparison

`selected_models` contains names from the `models` registry. For example:

```yaml
selected_models: [base, cpt, sft, dpo, openai_54, gemini]
```

Keep only the models you want to compare. Missing local models or adapters are reported as **SKIPPED**, with their missing paths; the notebook never substitutes the base model and labels it as a trained model.

`evaluation.conditions` selects `naive`, `engineered` and/or `with_docs`. These retain notebook 02's prompt text: a generic assistant, grounding/refusal instructions without documents, and those instructions with all source documents. `max_questions: null` selects all 36 development questions; set an integer for a smaller initial run. No held-out questions are used. `custom_question` accepts an optional question for qualitative inspection; it has no authored ground truth and is not a development accuracy result.

Set `execution.run: true` when ready to generate answers. Rerun from the top after editing YAML so the plan, cache keys and candidate checks all reflect the new selection. Leave it false when inspecting configuration and existing results without starting new generation.

## Point local entries at the right weights

Paths resolve from the project root. A `base_path: null` uses `model.base_path` from [configs/config.yaml](../configs/config.yaml). A `tokenizer_path: null` uses the resolved base path.

- `base` loads the original Qwen model.
- `cpt` loads the original base plus `adapters/cpt_session`, produced by [notebook 04](../notebooks/04_continued_pretraining.ipynb).
- `sft` loads the original base plus `adapters/sft`. [Notebook 05](../notebooks/05_supervised_finetuning.ipynb) starts from the original base; this is not automatically CPT followed by SFT.
- `dpo` loads the original base plus `adapters/dpo`. The intended [notebook 06](../notebooks/06_dpo_alignment.ipynb) lineage is base → SFT → DPO. That training notebook also permits starting without SFT, so the directory name alone does not prove its training history.
- `cpt_sft` is an example location for one adapter first trained with CPT and then continued with SFT. Save the final continued adapter at `adapters/cpt_sft`. This artifact is not created by registering it, and the entry does not stack independent CPT and SFT adapters.
- `cpt_merged_sft` represents a different sequence: merge CPT into a full model saved at `models/cpt_merged`, then train a new SFT adapter against that merged base and save it at `adapters/sft_on_cpt_merged`. Both base and tokenizer point to the merged directory.
- `custom_merged` loads a complete model from `models/my_merged_model`, without an adapter. Replace that example path with your own.

An adapter must be paired with the base it was trained against. A matching architecture alone does not make two different bases interchangeable. The local loader supports Hugging Face Transformers models and PEFT adapters; MLX and GGUF files require different loaders and are outside this notebook's scope.

## Optional API models

Add `openai_54` or `gemini` to `selected_models` to include an API provider. `api_key_name` names the credential to load at runtime; it is not a place to paste a secret. Provider availability and account access are checked by actual requests when you run the notebook, not assumed during setup.

Install the optional API SDKs with `pip install -r requirements-optional.txt`. API keys are read at execution time from the named environment variable or from `.env` (see [SETUP](SETUP.md)); the value is never printed.

The OpenAI entry uses `gpt-5.4` with `reasoning_effort: none` and a 160-token output cap. Official OpenAI documentation lists `none` as a supported GPT-5.4 reasoning setting. If you change the model or reasoning setting, check parameter compatibility in the [GPT-5.4 guidance](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-5.4) and [model reference](https://developers.openai.com/api/docs/models/gpt-5.4).

The Gemini entry retains the lab's `gemini-flash-latest` alias. Google restricts Gemini 2.5 access to prior users, so this notebook does not assume `gemini-2.5-flash` is available. The latest alias can change; retain the returned model version with each result. See Google's [availability notice](https://ai.google.dev/gemini-api/docs/deprecations) and [model version definitions](https://ai.google.dev/gemini-api/docs/models#model-version-name-patterns).

Gemini has a 1,024-token output cap and `thinking_config: null`, which leaves thinking settings at the provider default. Its cap includes thinking as well as visible output. For a specifically selected, accessible Gemini 2.5 Flash model, `thinking_config: {thinking_budget: 0}` can disable thinking; do not assume that setting works for every model behind the latest alias. See [Google's thinking guide](https://ai.google.dev/gemini-api/docs/generate-content/thinking) and [Python SDK reference](https://googleapis.github.io/python-genai/).

Local generation is capped at 160 new tokens and 3,072 input tokens by default. Different tokenizers, reasoning behavior and provider caps mean this is a comparison of task answers under stated settings, not equal compute or equal visible-answer budgets. Truncated or empty responses are reported rather than treated as incorrect factual answers.

## Calls, caching and retries

`max_api_calls: 216` caps uncached API attempts across the selected providers in an execution. It counts calls, including failed attempts; it is not a dollar budget or bill estimate. Local generation does not consume this API-call allowance. Provider usage fields are evidence of usage, not a pricing calculation.

Cached successful responses can be reused. Change `cache_tag` to a new value when you deliberately want fresh generations. This can repeat API calls and their charges. Cached failures are not retried automatically: inspect the failure, correct the configuration if needed, then set `retry_failed: true` for an intentional retry. Return it to false afterwards. A new cache tag also starts a fresh comparison rather than reusing failures from the previous tag.

API errors, blocked responses, missing text and output-limit truncation retain their failure status and receive no quality score. SDK retries are disabled so uncached attempts remain explicit. Increasing an output budget or changing models is an experiment setting change; do it visibly and retain the old result for context.

## Read the results without overstating them

Full metrics for a model and condition require every selected development question to complete successfully. A partial run is not the full benchmark: inspect completion counts and error rows before interpreting answer quality. The same questions and the same scorer must be used on both sides of a comparison.

The notebook can inspect the saved [notebook 02](../notebooks/02_baseline_and_the_prompting_ceiling.ipynb) answers in `runs/01_stock_naive.json`, `runs/02_stock_engineered.json` and `runs/03_stock_with_docs.json`. It verifies their question records and rescores the selected subset. These historical files lack prompt hashes, resolved model versions, token counts and finish reasons, so reuse is not proof that every execution setting was identical. Their full-run summaries must not be compared directly with a smaller new subset.

The scorer in [src/lab.py](../src/lab.py) checks expected values and refusal phrases. It does not independently verify every claim, unit or model association. It can reject a correct colour list containing an extra “and”, miss a valid refusal phrased differently, or reward a refusal followed by an invented claim. Read the actual answers alongside the numbers. New registry entries and successful setup are not evidence that any model improved; that requires completed runs and inspection of their answers.
