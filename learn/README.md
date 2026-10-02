# Visual learning guide

**[Open the searchable collection](index.html)** · [ML notebook labs](../labs/ml-foundations/index.html) · [Machine-readable catalog](catalog.json)

29 interactive guides, 129 concept diagrams and 43 notebook/HTML lesson pairs. The HTML lessons can be opened directly; pages using remote fonts or a public CDN need a network connection for those assets. The navigator works without fetching a manifest or calling an API.

## A route through the material

1. Start with **[Agentic Systems Blueprint](guides/agentic-systems-blueprint.html)** to decide what to build and what evidence it needs.
2. Trace **[RAG](guides/rag-visually.html)** and **[agent memory](guides/agent-memory-lifecycle.html)** before choosing infrastructure.
3. Work through **[retrieval evaluation](guides/retrieval-eval-lab.html)** and **[agent evaluation](guides/agent-eval-lab.html)** to separate a plausible answer from a reliable system.
4. Explore **[fine-tuning](guides/fine-tuning-first-principles.html)** and **[RLHF](guides/rlhf-weight-update.html)** to understand what model adaptation actually changes.
5. Run the **[ML foundations notebooks](../labs/ml-foundations/README.md)** and record your own results.

## Interactive guides

- [Agentic Systems Blueprint — Define, design, build and operate](guides/agentic-systems-blueprint.html) — Five-stage agent-system decision framework with workbook, decision packs and evidence gates.
- [RAG, Visually — from a raw document to a grounded answer](guides/rag-visually.html) — Visual document-to-chunk-to-retrieval-to-grounded-answer walkthrough.
- [Agent memory — the lifecycle, live](guides/agent-memory-lifecycle.html) — Interactive agent memory lifecycle.
- [Retrieval Eval Lab](guides/retrieval-eval-lab.html) — Retrieval evaluation and golden-set design.
- [Agent Eval Lab](guides/agent-eval-lab.html) — Interactive agent evaluation concepts and worked checks.
- [Inside LLMs](guides/inside-llms.html) — Trace tokens, attention, training and inference inside a language model.
- [Inside CNNs](guides/inside-cnns.html) — Trace convolution, feature maps, pooling, training and image-classification decisions.
- [Inside Diffusion](guides/inside-diffusion.html) — Follow noise schedules, the denoiser, training and reverse sampling with visible code.
- [Inside Speech Models](guides/inside-speech-models.html) — Walk through audio features and the model pipeline that turns sound into language.
- [KV cache, step by step](guides/kv-cache-step-by-step.html) — Step through prefill and decoding to see exactly which keys and values are reused.
- [LoRA Training by Hand](guides/lora-training-by-hand.html) — Change logits, rank, learning rate and masking to see training mechanics in small tensors.
- [Fine-Tuning from First Principles — LoRA & Full Fine-Tuning](guides/fine-tuning-first-principles.html) — Worked explanation of forward pass, gradients, full fine-tuning and LoRA.
- [RLHF: how a reward becomes a weight update](guides/rlhf-weight-update.html) — Interactive explanation of how reward turns into a policy-gradient weight update.
- [RLHF Token Credit](guides/rlhf-token-credit.html) — Follow a sequence-level reward through token advantages, gradients and probability updates.
- [Classical ML for AI Product Managers — Rapid Recap](guides/classical-ml-recap.html) — Classical ML concepts and evaluation for AI product managers.
- [ML Field Guide — think on your feet](guides/ml-field-guide.html) — Interactive ML approach finder and practical decision guide.
- [MLOps, end to end — beverage distribution edition](guides/mlops-end-to-end.html) — End-to-end MLOps explained through beverage-distribution examples.
- [Building an Agentic Workflow That Turns Marketing Scripts into Ads](guides/scripts-to-ads-workflow.html) — Building an Agentic Workflow That Turns Marketing Scripts into Ads with interactive explanations and code examples.
- [Build with the Agent2Agent (A2A) Protocol](guides/build-with-a2a.html) — Build with the Agent2Agent (A2A) Protocol with interactive explanations and code examples.
- [How the A2A Protocol Works](guides/how-a2a-works.html) — How the A2A Protocol Works with interactive explanations and code examples.
- [Build and Run LLM App Evaluations to Catch Breaking Changes](guides/llm-app-evaluations.html) — Build and Run LLM App Evaluations to Catch Breaking Changes with interactive explanations and code examples.
- [Build a Sales Signal System with Apify + AI Agent](guides/sales-signal-workflow.html) — Build a Sales Signal System with Apify + AI Agent with interactive explanations and code examples.
- [Agent Frameworks Crash Course — for people who already know LangGraph](guides/agent-frameworks.html) — Comparative guide to agent frameworks.
- [Cloud for AI apps — zero to interview-ready](guides/cloud-for-ai-apps.html) — Cloud compute, storage, networking and serving explained for AI applications.
- [Thread Orchestration — How One Conversation Is Conducted](guides/conversation-orchestration.html) — Interactive scripted demonstration of a full conversation orchestration flow.
- [Databases for Agentic Apps — A Visual Crash Course](guides/databases-for-agentic-apps.html) — Visual database choices for agent applications.
- [From shaking air to a spectrum](guides/sound-to-spectrum.html) — Animated explanation from sound waves to frequency spectra.
- [One Tree, Plainly — Synthetic edition](guides/one-tree-plainly.html) — Follow a synthetic week through CART splits and inspect the stored regression tree.
- [Tree by Tree — Synthetic edition](guides/tree-by-tree.html) — Build a gradient-boosted ensemble one residual tree at a time using generated seasonal data.

## Scope and provenance

Anand Pareek assembled and developed these learning materials with AI assistance. They are teaching resources, not a claim that every underlying algorithm, code excerpt or framework is original. Existing references, framework names and public upstream links remain in the material. Third-party software, datasets and model weights retain their own terms.

The concept atlas preserves all 129 diagrams, including related views of some concepts. The longer guides are a curated subset rather than a bulk export of personal artifacts. Internal architecture examples, personal assessment results, unfinished lesson fragments and third-party course downloads are excluded. No account data, local environment, model checkpoint or private dataset is included.

The fine-tuning guide retains archived numeric teaching examples but does not bundle the original checkpoint or assert newly reproduced metrics. The conversation-orchestration page is a scripted demonstration. MLOps scenarios are teaching assumptions. Provider APIs, pricing, certification material and sample code are version-sensitive; this edition does not claim a fresh factual or runtime audit of every lesson.

See [attribution and license scope](ATTRIBUTION.md) for the retained upstream notices.

## Validation

From the repository root:

```bash
python3 learn/validate.py
```

This checks catalog targets, local HTML references, HTML structure, notebook output hygiene, Python syntax, inline JavaScript syntax when Node.js is installed, and publication hygiene patterns across HTML, scripts, Markdown and notebooks. It does not execute training or authenticate with external APIs. An automated scan cannot establish complete factual accuracy; report corrections with the page, claim and a primary source.
