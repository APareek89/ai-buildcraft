# Qwen reference data

The tokenizer, model configuration/headers and sampled weight values in `public/data` and `public/weights` originate from [Qwen/Qwen3.8-27B, pinned revision 1d4bf0f2ff6012fd82039f2fa52739d0dd7c60c0](https://huggingface.co/Qwen/Qwen3.8-27B/tree/1d4bf0f2ff6012fd82039f2fa52739d0dd7c60c0). The upstream model card declares Apache-2.0 and its [license](public/data/QWEN-LICENSE.txt) is retained with this snapshot. Verified against upstream on 2026-10-02.

Weight samples are bounded extracts converted from BF16 to Float32 for inspection; they do not constitute a full checkpoint. The miniature training models and their starter checkpoints are separate teaching implementations authored for this project. See `docs/data.md` and `docs/micro.md` for provenance and reproducibility.
