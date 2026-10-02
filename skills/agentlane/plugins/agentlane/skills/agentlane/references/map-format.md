# Map and report contract

The coding agent supplies a semantic map grounded in the target repository. The offline engine validates structure, reads exact referenced source, embeds it in the viewer, and records simulation timers. It does not use an LLM, execute target code, or discover a correct graph on its own.

## `map.json`

Use UTF-8 JSON with a top-level object and `schemaVersion: "1.0"`. The map contains these fields:

```json
{
  "schemaVersion": "1.0",
  "project": {
    "name": "Project name",
    "objective": "The user outcome this application is designed to produce.",
    "sourceRevision": "commit or explicit working-tree snapshot label"
  },
  "lanes": [],
  "nodes": [],
  "edges": [],
  "flows": [],
  "hiddenResources": [],
  "coverage": {"notes": []}
}
```

This is a structural illustration, not a valid finished map: fill nonempty lanes, nodes, and flows from the current application. Prefer short stable lowercase IDs matching `[a-z][a-z0-9_-]*`; the validator permits up to 100 alphanumeric, `_`, `.`, `:`, or `-` characters with an alphanumeric start. IDs must be unique within each collection.

### Project and coverage

`project.name` and `project.objective` are required nonempty strings. `sourceRevision` is optional; prefer a Git commit plus a clear dirty-worktree note when relevant. Put material uncertainties in `coverage.notes` as strings: excluded files, inventory caps, unread branches, dynamic routing, absent prompts, inferred relationships, and intentionally unmapped components. Do not equate file inventory coverage with complete behavioral coverage.

The engine's inventory is bounded: up to 2,500 eligible files, 20,000 scanned files, 1 MB per source file. If `truncated` is true, disclose it. It excludes dependencies, generated/private directories, credential-shaped paths, unsupported binary files, symlinks, and Git-ignored content. Resolve exclusions by selecting safe source evidence; do not disable exclusions or read secrets to make coverage look complete.

### Lanes

Each lane is `{ "id": "agents", "label": "Agents", "description": "Reasoning and generation" }`. Choose responsibilities that fit the application. There must be 1–20 lanes. Their array order is their vertical order.

### Nodes

Each semantic node uses:

```json
{
  "id": "reason",
  "label": "Reason about the answer",
  "lane": "agents",
  "kind": "agent",
  "description": "Combine the user's request with retrieved evidence.",
  "inputs": ["Question", "Retrieved evidence", "Conversation state"],
  "outputs": ["Draft answer or requested tool calls"],
  "logic": "Explain the actual routing, constraints, and failure behavior found in source.",
  "sourceRefs": [],
  "inspect": ["Does the prompt require citations for factual claims?", "What happens when no source supports the answer?"],
  "promptNote": "Explain missing or dynamically assembled prompt content here, when applicable."
}
```

Use a lane ID that exists. `kind` is a short role such as `human`, `orchestrator`, `agent`, `tool`, `validator`, or `guardrail`. `inputs` and `outputs` describe contracts in plain language; strings, arrays, or structured objects can be used. Avoid presenting a made-up sample as real observed data. `logic` explains the implementation's practical effect and failure behavior. `inspect` is an optional array of plain-language debugging checks, not source reference objects. `promptNote` is optional text explaining unavailable/dynamic prompt material. Node labels are short enough to read on a diagram.

Ground application nodes with `sourceRefs`; the viewer separates references into prompt/code/schema popups according to their `kind`. If a node is a conceptual user entry/exit rather than a source function, state that distinction in its description. For missing source or unresolved external code, explain the gap in `logic` and `coverage.notes`. Do not invent a source reference or a system prompt.

There may be up to 250 nodes. Prefer separate process views for large applications rather than putting every node on one diagram. A shared node may appear in more than one view. Keep semantic nodes granular enough that a simulated visit corresponds to one meaningful task.

### Source references

A reference is an exact **one-based, inclusive** source range:

```json
{
  "path": "src/agents/answer.py",
  "startLine": 12,
  "endLine": 29,
  "title": "Answer system prompt · static literal",
  "kind": "prompt",
  "extraction": "literal",
  "symbol": "SYSTEM_PROMPT"
}
```

The example location is illustrative; use paths and line numbers you have actually read. The range must contain 1–600 lines. `path` is a repository-relative POSIX path with no `..`, drive prefix, absolute path, or symlink. `kind` is exactly `code`, `prompt`, or `schema`. `title` and `symbol` are optional. A `schema` reference points to the actual schema/type/validator code, not an invented contract.

Omit `extraction` to show the exact source lines, which works for any supported text language. `extraction: "literal"` optionally extracts a static Python string assignment using AST literal evaluation. `symbol` narrows it to a named assignment. This does not import the module. Dynamic expressions and other languages remain exact source excerpts with an explanatory note; they are not evaluated. Label templates and assembly functions in `title`, and explain missing runtime inputs in the node's logic.

At render time the engine enriches each reference with `text`, `sha256`, `extractionNote`, and `redacted`. Do not pre-fill extracted text yourself. These values come from the referenced files. The SHA-256 identifies the original range; common credential patterns in displayed text are redacted. Limits are 100 references per item, 1,000 total references, and 3 MB of embedded source excerpts. Narrow ranges to relevant implementations instead of whole files.

### Edges

Each edge uses:

```json
{
  "id": "reason-tools",
  "source": "reason",
  "target": "tools",
  "label": "Tool requested",
  "kind": "conditional",
  "condition": "The model requests an allowed tool and the source-defined limit allows it.",
  "sourceRefs": []
}
```

Both endpoints must exist. `kind` is one of `declared`, `inferred`, `conditional`, or `feedback`. Include source references for the routing evidence when present, and preserve the actual condition; do not invent a condition from a node name. `feedback` represents a return/retry loop. `inferred` explicitly means reasoning from source rather than a declared graph connection. There may be up to 1,500 edges.

### Process views

Each flow specifies the stages and relevant relationships:

```json
{
  "id": "answer-question",
  "label": "Answer a question",
  "description": "The customer question path, including optional tool use.",
  "stages": ["Receive", "Find evidence", "Reason", "Check", "Respond"],
  "placements": [
    {"nodeId": "question", "column": 0},
    {"nodeId": "reason", "column": 2},
    {"nodeId": "tools", "column": 2}
  ],
  "edgeIds": ["reason-tools"]
}
```

Columns are zero-based. There may be 1–30 flows and 1–20 named stages per flow; prefer 2–6 stages per view for readability. Place each node at most once in a flow; use a feedback edge for a loop. Each **lane + column** cell may contain one node, so `reason` and `tools` in this example must belong to different lanes. Every selected edge must connect nodes placed in that flow. Nodes can appear in several separate flows without implying those flows automatically run one after another.

### Hidden resources

`hiddenResources` is an array of safe repository-relative paths, for example `"ui/chat.tsx"` or `"docs/architecture.md"`. Use actual inventory paths, not directory names, globs, or invented file lists. They remain inspectable supporting resources without cluttering the workflow. There may be up to 2,500 entries, and each must appear in the safe bounded inventory. If a UI/auth component implements a meaningful approval or access gate, represent that gate as a main node and keep unrelated plumbing hidden.

## CLI: map and source HTML

Resolve `SKILL_DIR` from the installed skill location, `REPO` from the target project, and `REPORT_DIR` from its selected output directory:

```bash
python3 "$SKILL_DIR/scripts/agentlane.py" inventory --repo "$REPO" --out "$REPORT_DIR/inventory.json"
python3 "$SKILL_DIR/scripts/agentlane.py" validate --map "$REPORT_DIR/map.json"
python3 "$SKILL_DIR/scripts/agentlane.py" render --repo "$REPO" --map "$REPORT_DIR/map.json" --out "$REPORT_DIR/source.html"
```

`validate` checks map structure without loading target files. `render` additionally validates source paths/ranges and exclusions, reads excerpts, and produces a self-contained HTML. Success returns a small JSON summary; errors return a nonzero exit status with an `error` message. Treat a failed render as unfinished work. Use a fresh report directory so old private reports are not accidentally replaced or confused with new evidence.

## Simulation JSON and commands

Only run this after the user opts in. See [simulation.md](simulation.md) for real subagent orchestration.

`scenario.json` is a JSON object. A useful shape is:

```json
{
  "name": "Supported question",
  "objective": "Produce a grounded answer with an explicit uncertainty statement when evidence is missing.",
  "flowId": "answer-question",
  "input": {"question": "Synthetic user question"},
  "fixtures": {"retrieval": "Explicitly synthetic context"},
  "expectedBehavior": "Describe expectations from the application's objective and source.",
  "assumptions": ["No live retrieval or provider calls."]
}
```

Node input files must also be JSON objects. Wrap a scalar or list as `{ "value": ... }` when necessary. Preserve actual earlier simulated outputs for downstream nodes. Subagent result files are JSON objects:

```json
{
  "status": "simulated",
  "output": {"answer": "The subagent's actual simulated result"},
  "notes": "What the node did and any diagnostic observation.",
  "assumptions": ["All external context is from declared synthetic fixtures."],
  "evidence": ["src/agents/answer.py:12-29"]
}
```

`status` is exactly `simulated`, `blocked`, or `skipped`; `output` is required and may be any JSON value, including `null` for blocked/skipped. `notes` is text; `assumptions` is a list of strings; `evidence` is a list. Use one event per individual node task; revisits get new events. Source observations and simulated hypotheses should be clearly distinguished in the notes.

```bash
python3 "$SKILL_DIR/scripts/agentlane.py" simulation init --repo "$REPO" --map "$REPORT_DIR/map.json" --out "$REPORT_DIR/run.json" --scenario "$REPORT_DIR/scenario.json"
python3 "$SKILL_DIR/scripts/agentlane.py" simulation start --run "$REPORT_DIR/run.json" --node NODE_ID --input "$REPORT_DIR/node-input.json"
# Delegate this node now using the host's native subagent tool.
python3 "$SKILL_DIR/scripts/agentlane.py" simulation finish --run "$REPORT_DIR/run.json" --event EVENT_ID --result "$REPORT_DIR/node-result.json" --agent-id ACTUAL_HOST_AGENT_ID
# Repeat start/delegate/finish for the source-supported path.
python3 "$SKILL_DIR/scripts/agentlane.py" simulation finalize --run "$REPORT_DIR/run.json"
python3 "$SKILL_DIR/scripts/agentlane.py" render --repo "$REPO" --map "$REPORT_DIR/map.json" --run "$REPORT_DIR/run.json" --out "$REPORT_DIR/simulation.html"
```

The recorder produces the event ID, UTC timestamps, measured monotonic duration, and source-map fingerprint. Initialization also stores `sourceSnapshot` and `sourceFingerprint` from the referenced source-file hashes. It rejects duplicate finishes, unknown nodes, unfinished finalization, fewer than two supplied host-agent IDs, and a simulation rendered against a different map or changed referenced source. Keep run files intact; finalized evidence is immutable through the CLI. The recorder cannot independently verify supplied host identities or that simulated output is truthful. Those are the coding agent's responsibility, backed by actual delegation history. Duration is coding-host task wall-clock time, never application latency.
