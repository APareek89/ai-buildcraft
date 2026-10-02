# Critique and contributions

This lab is shared to be criticised. If a result looks wrong, a notebook misleads, or a method is
weaker than it claims, please say so.

## The most useful criticism

Open an issue in AI Buildcraft and include:

1. **Which notebook and cell** (or which file and line).
2. **What is wrong**, in one or two sentences.
3. **Evidence**: numbers, a traceback, a failing input, or a reference.
4. **A suggested fix**, if you have one.

Especially welcome: evaluation design, data leakage, scorer blind spots, DPO pair design, and results
that fail to reproduce on your hardware. Please say which platform you ran on.

## Share your results

Ran the notebooks, changed something, or adapted the lab to your own domain? Open an issue in AI Buildcraft with the same table every run produces (accuracy, hallucination,
over-refusal and correct refusals, per eval set and condition), so results from different people and
machines can be compared side by side. Negative results are as useful as positive ones.

## Pull requests

- Run `python scripts/audit_notebooks.py` before committing. It fails if a notebook has saved outputs
  or if anything that looks like a key is in the repository.
- Keep notebooks runnable top to bottom, with the teaching text next to the code it explains.
- Never commit `.env`, model weights, `runs/`, `adapters/` or `models/`.
- Say whether you re-ran the affected notebooks, and on what hardware.
