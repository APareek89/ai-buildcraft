# Agentlane Diagram

Turn an agentic repository into an interactive HTML process map. Swimlanes show who owns the work; stages show how it flows. Click a node to understand its role, inputs, outputs, and connections, then open the **actual source-backed system prompt, implementation, or schema** in a popup.

Invoke the skill in the project you want to understand. It reads that project and generates its map; it does not return a hard-coded Demo Studio diagram.

After presenting the map, the coding agent asks whether you want a **free simulation**. If you agree, real subagents reason through the workflow and generate another HTML with each visited node's input, simulated output, and measured simulation duration. **No application/provider API calls are made. Your coding-agent subscription, credits, or token usage still applies.**

In AI Buildcraft, run installation commands from `skills/agentlane/`, the package root. Historical acceptance notes describe the source package; current free checks are `python3 -m unittest discover -s tests -v`.

## Install in Claude Code

Run these from this repository's root:

```bash
claude plugin marketplace add ./
claude plugin install agentlane@agentlane-local
```

Or, inside Claude Code, use these slash commands (replace the path if you moved the repo):

```text
/plugin marketplace add /absolute/path/to/agentlane-skill
/plugin install agentlane@agentlane-local
```

Start Claude Code in any target project, then invoke:

```text
/agentlane:agentlane
```

For an existing session, follow Claude's reload message or start a new session. The plugin adds one skill with local scripts; it installs no hooks, network service, or MCP server. These commands use Claude's documented [local marketplace installation](https://code.claude.com/docs/en/plugin-marketplaces) and [plugin skill namespace](https://code.claude.com/docs/en/plugins).

To try it for one session without installing a marketplace, launch Claude from your target project with an absolute path to the plugin:

```bash
claude --plugin-dir /path/to/agentlane-skill/plugins/agentlane
```

Then use `/agentlane:agentlane`. This is Claude Code's [session-only plugin loading](https://code.claude.com/docs/en/discover-plugins), not an API call.

## Install in Codex

From this repository's root, with a Codex version that provides plugin commands:

```bash
codex plugin marketplace add ./
codex plugin add agentlane@agentlane-local
```

Open a new Codex task in a target project and invoke:

```text
Use $agentlane to map this project.
```

If `codex plugin` is unavailable in your version, install the portable skill instead:

```bash
python3 scripts/install_skill.py --agent codex --scope user
```

The fallback copies the entire skill to `~/.codex/skills/agentlane`, including the renderer and references. It does not change settings or install a native plugin. Restart/reload skills in the host as needed.

## Other coding agents

The skill follows the `SKILL.md` directory format. Native plugin manifests are supplied for Claude Code and Codex. Other hosts get a **portable skill**, not a claim of native plugin compatibility.

From this repository's root:

```bash
# Cursor: ~/.cursor/skills/agentlane
python3 scripts/install_skill.py --agent cursor --scope user

# OpenCode: ~/.config/opencode/skills/agentlane
python3 scripts/install_skill.py --agent opencode --scope user
```

Cursor documents these [skill directories](https://cursor.com/docs/skills); OpenCode documents its [skill directories](https://opencode.ai/v2/docs/skills). In the host, select the installed Agentlane skill or ask it to “Use the agentlane skill to map this repository.” Invocation UI varies by version.

For another host that supports the Agent Skills folder format, copy it to the host's documented skills directory:

```bash
python3 scripts/install_skill.py --dest /path/to/host/skills/agentlane
```

Or install only in a target project:

```bash
python3 scripts/install_skill.py --agent cursor --scope project --project /path/to/project
```

The installer refuses an existing destination and never edits agent configuration. Keep one installation per host to avoid duplicate skill discovery. The map needs file-reading, Python execution, and artifact presentation. The optional simulation additionally needs a host that exposes **at least two genuine subagents**. When unavailable, the skill reports that limitation rather than faking the run.

## What the skill produces

Generated artifacts go in `.agentlane/<UTC-timestamp>/` under the target project unless another output location is requested:

- `inventory.json`: file inventory used to check coverage.
- `map.json`: the coding agent's source-grounded semantic map.
- `source.html`: standalone Agentlane Diagram with actual prompt/code/schema excerpts.
- `run.json` and `simulation.html`: optional simulated path and per-node evidence, after consent.

The HTML is self-contained and works without a backend or external assets. It supports process views, readable swimlanes, light/dark themes, source popups, hidden supporting resources, and simulation inspection. UI, database/auth connection code, Markdown, and infrastructure stay outside the main diagram unless they implement a meaningful workflow gate.

The main map stays honest about declared versus inferred relationships, missing runtime values, and unresolved paths. Source references are read into the artifact, not left as file links. A dynamic prompt appears as a template or assembly function unless its final runtime value is actually available. A node with no prompt says so.

Simulation duration is wall-clock time for a coding-host node task, including dispatch and recording overhead. It is **not the application's latency**. Tool results are synthetic fixtures; app code is not executed. Simulations can expose likely reasoning or contract issues, but do not establish production behavior or complete test coverage.

## Open the included example

The synthetic support-triage example includes a [source diagram](examples/reports/source.html) and a [multi-agent simulation report](examples/reports/simulation.html). Open either HTML locally in a browser. These reports are static examples produced during acceptance testing; invoking the skill builds new reports from your current repository.

## Boundaries

- The target app is read-only. The skill does not fix code, deploy, or change configuration.
- No target imports, app execution, provider SDK calls, credential access, or application API requests.
- The source map is delivered before the optional simulation starts.
- Real host-native subagents are required for simulation; identities and measured timers are recorded.
- Generated reports may contain proprietary prompts and code. Keep them local and out of commits; add `.agentlane/` to the target project's ignore rules if appropriate. The skill does not silently edit those rules.
- Common credential patterns are redacted, but automated redaction is not an exhaustive guarantee. Review an artifact before sharing it.

## Repository layout

```text
.agents/plugins/marketplace.json       Codex marketplace
.claude-plugin/marketplace.json        Claude Code marketplace
plugins/agentlane/
  .codex-plugin/plugin.json            Codex plugin manifest
  .claude-plugin/plugin.json           Claude Code plugin manifest
  skills/agentlane/
    SKILL.md                          Shared workflow instructions
    agents/openai.yaml                Codex skill metadata
    references/                       Map contract and simulation procedure
    scripts/agentlane.py               Local inventory/render/timing CLI
    assets/                           Standalone viewer template
scripts/install_skill.py              Portable skill copier
```

Python 3.9+ and a coding agent with repository access are required. The scripts use Python's standard library. No API keys or package installation are required by Agentlane itself.

For the data contract and engine commands, see [map-format.md](plugins/agentlane/skills/agentlane/references/map-format.md). For the optional run, see [simulation.md](plugins/agentlane/skills/agentlane/references/simulation.md).

## Packaging verification

Both native marketplace installation paths were verified with the actual Codex and Claude Code CLIs in isolated configuration directories. Normal user settings were untouched. Skill and plugin metadata validation passed. The portable installer was checked with a custom path containing spaces, a project-scoped installation, and an existing destination it correctly refused to overwrite.

Installation validation is separate from a full Claude session running the skill. Host behavior and available subagent tools still depend on the version and configuration you use.

See [QA evidence and limits](docs/QA.md) for historical acceptance checks. The operational learning log is intentionally excluded from this edition.
