# Known limitations

Read these before quoting any result from this lab.

1. **The evaluations are small.** The dev set has 36 questions, 9 of them unanswerable, so one unanswerable
   question moves the refusal rate by 11 points. dev_v1 has 50 (20 unanswerable, 5 points each); the held-out
   set has 24. Notebook 13 reports Wilson 95% intervals; overlapping intervals mean "not shown to differ".
2. **SFT accuracy measures recall, not generalisation.** The SFT training data contains every fact the
   evaluations ask about. A high SFT score shows the model memorised those facts; it does not show it can
   handle facts it never saw. A knowledge-update test (change facts in the documents without retraining)
   is not included yet.
3. **dev_v1 was written after looking at dev failures.** Treat it as a development set, not a benchmark.
4. **The held-out set is public.** It is a teaching gate for notebook 08, not an unseen test.
5. **The scorer is a heuristic.** It matches numbers and substrings and looks for refusal phrases. Known
   blind spots: colour lists written with "and", Arc 110's fast-charge value `0` (meaning "not supported"),
   refusals phrased outside the keyword list, and an extra wrong claim next to a correct number.
6. **DPO pairs are rule-made.** Wrong numbers are real values multiplied by a factor, and refusal pairs use
   off-topic fabrications, which are easy to tell apart. At the default settings (1 epoch, learning rate 5e-6,
   59 pairs) DPO barely moves the model. The reference DPO run also predates two fixes now in notebook 06:
   its fact prompts reused the dev-question wording, and it trained with TRL's default gradient checkpointing
   and bf16.
7. **The synthetic data was written with an AI coding assistant** and expanded deterministically from
   `facts.json`. It passed structural checks (coverage, duplicates, claim metadata); it was not labelled by
   people.
8. **One platform, single runs.** Reference results come from one run per setting on Apple Silicon (MPS,
   float32). CUDA and CPU paths exist but are untested, and seed-to-seed variance was not measured.
9. **The retrieval corpus is tiny** (21 chunks), so retrieval metrics are near-perfect and say little about
   retrieval on a real document set.
10. **Notebook 07 needs Apple Silicon** (MLX).
11. **The base model often exceeds the 160-token answer limit** on dev_v1, so notebook 13 marks several
    base-model cohorts incomplete. Raise `generation.max_new_tokens` in `configs/master_eval.yaml` if you want
    them scored by the notebook itself.
