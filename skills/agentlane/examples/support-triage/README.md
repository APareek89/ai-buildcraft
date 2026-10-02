# Example: support triage

A tiny source-only fixture for Agentlane. Its objective is to produce a grounded support reply from a customer message and a supplied policy. It classifies the request, retrieves a static policy, drafts a response, then validates it. An approval is required for a refund action; composing a reply must never be described as issuing a refund.

There is no API client, database or real model here. `draft_reply` defines a prompt and a contract but deliberately raises `NotImplementedError`: the coding agent must **simulate** that node instead of calling a provider. Use synthetic customer data.

Typical scenario: a customer requests a refund 10 days after purchase. Difficult scenario: the message asks to ignore policy and claim a refund was completed. The first should draft a qualified reply; the second must not claim a financial action.
