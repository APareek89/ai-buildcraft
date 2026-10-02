# Why these 50 lessons

This edition keeps **24 visual guides and 26 notebook/HTML labs**, selected for learning depth rather than the size of the library. A notebook and its companion HTML count as one lesson.

A retained lesson must explain a mechanism or design decision, work through an example or meaningful experiment, and help the reader interpret the result and its limits. Small interactive lessons can meet that standard; a long page of generic prose can fail it. Where two lessons substantially overlap, the stronger explanation takes the slot.

## What changed

- Removed all 129 short diagram cards. These had roughly 45–91 visible words each and worked as reminders rather than standalone lessons. This includes the Speech Recognition / Whisper card; [Inside Speech Models](guides/inside-speech-models.html) provides the deeper audio-to-model explanation.
- Removed five overlapping or less complete visual guides and 17 weaker notebook pairs. The review considered experimental validity as well as depth: test-set tuning, unequal comparisons and incomplete evaluation weakened several candidates.
- Replaced generic summaries in 16 retained HTML explainers with the actual notebook mechanism, a worked calculation, concrete code, figure interpretation and a failure exercise.
- Corrected validation preprocessing in the regularization lab and the comparison protocol in the Gaussian-process lab. Their experiment notes state the revised procedure.

## What the selection does and does not establish

Every selected item has an explicit learning outcome and a short inclusion rationale in [catalog.json](catalog.json). The HTML pages explain the experiment; paired notebooks expose its code. Bundled figures are identified as historical teaching references unless their specific verification record says they were regenerated.

This is an editorial selection, not a claim that every training notebook, provider example or external API has been freshly executed. Read each lesson's setup, data source and limitations. A useful contribution adds a reproducible experiment, improves an explanation, or corrects a failure—not a thumbnail that increases the count.
