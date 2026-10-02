# @blindspot/sdk

Lightweight TypeScript connector for Blindspot workflow telemetry, explicit context sharing and
approval-gated managed model resolution. Telemetry is best-effort and must never break the host
application.

## Build the local SDK

From the Blindspot app root, install the workspace with `pnpm install --frozen-lockfile` and run `pnpm --filter @blindspot/sdk build`. The package is a local workspace dependency; this collection does not publish a registry package or a hosted archive. See the [app setup](../../README.md).

## Environment contract

```dotenv
BLINDSPOT_API_KEY=<server-only application key>
BLINDSPOT_BASE_URL=http://localhost:3000
BLINDSPOT_ENVIRONMENT=development
BLINDSPOT_CAPTURE=metadata
BLINDSPOT_ROUTING=observe_only
```

- `metadata` stores operational metadata but omits input/output content. `inputs` adds inputs;
  `full` adds inputs and outputs. The effective server policy can only make capture stricter.
- `observe_only` records the application's real model and never changes routing.
- `managed` calls `resolveModel()` at an instrumented generation boundary. It falls back to the
  app's configured model if Blindspot is disabled, slow or unavailable.
- Missing key/base URL disables the connector and reports through `onError`; the app still runs.

## Minimum integration

```ts
import { Blindspot } from "@blindspot/sdk";

export const blindspot = Blindspot.fromEnv({
  workflow: "my-agent",
  framework: "custom",
  language: "typescript",
  onError: (error) => console.warn("[blindspot]", error.message),
});
```

Create one root span at the real request boundary and reuse its execution id for children:

```ts
const executionId = crypto.randomUUID();
const root = blindspot.span({
  executionId,
  node: "pipeline",
  kind: "agent",
  input: request,
});

try {
  const answer = await runAgent(executionId, request);
  root.end({ output: answer, executionStatus: "completed", executionEndedAt: new Date() });
  return answer;
} catch (error) {
  root.end({ status: "error", error: String(error), executionStatus: "error" });
  throw error;
} finally {
  await blindspot.flush();
}
```

Wrap the shared model-call helper so every generation call reports its actual node and model:

```ts
return blindspot.observeGeneration(
  {
    executionId,
    parentId: root.id,
    node: "answer-writer",
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    input,
  },
  () => existingModelCall(input),
);
```

Use `blindspot.span()` with `kind: "retrieval"`, `"tool"` or `"function"` for deterministic
steps that need visibility. Only generation nodes become model Routes.

## Observed nodes are not declared topology

The current gateway creates a workflow node only when it receives an executed span. It does not scan
the application's repository. Therefore:

- uninstrumented deterministic code is absent;
- an instrumented branch is absent until a request executes it in that environment;
- development and production can show different distinct-node counts; and
- repeating the same path increases span/execution counts, not distinct-node count.

The SDK can emit every supported kind, but a startup topology manifest and declared-vs-observed
coverage are planned follow-ups. Do not present the current map as the entire source architecture.

## Managed model resolution

```ts
const modelRef = await blindspot.resolveModel("answer-writer", "anthropic:claude-sonnet-4-6");
```

This returns an approved model only when `BLINDSPOT_ROUTING=managed`. In observe-only it returns the
fallback unchanged. An approval on an observe-only workflow is recorded as awaiting application
rollout; Blindspot never claims a switch occurred.

## Explicit context sharing

`shareContext(manifest)` is a separate, revocable application action. Blindspot never reads README,
design, prompt or architecture files merely because the SDK is installed. The app owner chooses and
sends bounded content; metadata-only telemetry remains independent.

See [architecture semantics](../../docs/ARCHITECTURE_FLOW.md) for the evidence loop.
