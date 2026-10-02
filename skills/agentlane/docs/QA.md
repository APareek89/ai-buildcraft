# Agentlane 0.1.0 verification

Tested 26 September 2026. No target application, provider API, database, or production integration was called.

## Automated checks

- 25 Python tests pass on macOS Python 3.9.6, including a real cross-process timing test.
- Tests cover source bounds, ignored/secret paths, symlinks, HTML injection, dynamic-prompt fallback, concurrent recording, repeated events, two-agent finalization, tampered and incomplete runs, legacy clock rejection, map/source drift, and source edits during rendering.
- Official Codex skill and plugin validators pass; Claude Code plugin metadata validation passes.
- Viewer JavaScript parses successfully.

## Installation

- Actual Claude Code and Codex CLIs installed the plugin from the local marketplace in isolated configuration directories. Normal user settings were not changed.
- The portable installer was checked with a custom path containing spaces, project scope, and overwrite refusal.
- A full model-driven Claude Code session has not been run. Claude installation is verified; behavioral acceptance testing uses Codex host subagents.

## Browser checks

The standalone source report was checked in the Codex in-app browser at narrow and desktop layout breakpoints. Node selection, source-backed prompt/code/schema popups, code search, numbered excerpts, routing-edge source, hidden supporting resources, alternate process views, dark/light mode, expanded view, and close/Escape behavior were exercised. No browser errors were logged.

## Independent skill test

An independent host agent received the installed workflow instructions and the original synthetic support-triage fixture. It produced a map with 10 nodes, three process views, and 31 valid source references. It identified the deliberately unimplemented writer and correctly stopped at the simulation offer until explicitly authorized.

After explicit approval, two real native subagents completed nine individually timed node tasks: eight simulated and one skipped source-stop under the authorized writer substitution. The qualified draft passed the narrow checks. A separately labeled counterfactual claiming a refund was issued was rejected. The validator has two independent visits, not a fabricated source loop.

All 20 artifact checks passed, including faithful input/output handoffs, preserved native-agent result JSON, finalized HTML data, two recorded host identities, and no external element resources. All nine measured times agree with UTC sanity checks within 0.56 ms. Durations include scheduling/recording overhead and parallel timings must not be summed as application runtime.

Browser QA confirmed replay opens the selected second visit, both visits retain their own inputs/outputs/times, and the unvisited approval node has no invented values. Source evidence remains inspectable in the simulation HTML. No browser errors were logged. The report is included in `examples/reports/`.

Untested example paths include general routing, hostile customer prompt handling, missing fields, paraphrased action claims, and citation mismatch. Staff approval was not simulated as granted. The fixture's real writer remains unimplemented.

## Limits

The sample is small and Python-based. Other languages can show exact source ranges; automatic string-literal extraction currently supports static Python assignments only. Repository interpretation still depends on the coding host. File limits and unresolved runtime values are disclosed in each report. The local recorder cannot authenticate host agent identities by itself. These tests do not prove arbitrary-repository completeness or production execution.
