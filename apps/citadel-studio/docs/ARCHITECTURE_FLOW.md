# Citadel architecture

Citadel combines a visual workflow editor with bounded execution, source discovery and recorded telemetry. Source discovery and execution evidence have different meanings: a relationship found in code is not a recorded model call.

```mermaid
flowchart LR
  Browser[Browser workspace] --> API[Authenticated API]
  API --> Accounts[PostgreSQL accounts]
  API --> Workspace[Owner-scoped workspace and revisions]
  Workspace --> Plan[Validated workflow plan]
  Plan --> Scheduler[Bounded scheduler]
  Scheduler --> Prepared[Prepared responses]
  Scheduler --> Provider[Configured model provider]
  Scheduler --> Events[Run events and evaluation evidence]
  Events --> Browser
```

The local setup uses fixture storage and mock providers. Workflow execution checks spending limits before dispatch. Secrets are held in server-side memory and scrubbed from persisted evidence and exports. A restart requires reconnecting optional integrations.

```mermaid
flowchart LR
  Source[Selected source] --> Filter[Bounded import and filtering]
  Filter --> Discovery[Static discovery]
  Discovery --> Map[Source-derived graph]
  App[Separately running application] --> Native[Explicit native instrumentation]
  App --> Traces[Configured Langfuse project]
  Native --> Receiver[Project-token receiver]
  Traces --> Import[Manual bounded trace import]
  Receiver --> Observed[Recorded events]
  Import --> Observed
  Map --> Views[Separate source and recorded views]
  Observed --> Views
```

See [connection setup](CONNECTIONS.md) for supported APIs, URL restrictions and limits. Only selected reviewed adapters execute imported source. Unsupported execution fails closed; arbitrary repositories are not treated as safe runnable code. Native tracing sees instrumented operations only. Imported parent spans indicate recorded nesting, not exhaustive data flow.

Evaluations compare fixed inputs using explicit assertions and optional model judgments. Phrase or schema checks do not prove factual accuracy. Export assembles a local executable package; each download still needs its own install, tests and provider configuration.

The current collection build and test evidence is in [BUILDCRAFT.md](../BUILDCRAFT.md). Historical deployment receipts and private infrastructure diagrams are not part of this snapshot.
