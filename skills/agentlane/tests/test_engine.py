"""Offline checks: source safety, graph integrity, recording and concurrent dispatch."""
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest import mock

ENGINE_PATH = Path(__file__).resolve().parents[1] / "plugins/agentlane/skills/agentlane/scripts/agentlane.py"
spec = importlib.util.spec_from_file_location("agentlane_engine", ENGINE_PATH)
engine = importlib.util.module_from_spec(spec)
spec.loader.exec_module(engine)


def minimal_map():
    return {
        "schemaVersion": "1.0",
        "project": {"name": "Synthetic Support", "objective": "Answer support questions using approved evidence."},
        "lanes": [{"id": "agents", "label": "Agents"}, {"id": "checks", "label": "Checks"}],
        "nodes": [
            {"id": "answer", "label": "Answer", "lane": "agents", "kind": "agent", "description": "Draft answer", "sourceRefs": [{"path": "app.py", "startLine": 1, "endLine": 1, "kind": "prompt", "extraction": "literal", "symbol": "SYSTEM_PROMPT"}]},
            {"id": "check", "label": "Check", "lane": "checks", "kind": "guardrail", "description": "Check evidence", "sourceRefs": [{"path": "app.py", "startLine": 2, "endLine": 3, "kind": "code"}]},
        ],
        "edges": [{"id": "answer-check", "source": "answer", "target": "check", "kind": "declared", "label": "validate", "sourceRefs": []}],
        "flows": [{"id": "main", "label": "Answer question", "stages": ["Draft", "Check"], "placements": [{"nodeId": "answer", "column": 0}, {"nodeId": "check", "column": 1}], "edgeIds": ["answer-check"]}],
        "hiddenResources": ["README.md"],
        "coverage": {"notes": ["Synthetic fixture; not application execution."]},
    }


class EngineTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.base = Path(self.temporary.name)
        self.repo = self.base / "repo"
        self.repo.mkdir()
        (self.repo / "app.py").write_text('SYSTEM_PROMPT = "Use the provided evidence only."\nraise RuntimeError("TARGET MUST NEVER EXECUTE")\n# static reference\n')
        (self.repo / "README.md").write_text("Synthetic public fixture.\n")
        self.mapping = minimal_map()
        self.map_path = self.base / "map.json"
        self.scenario = self.base / "scenario.json"
        self.input = self.base / "input.json"
        self.result = self.base / "result.json"
        self.run = self.base / "run.json"
        self.write(self.map_path, self.mapping)
        self.write(self.scenario, {"objective": "Synthetic test", "input": "Where is my order?"})
        self.write(self.input, {"question": "Where is my order?"})
        self.write(self.result, {"status": "simulated", "output": "Tracking not supplied.", "notes": "Fixture output, not live inference", "assumptions": [], "evidence": []})
        self.template_root = self.base / "skill"
        (self.template_root / "assets").mkdir(parents=True)
        (self.template_root / "scripts").mkdir()
        (self.template_root / "assets/report.html").write_text('<!doctype html><script type="application/json">__AGENTLANE_DATA__</script>')

    def tearDown(self):
        self.temporary.cleanup()

    def write(self, path, value):
        path.write_text(json.dumps(value))

    def init(self):
        return engine.init_run(self.map_path, self.run, self.scenario, self.repo)

    def event(self, node="answer", agent="fixture-agent-one"):
        start = engine.start_event(self.run, node, self.input)
        engine.finish_event(self.run, start["eventId"], self.result, agent)
        return start["eventId"]

    def render(self, mapping=None, run=None):
        if mapping is not None:
            self.write(self.map_path, mapping)
        out = self.base / "report.html"
        with mock.patch.object(engine, "__file__", str(self.template_root / "scripts/agentlane.py")):
            engine.render(self.repo, self.map_path, out, run)
        return out.read_text()

    def test_inventory_excludes_private_generated_and_symlink_files(self):
        for name in (".env", "secrets.json", "mysecrets.txt", "credentials.ini", "private-key.pem"):
            (self.repo / name).write_text("PRIVATE")
        for directory in ("node_modules", ".agentlane", ".local", ".aws"):
            (self.repo / directory).mkdir()
            (self.repo / directory / "hidden.py").write_text("PRIVATE")
        (self.repo / "linked.py").symlink_to(self.repo / "app.py")
        data = engine.inventory(self.repo)
        self.assertEqual({f["path"] for f in data["files"]}, {"app.py", "README.md"})
        self.assertFalse(data["truncated"])
        self.assertIn("symlink", {f["reason"] for f in data["skipped"]})

    def test_gitignore_is_honored(self):
        subprocess.run(["git", "init", "-q", str(self.repo)], check=True)
        (self.repo / ".gitignore").write_text("private/\nignored.py\n")
        (self.repo / "private").mkdir()
        (self.repo / "private/data.py").write_text("private")
        (self.repo / "ignored.py").write_text("private")
        data = engine.inventory(self.repo)
        self.assertNotIn("ignored.py", [item["path"] for item in data["files"]])
        self.assertNotIn("private/data.py", [item["path"] for item in data["files"]])
        bad = copy.deepcopy(self.mapping)
        bad["nodes"][0]["sourceRefs"][0]["path"] = "ignored.py"
        with self.assertRaisesRegex(engine.AgentlaneError, "gitignored"):
            self.render(bad)

    def test_inventory_caps_are_explicit(self):
        with mock.patch.object(engine, "MAX_FILES", 1):
            data = engine.inventory(self.repo)
        self.assertTrue(data["truncated"])
        self.assertEqual(len(data["files"]), 1)

    def test_graph_rejects_duplicate_ids_dangling_edges_and_overlapping_cells(self):
        cases = []
        duplicate = copy.deepcopy(self.mapping)
        duplicate["nodes"][1]["id"] = "answer"
        cases.append(duplicate)
        dangling = copy.deepcopy(self.mapping)
        dangling["edges"][0]["target"] = "missing"
        cases.append(dangling)
        overlap = copy.deepcopy(self.mapping)
        overlap["nodes"][1]["lane"] = "agents"
        overlap["flows"][0]["placements"][1]["column"] = 0
        cases.append(overlap)
        missing_placement = copy.deepcopy(self.mapping)
        missing_placement["flows"][0]["placements"].pop()
        cases.append(missing_placement)
        for mapping in cases:
            with self.subTest(mapping=mapping), self.assertRaises(engine.AgentlaneError):
                engine.validate_map(mapping)

    def test_source_paths_and_ranges_are_guarded(self):
        for path in ("../outside.py", "/tmp/file.py", "C:\\private.py", ".env"):
            bad = copy.deepcopy(self.mapping)
            bad["nodes"][0]["sourceRefs"][0]["path"] = path
            with self.subTest(path=path), self.assertRaises(engine.AgentlaneError):
                self.render(bad)
        bad = copy.deepcopy(self.mapping)
        bad["nodes"][0]["sourceRefs"][0]["endLine"] = 50
        with self.assertRaisesRegex(engine.AgentlaneError, "file length"):
            self.render(bad)

    def test_source_refs_refuse_symlinked_directories(self):
        outside = self.base / "outside"
        outside.mkdir()
        (outside / "code.py").write_text("sensitive")
        (self.repo / "link").symlink_to(outside, target_is_directory=True)
        bad = copy.deepcopy(self.mapping)
        bad["nodes"][0]["sourceRefs"][0]["path"] = "link/code.py"
        with self.assertRaisesRegex(engine.AgentlaneError, "Symlinked"):
            self.render(bad)

    def test_ast_extracts_prompt_without_executing_target(self):
        data = engine.read_source(self.repo, self.mapping["nodes"][0]["sourceRefs"][0])
        self.assertEqual(data["text"], "Use the provided evidence only.")
        self.assertIn("AST", data["extractionNote"])
        self.assertEqual(len(data["sha256"]), 64)

    def test_dynamic_prompt_is_not_fabricated(self):
        (self.repo / "app.py").write_text('SYSTEM_PROMPT = f"Hello {customer_name}"\n')
        data = engine.read_source(self.repo, self.mapping["nodes"][0]["sourceRefs"][0])
        self.assertIn("customer_name", data["text"])
        self.assertIn("runtime values were not evaluated", data["extractionNote"])

    def test_html_embeds_safely_and_supporting_files_are_clickable_data(self):
        self.mapping["project"]["objective"] = "</script><script>bad()</script>\u2028"
        output = self.render(self.mapping)
        self.assertNotIn("<script>bad()", output)
        self.assertIn("\\u003c/script>", output)
        self.assertIn("\\u2028", output)
        self.assertIn("supportingFiles", output)
        self.assertIn("Synthetic public fixture.", output)
        self.assertIn("TARGET MUST NEVER EXECUTE", output)

    def test_credential_literals_are_redacted(self):
        text = 'api_key = "secret-key-value"\n' + "AKIA" + "X" * 16
        safe, changed = engine.redact_credentials(text)
        self.assertTrue(changed)
        self.assertNotIn("secret-key-value", safe)
        self.assertNotIn("AKIA", safe)

    def test_result_cannot_supply_fake_duration(self):
        self.init()
        self.write(self.result, {"status": "simulated", "output": "fixture", "durationMs": 999999, "startedAt": "fake"})
        self.event()
        event = engine.read_json(self.run)["events"][0]
        self.assertTrue(event["measured"])
        self.assertNotEqual(event["durationMs"], 999999)
        self.assertNotEqual(event["startedAt"], "fake")
        self.assertEqual(event["durationBasis"], "agent_wall_clock")

    def test_finalize_requires_multiple_agents_and_terminal_events(self):
        self.init()
        self.event()
        with self.assertRaisesRegex(engine.AgentlaneError, "two distinct"):
            engine.finalize_run(self.run)
        pending = engine.start_event(self.run, "check", self.input)
        with self.assertRaisesRegex(engine.AgentlaneError, "Finish all"):
            engine.finalize_run(self.run)
        engine.finish_event(self.run, pending["eventId"], self.result, "fixture-agent-two")
        engine.finalize_run(self.run)
        self.assertEqual(engine.read_json(self.run)["status"], "finalized")

    def test_finalized_evidence_is_immutable_and_hash_checked(self):
        self.init()
        self.event()
        self.event("check", "fixture-agent-two")
        engine.finalize_run(self.run)
        with self.assertRaisesRegex(engine.AgentlaneError, "immutable"):
            engine.start_event(self.run, "answer", self.input)
        run = engine.read_json(self.run)
        run["events"][0]["output"] = "tampered"
        self.write(self.run, run)
        with self.assertRaisesRegex(engine.AgentlaneError, "changed after"):
            self.render(run=self.run)

    def test_event_cannot_be_finished_twice(self):
        self.init()
        event_id = self.event()
        with self.assertRaisesRegex(engine.AgentlaneError, "already finished"):
            engine.finish_event(self.run, event_id, self.result, "fixture-agent-two")

    def test_map_mismatch_rejected(self):
        self.init()
        self.event()
        self.event("check", "fixture-agent-two")
        engine.finalize_run(self.run)
        self.mapping["project"]["objective"] = "Changed objective"
        with self.assertRaisesRegex(engine.AgentlaneError, "fingerprint differs"):
            self.render(self.mapping, self.run)

    def test_source_drift_rejected_even_when_map_has_not_changed(self):
        self.init()
        self.event()
        self.event("check", "fixture-agent-two")
        engine.finalize_run(self.run)
        with (self.repo / "app.py").open("a") as handle:
            handle.write("# Changed after simulation\n")
        with self.assertRaisesRegex(engine.AgentlaneError, "source changed"):
            self.render(run=self.run)

    def test_source_changes_during_render_do_not_pair_old_evidence_with_new_code(self):
        original = engine.read_source
        changed = False
        def concurrent_change(repo, ref):
            nonlocal changed
            source = original(repo, ref)
            if not changed:
                with (self.repo / "app.py").open("a") as handle:
                    handle.write("# Concurrent editor change\n")
                changed = True
            return source
        with mock.patch.object(engine, "read_source", side_effect=concurrent_change), self.assertRaisesRegex(engine.AgentlaneError, "changed while rendering"):
            self.render()

    def test_partial_run_is_not_a_finished_report(self):
        self.init()
        self.event()
        with self.assertRaisesRegex(engine.AgentlaneError, "Finalize"):
            self.render(run=self.run)

    def test_unvisited_nodes_are_explicit(self):
        self.init()
        self.event()
        self.event("answer", "fixture-agent-two")
        data = engine.finalize_run(self.run)
        self.assertEqual(data["notVisitedNodes"], ["check"])

    def test_simulation_refuses_unknown_node_empty_agent_and_bad_status(self):
        self.init()
        with self.assertRaisesRegex(engine.AgentlaneError, "Unknown simulation"):
            engine.start_event(self.run, "invented", self.input)
        event = engine.start_event(self.run, "answer", self.input)
        with self.assertRaisesRegex(engine.AgentlaneError, "real host"):
            engine.finish_event(self.run, event["eventId"], self.result, " ")
        self.write(self.result, {"status": "passed", "output": "made up"})
        with self.assertRaisesRegex(engine.AgentlaneError, "status must"):
            engine.finish_event(self.run, event["eventId"], self.result, "fixture-agent-one")

    def test_clock_epoch_change_does_not_generate_false_latency(self):
        self.init()
        with mock.patch.object(engine, "clock_epoch", return_value="boot-one"):
            event = engine.start_event(self.run, "answer", self.input)
        with mock.patch.object(engine, "clock_epoch", return_value="boot-two"), self.assertRaisesRegex(engine.AgentlaneError, "clock epoch"):
            engine.finish_event(self.run, event["eventId"], self.result, "fixture-agent-one")

    def test_parallel_starts_do_not_lose_events(self):
        self.init()
        commands = [[sys.executable, str(ENGINE_PATH), "simulation", "start", "--run", str(self.run), "--node", "answer", "--input", str(self.input)] for _ in range(6)]
        processes = [subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True) for command in commands]
        for process in processes:
            stdout, stderr = process.communicate(timeout=20)
            self.assertEqual(process.returncode, 0, stderr)
            self.assertIn("eventId", json.loads(stdout))
        self.assertEqual(len(engine.read_json(self.run)["events"]), 6)

    def test_separate_cli_processes_measure_real_elapsed_time(self):
        self.init()
        before = time.perf_counter()
        start = subprocess.run([sys.executable, str(ENGINE_PATH), "simulation", "start", "--run", str(self.run), "--node", "answer", "--input", str(self.input)], capture_output=True, text=True, check=True, timeout=20)
        event_id = json.loads(start.stdout)["eventId"]
        time.sleep(0.15)
        finish = subprocess.run([sys.executable, str(ENGINE_PATH), "simulation", "finish", "--run", str(self.run), "--event", event_id, "--result", str(self.result), "--agent-id", "fixture-subprocess-agent"], capture_output=True, text=True, check=True, timeout=20)
        elapsed_ms = (time.perf_counter() - before) * 1000
        measured_ms = json.loads(finish.stdout)["durationMs"]
        self.assertGreaterEqual(measured_ms, 150, "A process-local clock loses time between CLI invocations")
        self.assertLessEqual(measured_ms, elapsed_ms + 25)

    def test_process_local_monotonic_api_is_not_used_for_recording(self):
        with mock.patch.object(engine.time, "monotonic_ns", side_effect=AssertionError("process-local API")):
            self.init()
            self.event()
        self.assertTrue(engine.read_json(self.run)["events"][0]["clockSource"])

    def test_legacy_timing_records_are_rejected_instead_of_silently_relabelled(self):
        self.init()
        self.event()
        data = engine.read_json(self.run)
        del data["events"][0]["clockSource"]
        self.write(self.run, data)
        with self.assertRaisesRegex(engine.AgentlaneError, "Legacy or unknown timing clock"):
            engine.start_event(self.run, "check", self.input)


if __name__ == "__main__":
    unittest.main()
