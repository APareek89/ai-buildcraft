# What to build next

**Build the first three well before adding more applications.** They solve narrow problems, accept useful outside contributions, and can demonstrate improvement with public fixtures. Every idea below is a proposal; none is an implemented feature of this collection.

The collection's contribution should be a runnable example plus an explanation, a reproducible test, and a documented failure. Extend an existing app when the change belongs there: model comparison belongs in Model Arena, trace inspection in Citadel Studio, and routing evaluation in Blindspot.

Scope estimates assume one maintainer familiar with the stack: **small** means roughly 3–5 focused days for the stated MVP; **medium** means roughly 1–2 weeks. Packaging and ongoing maintenance require additional time.

## Build first

1. **Tool contract tester — small.** An agent's tool can change its schema or error behavior and break a working workflow. Start with saved inputs, expected outputs, timeout/error fixtures, and an HTML regression report for one MCP server. Demonstrate detection of deliberately broken contracts without external writes. MCP already has an official Inspector and CLI; build reusable regression packs on that foundation instead of another connection inspector. [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector).

2. **Citation evidence auditor — medium.** A report can contain working links that do not support its claims. Accept a Markdown report and a fixed source bundle; show each claim beside its cited passage, with supported, contradicted, and unresolved decisions for human review. Test against 50 manually labeled synthetic claims, reporting precision, recall, and unresolved cases. A model's judgment must remain distinguishable from verified evidence.

3. **SFT dataset quality gate — small.** A training file can parse correctly while containing duplicates, inconsistent roles, or evaluation leakage. Accept generic chat JSONL; check schema, exact/near duplicates, train/evaluation overlap, missing provenance, and label distribution. Export a review queue and dataset-card draft. Seed defects and test detection plus false positives. This complements the ESCI builder with a reusable audit step. Dataset cards provide a standard place to document composition, creation, and limitations. [Hugging Face dataset cards](https://huggingface.co/docs/hub/datasets-cards).

## Retrieval, evidence, and data

4. **RAG chunking experiment lab — small.** Compare three chunking strategies on the same public corpus and frozen questions. Show retrieved passages, citation coverage, recall, latency, and token use. Proof: rerunnable results with identical questions and explicit dataset splits.

5. **Document change brief — small.** Turn two versions of a policy or product document into a cited change summary. Keep a deterministic text diff next to the generated interpretation. Proof: planted changes, unchanged sections, and unsupported-summary checks.

6. **Multimodal document QA bench — medium.** Expose failures when an answer depends on a chart, table, or page layout. Compare text-only and page-image paths on redistributable documents. Proof: page-grounded answers, abstention accuracy, and separate scores by question type.

7. **SQL answer verifier — medium.** Help users inspect whether a natural-language answer matches the underlying rows and arithmetic. Start with read-only SQLite, one synthetic database, visible SQL, and deterministic recalculation. Proof: known answers, join traps, empty results, and query timeouts.

8. **Training-label review desk — small.** Let two reviewers label the same examples, inspect disagreements, and record an adjudication without losing earlier labels. Proof: reproducible agreement statistics and exports that retain reviewer decisions and dataset versions.

## Reliable agent workflows

9. **Memory regression lab — small.** Measure whether an agent uses corrected facts, forgets deleted facts, and avoids mixing users. Replay synthetic conversations against two memory strategies. Proof: dated expected answers, cross-user isolation cases, and a visible failure report; no personal memory export required.

10. **Agent checkpoint replay — medium.** Re-run a decision from a saved checkpoint while substituting one tool response. Start with one three-step workflow and fixture-backed tools. Proof: a trace diff and a test that replay never repeats external side effects.

11. **Human approval queue — medium.** Review a proposed action together with its inputs, consequences, expiry, and execution status. Start with a simulated support workflow and one durable workflow adapter. Proof: rejected, expired, duplicate, and resumed requests execute correctly. LangGraph provides pause/resume primitives to build on. [LangGraph interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts).

12. **Structured-output repair bench — small.** Compare strict validation, retry, and repair for malformed model JSON. Start with two schemas and a seeded fixture suite. Proof: validity, semantic correctness, changed fields, retries, and cost; valid JSON alone is insufficient.

13. **Support triage simulator — medium.** Classify synthetic support tickets, retrieve the relevant policy, and propose an escalation or draft reply. Keep sending outside the MVP. Proof: correct escalation, policy citations, and safe handling of missing information on a frozen test set.

## Practical model use and accessible learning

14. **Voice latency lab — medium.** Show where conversational delay comes from across speech recognition, generation, and playback. Start with recorded audio and one adapter per stage. Proof: timestamped median/tail latency, interrupted playback, and labeled simulated versus live runs.

15. **Local model fit planner — small.** Help a user choose a model configuration that fits their hardware. Start with measured local inference runs and clearly labeled memory estimates. Proof: estimated versus observed memory, speed, and task quality; never present an estimate as a benchmark.

16. **Context budget optimizer — small.** Compare passage selection and conversation compression under a fixed token budget. Show what was discarded. Proof: answer quality and retained critical facts on the same tasks, alongside token savings; integrate its results into Blindspot later.

17. **Spreadsheet formula assistant — medium.** Propose a formula from a plain-language request and demonstrate it on sample rows before export. Start with CSV input and a small supported formula set. Proof: expected outputs, empty cells, text/numeric ambiguity, and boundary cases.

18. **Accessible diagram explainer — small.** Convert a structured flow diagram into a keyboard-navigable explanation and editable text alternative. Start with a constrained SVG or Mermaid subset. Proof: every node and edge represented, keyboard checks, and human review of the explanation.

## Definition of a useful contribution

Ship synthetic or licensed fixtures, a quickstart, a no-key demonstration where feasible, one visual explanation, meaningful tests, and a short limitations section. Report actual runs separately from simulations. Each addition should make one decision easier for a user and one mechanism clearer for a learner.

The backlog is deliberately broader than the first release. Select subsequent work from user problems and reproducible issues, not from the number of cards the homepage can hold.
