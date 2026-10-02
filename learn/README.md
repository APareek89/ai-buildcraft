# Visual learning guide

**[Open the searchable collection](index.html)** · [ML notebook labs](../labs/ml-foundations/index.html) · [Machine-readable catalog](catalog.json)

**50 selected lessons: 24 visual guides and 26 notebook/HTML pairs.** Read the [selection criteria](CURATION.md). The HTML lessons can be opened directly; pages using remote fonts or a public CDN need a network connection for those assets. The navigator works without fetching a manifest or calling an API.

## A route through the material

1. Start with **[Agentic Systems Blueprint](guides/agentic-systems-blueprint.html)** to decide what to build and what evidence it needs.
2. Trace **[RAG](guides/rag-visually.html)** and **[agent memory](guides/agent-memory-lifecycle.html)** before choosing infrastructure.
3. Work through **[retrieval evaluation](guides/retrieval-eval-lab.html)** and **[agent evaluation](guides/agent-eval-lab.html)** to separate a plausible answer from a reliable system.
4. Explore **[fine-tuning](guides/fine-tuning-first-principles.html)** and **[RLHF](guides/rlhf-weight-update.html)** to understand what model adaptation actually changes.
5. Run the **[ML foundations notebooks](../labs/ml-foundations/README.md)** and record your own results.

## Selected visual guides

- [Agentic Systems Blueprint — Define, design, build and operate](guides/agentic-systems-blueprint.html) — Design and review an agentic system from business fit through architecture, evaluation, action controls and operations.
- [RAG, Visually — from a raw document to a grounded answer](guides/rag-visually.html) — Follow source documents through chunking, embeddings, hybrid retrieval and citation-grounded generation.
- [Agent memory — the lifecycle, live](guides/agent-memory-lifecycle.html) — Distinguish transcript, context view, long-term memory and business state while stepping through compaction, extraction, recall and retention.
- [Retrieval Eval Lab](guides/retrieval-eval-lab.html) — Compute retrieval precision, recall, ranking and claim-coverage metrics, then choose a fix from the failure pattern.
- [Agent Eval Lab](guides/agent-eval-lab.html) — Evaluate an agent at answer, trajectory and outcome levels and measure reliability while checking the judge.
- [Inside LLMs](guides/inside-llms.html) — Implement core transformer mechanisms and trace RoPE, SwiGLU, MoE, KV caching, quantization and sampling.
- [Inside CNNs](guides/inside-cnns.html) — Implement and inspect convolutions, receptive fields, residual blocks and a small CNN, then connect image patches to transformers.
- [Inside Diffusion](guides/inside-diffusion.html) — Construct the noise schedule, denoising training objective and reverse sampler behind a diffusion model.
- [Inside Speech Models](guides/inside-speech-models.html) — Trace Whisper-style speech recognition through mel features, an encoder and cross-attention decoder, then compare CTC, vocoders and audio-token models.
- [LoRA Training by Hand](guides/lora-training-by-hand.html) — Change logits, LoRA rank, loss masks and training settings to see how they affect the next update and generated answer.
- [Fine-Tuning from First Principles — LoRA & Full Fine-Tuning](guides/fine-tuning-first-principles.html) — Trace a token through a transformer and explain exactly how full fine-tuning and LoRA change its parameters.
- [RLHF: how a reward becomes a weight update](guides/rlhf-weight-update.html) — Derive and manipulate the policy-gradient update that converts a scalar reward into parameter changes.
- [RLHF Token Credit](guides/rlhf-token-credit.html) — Calculate how a final sequence reward becomes token advantages, losses and probability updates.
- [Classical ML for AI Product Managers — Rapid Recap](guides/classical-ml-recap.html) — Select and explain classical ML approaches using their objectives, evaluation metrics and worked numerical examples.
- [MLOps, end to end — beverage distribution edition](guides/mlops-end-to-end.html) — Turn an ML model into a batch or real-time product with versioning, deployment, monitoring and retraining gates.
- [Building an Agentic Workflow That Turns Marketing Scripts into Ads](guides/scripts-to-ads-workflow.html) — Design a structured multi-agent creative workflow with schema validation, tool calls and a bounded review loop.
- [How the A2A Protocol Works](guides/how-a2a-works.html) — Explain agent discovery, task states, structured messages and streamed results, then decide between A2A, MCP and a direct API.
- [Build and Run LLM App Evaluations to Catch Breaking Changes](guides/llm-app-evaluations.html) — Build an LLM regression suite, run its harness, interpret failures and gate changes in CI.
- [Build a Sales Signal System with Apify + AI Agent](guides/sales-signal-workflow.html) — Build a lead-signal pipeline from ingestion and normalization through explainable scoring, time decay and delivery.
- [Agent Frameworks Crash Course — for people who already know LangGraph](guides/agent-frameworks.html) — Compare agent frameworks by who controls execution, how state is stored and how tools and typed outputs are wired.
- [Cloud for AI apps — zero to interview-ready](guides/cloud-for-ai-apps.html) — Design the compute, storage, database, queue, network and deployment layers of a cloud AI application.
- [Databases for Agentic Apps — A Visual Crash Course](guides/databases-for-agentic-apps.html) — Choose databases from access patterns and model an agent app using sample records, queries, caches and retrieval stores.
- [From shaking air to a spectrum](guides/sound-to-spectrum.html) — Build a waveform and recover its frequencies, then observe the time-frequency tradeoff in a spectrogram.
- [Tree by Tree — Synthetic edition](guides/tree-by-tree.html) — Add regression trees to residuals and inspect how learning rate and depth change the ensemble prediction and training error.

## Scope and provenance

Anand Pareek assembled and developed these learning materials with AI assistance. They are teaching resources, not a claim that every underlying algorithm, code excerpt or framework is original. Existing references, framework names and public upstream links remain in the material. Third-party software, datasets and model weights retain their own terms.

The collection is capped at 50 selected lessons for this edition. Short diagram cards, overlapping reference pages and weaker experiments have been removed. Each retained entry is intended to teach a mechanism, support a worked example and help interpret results. Internal architecture examples, personal assessment results, unfinished lesson fragments and third-party course downloads are excluded. No account data, local environment, model checkpoint or private dataset is included.

The fine-tuning guide retains archived numeric teaching examples but does not bundle the original checkpoint or assert newly reproduced metrics. The conversation-orchestration page is a scripted demonstration. MLOps scenarios are teaching assumptions. Provider APIs, pricing, certification material and sample code are version-sensitive; this edition does not claim a fresh factual or runtime audit of every lesson.

See [attribution and license scope](ATTRIBUTION.md) for the retained upstream notices.

## Validation

From the repository root:

```bash
python3 learn/validate.py
```

This checks catalog targets, local HTML references, HTML structure, notebook output hygiene, Python syntax, inline JavaScript syntax when Node.js is installed, and publication hygiene patterns across HTML, scripts, Markdown and notebooks. It does not execute training or authenticate with external APIs. An automated scan cannot establish complete factual accuracy; report corrections with the page, claim and a primary source.
