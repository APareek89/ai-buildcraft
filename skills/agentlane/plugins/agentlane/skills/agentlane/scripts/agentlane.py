#!/usr/bin/env python3
"""Agentlane's offline, stdlib-only source reader and simulation recorder.

Never imports target application modules, executes target code, or calls an API.
The coding agent supplies the semantic map and simulation results.
"""
from __future__ import annotations

import argparse
import ast
import contextlib
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
import uuid

VERSION = "1.0"
MAX_FILES = 2500
MAX_SCANNED = 20000
MAX_FILE_BYTES = 1_000_000
MAX_JSON_BYTES = 16_000_000
MAX_SOURCE_LINES = 600
MAX_SOURCE_BYTES = 3_000_000
MAX_NODES = 250
MAX_EDGES = 1500
MAX_REFS = 1000
IGNORED_DIRS = {".git", ".hg", ".svn", "node_modules", ".venv", "venv", "env", "__pycache__", ".next", ".nuxt", "dist", "build", "coverage", ".cache", ".pytest_cache", ".mypy_cache", ".local", ".agentlane", ".qa", ".aws", ".ssh", ".gnupg"}
TEXT_EXTENSIONS = {".py", ".pyi", ".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".json", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".md", ".mdx", ".txt", ".rst", ".html", ".css", ".scss", ".sql", ".graphql", ".gql", ".rs", ".go", ".java", ".kt", ".c", ".h", ".cpp", ".cs", ".rb", ".php", ".sh", ".bash", ".zsh", ".xml", ".vue", ".svelte", ".proto", ".prisma", ".ipynb", ".mmd"}
TEXT_NAMES = {"Dockerfile", "Makefile", "Justfile", "Procfile", "LICENSE", "README", ".gitignore", ".dockerignore"}
SECRET_NAME = re.compile(r"(^|[._-])(secrets?|mysecrets|credentials?|tokens?|passwords?|private[-_]?key)([._-]|$)", re.I)
TERMINAL = {"simulated", "blocked", "skipped"}


class AgentlaneError(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise AgentlaneError(message)


def utc_now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def read_json(path):
    path = Path(path)
    require(path.is_file(), f"JSON file not found: {path}")
    require(path.stat().st_size <= MAX_JSON_BYTES, f"JSON exceeds {MAX_JSON_BYTES} bytes")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise AgentlaneError(f"Invalid UTF-8 JSON: {path}: {exc}") from exc
    require(isinstance(value, dict), "Expected a JSON object")
    return value


def atomic_write(path, text):
    path = Path(path).absolute()
    path.parent.mkdir(parents=True, exist_ok=True)
    require(not path.is_symlink(), f"Refusing to overwrite symlink: {path}")
    fd, temporary = tempfile.mkstemp(prefix="." + path.name + ".", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def write_json(path, value):
    atomic_write(path, json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + "\n")


@contextlib.contextmanager
def run_lock(path):
    """A separate stable lock inode survives atomic replacement of the JSON file."""
    path = Path(str(Path(path).absolute()) + ".lock")
    path.parent.mkdir(parents=True, exist_ok=True)
    require(not path.is_symlink(), "Refusing a symlinked run lock")
    with path.open("a+b") as handle:
        if os.name == "nt":
            import msvcrt
            if handle.tell() == 0:
                handle.write(b"0")
                handle.flush()
            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_LOCK, 1)
            try:
                yield
            finally:
                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def safe_relative(value):
    require(isinstance(value, str) and value and len(value) < 1500, "Source paths must be nonempty relative strings")
    require("\\" not in value and "\x00" not in value, f"Use relative POSIX source paths: {value!r}")
    path = Path(value)
    require(not path.is_absolute() and not re.match(r"^[A-Za-z]:", value) and ".." not in path.parts, f"Path escapes repository: {value}")
    require(path.parts and all(p not in ("", ".") for p in path.parts), "Invalid source path")
    return path


def exclusion(path):
    for part in path.parts:
        if part in IGNORED_DIRS:
            return "generated, dependency, local state, or private directory"
        if part.startswith(".env") or SECRET_NAME.search(part) or part.lower().endswith((".pem", ".key", ".p12", ".pfx", ".keystore", ".sqlite", ".db")):
            return "potential credentials or private data"
    if path.suffix.lower() not in TEXT_EXTENSIONS and path.name not in TEXT_NAMES:
        return "unsupported or binary file type"
    return None


def git_ignored(repo, paths):
    if not paths:
        return set(), True
    try:
        result = subprocess.run(["git", "-C", str(repo), "check-ignore", "--no-index", "-z", "--stdin"], input="\0".join(paths) + "\0", text=True, capture_output=True, timeout=15)
    except (OSError, subprocess.TimeoutExpired):
        return set(), False
    if result.returncode in (0, 1):
        return set(filter(None, result.stdout.split("\0"))), True
    # No Git worktree is a legitimate input, but .gitignore must not be silently ignored.
    return set(), not any(repo.rglob(".gitignore")) if not (repo / ".git").exists() else False


def repository(path):
    root = Path(path).expanduser().resolve()
    require(root.is_dir(), f"Repository directory not found: {root}")
    return root


def inventory(repo):
    repo = repository(repo)
    candidates, skipped, scanned = [], [], 0
    truncated = False
    for base, dirs, files in os.walk(repo, followlinks=False):
        dirs.sort()
        files.sort()
        kept = []
        for name in dirs:
            item = Path(base) / name
            rel = item.relative_to(repo)
            reason = "symlink" if item.is_symlink() else next((exclusion(Path(p + "/x.py")) for p in rel.parts if exclusion(Path(p + "/x.py"))), None)
            if reason:
                if len(skipped) < MAX_FILES:
                    skipped.append({"path": rel.as_posix() + "/", "reason": reason})
            else:
                kept.append(name)
        dirs[:] = kept
        for name in files:
            scanned += 1
            if scanned > MAX_SCANNED:
                truncated = True
                break
            item = Path(base) / name
            rel = item.relative_to(repo).as_posix()
            reason = "symlink" if item.is_symlink() else exclusion(Path(rel))
            if not reason:
                try:
                    if item.stat().st_size > MAX_FILE_BYTES:
                        reason = "file size limit"
                except OSError:
                    reason = "unreadable file"
            if reason:
                if len(skipped) < MAX_FILES:
                    skipped.append({"path": rel, "reason": reason})
            else:
                candidates.append(rel)
        if truncated:
            break
    ignored, git_checked = git_ignored(repo, candidates)
    require(git_checked, "Could not verify .gitignore exclusions. Run inside a Git worktree with Git installed, or remove .gitignore only in an explicitly prepared public fixture.")
    files = []
    eligible = 0
    for rel in candidates:
        if rel in ignored:
            if len(skipped) < MAX_FILES:
                skipped.append({"path": rel, "reason": "gitignored"})
            continue
        eligible += 1
        if len(files) < MAX_FILES:
            files.append({"path": rel, "bytes": (repo / rel).stat().st_size})
    truncated = truncated or eligible > MAX_FILES
    return {"schemaVersion": VERSION, "generatedAt": utc_now(), "files": files, "skipped": skipped, "scannedFiles": min(scanned, MAX_SCANNED), "eligibleFilesWithinScan": eligible, "truncated": truncated, "limits": {"files": MAX_FILES, "scannedFiles": MAX_SCANNED, "fileBytes": MAX_FILE_BYTES}, "notes": ["Read-only source inventory, not proof of a complete behavioral map.", "Secrets, ignored files, dependencies, generated output and symlinks are excluded."] + (["Inventory is capped; omitted paths must remain explicit in mapping coverage."] if truncated else [])}


def fingerprint(mapping):
    return hashlib.sha256(json.dumps(mapping, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode()).hexdigest()


def validate_refs(refs):
    require(isinstance(refs, list), "sourceRefs must be a list")
    require(len(refs) <= 100, "Too many references on one item")
    for ref in refs:
        require(isinstance(ref, dict), "Source reference must be an object")
        safe_relative(ref.get("path"))
        a, b = ref.get("startLine"), ref.get("endLine")
        require(type(a) is int and type(b) is int and 1 <= a <= b and b - a + 1 <= MAX_SOURCE_LINES, f"Source ranges must contain 1–{MAX_SOURCE_LINES} lines")
        require(ref.get("kind") in {"code", "prompt", "schema"}, "Reference kind must be code, prompt, or schema")
        require(ref.get("extraction") in (None, "literal"), "Only literal extraction is supported")


def validate_map(mapping):
    require(mapping.get("schemaVersion") == VERSION, "Unsupported map schemaVersion")
    project = mapping.get("project", {})
    require(isinstance(project, dict) and isinstance(project.get("name"), str) and project["name"].strip(), "project.name is required")
    require(isinstance(project.get("objective"), str) and project["objective"].strip(), "project.objective is required")
    sets = {}
    for key, maximum in (("lanes", 20), ("nodes", MAX_NODES), ("edges", MAX_EDGES), ("flows", 30)):
        items = mapping.get(key)
        require(isinstance(items, list) and (key == "edges" or len(items) > 0) and len(items) <= maximum, f"Invalid or oversized {key}")
        ids = []
        for item in items:
            require(isinstance(item, dict), f"{key} entries must be objects")
            ident = item.get("id")
            require(isinstance(ident, str) and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}", ident), f"Invalid {key} id: {ident!r}")
            ids.append(ident)
        require(len(ids) == len(set(ids)), f"Duplicate {key} IDs")
        sets[key] = set(ids)
    refs_count = 0
    for node in mapping["nodes"]:
        require(node.get("lane") in sets["lanes"], f"Unknown lane for node {node['id']}")
        require(isinstance(node.get("label"), str) and node["label"].strip(), "Each node needs a label")
        validate_refs(node.get("sourceRefs", []))
        refs_count += len(node.get("sourceRefs", []))
        require(isinstance(node.get("inspect", []), list) and all(isinstance(item, str) for item in node.get("inspect", [])), "inspect must be a list of plain-English checks")
    for edge in mapping["edges"]:
        require(edge.get("source") in sets["nodes"] and edge.get("target") in sets["nodes"], f"Unknown endpoint for edge {edge['id']}")
        require(edge.get("kind") in {"declared", "inferred", "conditional", "feedback"}, "Invalid edge evidence kind")
        validate_refs(edge.get("sourceRefs", []))
        refs_count += len(edge.get("sourceRefs", []))
    require(refs_count <= MAX_REFS, "Map has too many source references")
    for flow in mapping["flows"]:
        stages = flow.get("stages", [])
        require(isinstance(stages, list) and 1 <= len(stages) <= 20 and all(isinstance(s, str) for s in stages), "Each flow needs 1–20 named stages")
        placements = flow.get("placements", [])
        require(isinstance(placements, list) and 1 <= len(placements) <= MAX_NODES, "Each flow needs node placements")
        placed, cells = set(), set()
        by_node = {n["id"]: n for n in mapping["nodes"]}
        for item in placements:
            require(isinstance(item, dict) and item.get("nodeId") in sets["nodes"], "Unknown flow placement node")
            require(type(item.get("column")) is int and 0 <= item["column"] < len(stages), "Placement column outside stage range")
            require(item["nodeId"] not in placed, "A flow can place each node once; use feedback edges for loops")
            cell = (by_node[item["nodeId"]]["lane"], item["column"])
            require(cell not in cells, "Two nodes occupy the same lane/stage cell; add a stage or separate flow")
            placed.add(item["nodeId"])
            cells.add(cell)
        edge_ids = flow.get("edgeIds", [])
        require(isinstance(edge_ids, list) and len(edge_ids) == len(set(edge_ids)) and all(e in sets["edges"] for e in edge_ids), "Invalid flow edgeIds")
        for edge in mapping["edges"]:
            if edge["id"] in edge_ids:
                require(edge["source"] in placed and edge["target"] in placed, "Flow edge endpoint missing from placements")
    hidden = mapping.get("hiddenResources", [])
    require(isinstance(hidden, list) and len(hidden) <= MAX_FILES, "Invalid hiddenResources")
    for path in hidden:
        safe_relative(path)
    require(isinstance(mapping.get("coverage", {}), dict) and isinstance(mapping.get("coverage", {}).get("notes", []), list), "coverage.notes must be a list")
    return mapping


def safe_source_path(repo, value):
    repo = repository(repo)
    rel = safe_relative(value)
    require(not exclusion(rel), f"Excluded source reference: {rel}")
    current = repo
    for part in rel.parts:
        current = current / part
        require(not current.is_symlink(), f"Symlinked source reference excluded: {rel}")
    full = (repo / rel).resolve()
    require(full.is_relative_to(repo) and full.is_file(), f"Source file not found inside repo: {rel}")
    require(full.stat().st_size <= MAX_FILE_BYTES, f"Source file exceeds size cap: {rel}")
    return full


def read_source(repo, ref):
    rel = safe_relative(ref["path"])
    full = safe_source_path(repo, ref["path"])
    try:
        content = full.read_text(encoding="utf-8")
    except UnicodeError as exc:
        raise AgentlaneError(f"Source is not UTF-8 text: {rel}") from exc
    require("\x00" not in content, f"Binary source excluded: {rel}")
    lines = content.splitlines(keepends=True)
    require(ref["endLine"] <= len(lines), f"Source reference exceeds file length: {rel}:{ref['endLine']}")
    original = "".join(lines[ref["startLine"] - 1:ref["endLine"]])
    text, note = original, "Exact referenced source lines; not executed."
    if ref.get("extraction") == "literal":
        note = "Dynamic or unsupported prompt expression: exact source shown; runtime values were not evaluated."
        if full.suffix == ".py":
            try:
                tree = ast.parse(content)
                candidates = []
                for node in ast.walk(tree):
                    if isinstance(node, (ast.Assign, ast.AnnAssign)) and node.lineno >= ref["startLine"] and node.end_lineno <= ref["endLine"]:
                        names = [target.id for target in getattr(node, "targets", []) if isinstance(target, ast.Name)]
                        if isinstance(getattr(node, "target", None), ast.Name):
                            names.append(node.target.id)
                        if ref.get("symbol") and ref["symbol"] not in names:
                            continue
                        value = ast.literal_eval(node.value)
                        if isinstance(value, str):
                            candidates.append(value)
                if len(candidates) == 1:
                    text = candidates[0]
                    note = "Static Python string literal extracted with AST; no target code executed. Runtime additions are not included."
            except (SyntaxError, ValueError, TypeError, RecursionError):
                pass
    text, redacted = redact_credentials(text)
    if redacted:
        note += " Potential credential literals were redacted; sha256 identifies the original source range."
    return {**ref, "text": text, "sha256": hashlib.sha256(original.encode()).hexdigest(), "extractionNote": note, "redacted": redacted}


def redact_credentials(text):
    patterns = [r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b", r"\b(?:ghp_|github_pat_|sk_live_|sk-proj-|sk-ant-)[A-Za-z0-9_-]{16,}", r"\bAIza[A-Za-z0-9_-]{30,}", r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"]
    output = text
    for pattern in patterns:
        output = re.sub(pattern, "[REDACTED CREDENTIAL]", output)
    # Literal credential assignment, not getenv/process.env references or prompt words.
    output = re.sub(r'''(?i)(\b(?:api[_-]?key|access[_-]?token|secret[_-]?key|client[_-]?secret|password)\s*[=:]\s*)(["'])([^"'\n]{8,})(\2)''', r'\1"[REDACTED CREDENTIAL]"', output)
    return output, output != text


def all_refs(mapping):
    yield from mapping["nodes"]
    yield from mapping["edges"]


def source_snapshot(repo, mapping):
    repo = repository(repo)
    paths = sorted({ref["path"] for obj in all_refs(mapping) for ref in obj.get("sourceRefs", [])})
    ignored, checked = git_ignored(repo, paths)
    require(checked and not ignored, "Cannot snapshot gitignored or unverifiable source references")
    snapshot = []
    for path in paths:
        full = safe_source_path(repo, path)
        snapshot.append({"path": path, "sha256": hashlib.sha256(full.read_bytes()).hexdigest()})
    return snapshot


def render(repo, map_path, out, run_path=None):
    repo = repository(repo)
    mapping = validate_map(read_json(map_path))
    digest = fingerprint(mapping)
    snapshot = source_snapshot(repo, mapping)
    inv = inventory(repo)
    ref_paths = list({ref["path"] for obj in all_refs(mapping) for ref in obj.get("sourceRefs", [])})
    ignored, checked = git_ignored(repo, ref_paths + mapping.get("hiddenResources", []))
    require(checked, "Could not verify source reference gitignore exclusions")
    require(not ignored, "Map references excluded gitignored paths: " + ", ".join(sorted(ignored)[:5]))
    allowed = {entry["path"] for entry in inv["files"]}
    for path in mapping.get("hiddenResources", []):
        require(path in allowed, f"Hidden resource not in safe bounded inventory: {path}")
    byte_count = 0
    for obj in all_refs(mapping):
        enriched = []
        for ref in obj.get("sourceRefs", []):
            enriched_ref = read_source(repo, ref)
            byte_count += len(enriched_ref["text"].encode())
            require(byte_count <= MAX_SOURCE_BYTES, "Source excerpt budget exceeded; narrow ranges or separate process reports")
            enriched.append(enriched_ref)
        obj["sourceRefs"] = enriched
    supporting_files, supporting_bytes = [], 0
    for rel in mapping.get("hiddenResources", []):
        full = safe_source_path(repo, rel)
        size = full.stat().st_size
        if size > 80_000 or supporting_bytes + size > 1_000_000:
            supporting_files.append({"path": rel, "text": None, "omissionNote": "Supporting-file excerpt budget reached; file contents were not embedded."})
            continue
        lines = full.read_text(encoding="utf-8").splitlines(keepends=True)
        if not lines:
            supporting_files.append({"path": rel, "text": "", "sha256": hashlib.sha256(b"").hexdigest(), "extractionNote": "Empty supporting file."})
            continue
        # Reuse the same path/symlink/secret checks as visible nodes.
        ref = {"path": rel, "startLine": 1, "endLine": min(len(lines), MAX_SOURCE_LINES), "kind": "code"}
        enriched = read_source(repo, ref)
        if len(lines) > MAX_SOURCE_LINES:
            enriched["omissionNote"] = f"Only the first {MAX_SOURCE_LINES} of {len(lines)} lines are embedded."
        supporting_files.append(enriched)
        supporting_bytes += len(enriched["text"].encode())
    mapping["supportingFiles"] = supporting_files
    require(snapshot == source_snapshot(repo, mapping), "Referenced source changed while rendering; retry from a stable source snapshot")
    inv["coverage"] = {"referencedFiles": len(ref_paths), "hiddenFiles": len(mapping.get("hiddenResources", [])), "embeddedSupportingFiles": sum(item.get("text") is not None for item in supporting_files), "unclassifiedFiles": len(allowed - set(ref_paths) - set(mapping.get("hiddenResources", []))), "note": "Counts measure source accounting, not semantic or runtime completeness."}
    run = read_json(run_path) if run_path else None
    if run:
        validate_run(run)
        require(run["mapFingerprint"] == digest, "Simulation map fingerprint differs: rebuild the run against this exact map")
        require(run["sourceFingerprint"] == fingerprint(snapshot), "Referenced source changed after simulation init; start a new simulation instead of pairing old evidence with new code")
        require(run["status"] == "finalized", "Finalize the simulation before rendering its report")
    template_path = Path(__file__).resolve().parent.parent / "assets" / "report.html"
    require(template_path.is_file(), f"Report template missing: {template_path}")
    template = template_path.read_text(encoding="utf-8")
    require(template.count("__AGENTLANE_DATA__") == 1, "Template must contain one __AGENTLANE_DATA__ placeholder")
    payload = json.dumps(redact_tree({"map": mapping, "inventory": inv, "run": run}), ensure_ascii=False, allow_nan=False).replace("<", "\\u003c").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
    atomic_write(out, template.replace("__AGENTLANE_DATA__", payload))
    return {"html": str(Path(out).absolute()), "nodes": len(mapping["nodes"]), "sourceBytes": byte_count, "mode": "simulation" if run else "source_map", "inventoryTruncated": inv["truncated"]}


def cross_process_clock():
    """Return a system-wide monotonic clock and its identity.

    Python <3.10 on Darwin subtracts a process-local origin in monotonic_ns().
    CLI start/finish occur in separate processes, so never use that API here.
    """
    if hasattr(time, "clock_gettime_ns") and hasattr(time, "CLOCK_MONOTONIC"):
        try:
            return time.clock_gettime_ns(time.CLOCK_MONOTONIC), "posix_CLOCK_MONOTONIC"
        except (OSError, ValueError) as exc:
            raise AgentlaneError(f"System-wide monotonic clock unavailable: {exc}") from exc
    if sys.platform == "win32":
        import ctypes
        ticks, frequency = ctypes.c_longlong(), ctypes.c_longlong()
        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        if not kernel.QueryPerformanceCounter(ctypes.byref(ticks)) or not kernel.QueryPerformanceFrequency(ctypes.byref(frequency)) or frequency.value <= 0:
            raise AgentlaneError("System-wide Windows performance counter unavailable")
        return ticks.value * 1_000_000_000 // frequency.value, "windows_QueryPerformanceCounter"
    raise AgentlaneError("This platform has no verified cross-process monotonic clock; simulation timing is unavailable")


def clock_epoch():
    linux = Path("/proc/sys/kernel/random/boot_id")
    if linux.is_file():
        return linux.read_text().strip()
    if sys.platform == "darwin":
        try:
            result = subprocess.run(["sysctl", "-n", "kern.boottime"], capture_output=True, text=True, timeout=3, check=True)
            return result.stdout.strip()
        except (OSError, subprocess.SubprocessError):
            pass
    now_ns, _ = cross_process_clock()
    return "epoch-" + str(int((time.time() - now_ns / 1_000_000_000) // 60))


def redact_tree(value):
    if isinstance(value, str):
        return redact_credentials(value)[0]
    if isinstance(value, list):
        return [redact_tree(item) for item in value]
    if isinstance(value, dict):
        return {key: redact_tree(item) for key, item in value.items()}
    return value


def validate_run(run):
    require(run.get("schemaVersion") == VERSION and run.get("mode") == "agent_simulation", "Not an Agentlane simulation run")
    require(isinstance(run.get("mapFingerprint"), str) and re.fullmatch(r"[a-f0-9]{64}", run["mapFingerprint"]), "Invalid map fingerprint")
    require(isinstance(run.get("sourceSnapshot"), list) and run.get("sourceFingerprint") == fingerprint(run["sourceSnapshot"]), "Invalid source snapshot fingerprint")
    require(run.get("status") in {"in_progress", "finalized"}, "Invalid run status")
    require(isinstance(run.get("nodeIds"), list) and run["nodeIds"] and len(run["nodeIds"]) == len(set(run["nodeIds"])), "Invalid simulation node IDs")
    require(isinstance(run.get("events"), list) and len(run["events"]) <= 2000, "Invalid simulation events")
    ids = set()
    for event in run["events"]:
        require(isinstance(event, dict) and isinstance(event.get("eventId"), str) and event["eventId"] not in ids, "Invalid or repeated event ID")
        ids.add(event["eventId"])
        require(event.get("nodeId") in run["nodeIds"], "Event refers to an unknown node")
        require(event.get("status") in TERMINAL | {"running"}, "Invalid event status")
        require(event.get("durationBasis") == "agent_wall_clock", "Simulation durations must be agent wall clock")
        require(event.get("clockSource") in {"posix_CLOCK_MONOTONIC", "windows_QueryPerformanceCounter"}, "Legacy or unknown timing clock; start a fresh simulation with the cross-process recorder")
        require("input" in event and isinstance(event.get("startedAt"), str), "Event requires an input and measured start")
        if event["status"] != "running":
            require(isinstance(event.get("agentId"), str) and event["agentId"].strip(), "A real host agent ID is required")
            require(isinstance(event.get("durationMs"), (int, float)) and event["durationMs"] >= 0 and event.get("measured") is True, "Event duration must be measured")
            require(isinstance(event.get("finishedAt"), str) and "output" in event, "Terminal event needs an output and end timestamp")
    if run["status"] == "finalized":
        require(all(e["status"] in TERMINAL for e in run["events"]), "Finalized run contains unfinished events")
        require(len({e["agentId"] for e in run["events"]}) >= 2, "Simulation requires at least two distinct host agents")
        expected = fingerprint({k: v for k, v in run.items() if k != "integrity"})
        require(run.get("integrity") == expected, "Finalized simulation was changed after recording; rerun instead of editing evidence")
    return run


def init_run(map_path, out, scenario_path, repo):
    mapping = validate_map(read_json(map_path))
    scenario = read_json(scenario_path)
    snapshot = source_snapshot(repo, mapping)
    run = {"schemaVersion": VERSION, "mode": "agent_simulation", "runId": str(uuid.uuid4()), "status": "in_progress", "mapFingerprint": fingerprint(mapping), "sourceSnapshot": snapshot, "sourceFingerprint": fingerprint(snapshot), "nodeIds": [n["id"] for n in mapping["nodes"]], "scenario": scenario, "startedAt": utc_now(), "finishedAt": None, "events": [], "durationBasis": "agent_wall_clock", "notice": "Coding-agent simulation. No application/model-provider API execution is recorded here. Measured duration is host-agent wall clock, including dispatch/wait; it is not model or application latency. Agent identities are supplied by the coding host, not independently attested by this offline recorder. Source binding covers referenced files; unmapped behavior remains outside coverage."}
    with run_lock(out):
        require(not Path(out).exists(), "Run already exists; use a new output filename")
        write_json(out, run)
    return {"run": str(Path(out).absolute()), "runId": run["runId"], "mapFingerprint": run["mapFingerprint"]}


def mutable_run(path):
    run = validate_run(read_json(path))
    require(run["status"] == "in_progress", "Finalized runs are immutable; start a new simulation")
    return run


def start_event(run_path, node_id, input_path):
    value = read_json(input_path)
    with run_lock(run_path):
        run = mutable_run(run_path)
        require(node_id in run["nodeIds"], f"Unknown simulation node: {node_id}")
        require(len(run["events"]) < 2000, "Simulation event limit reached")
        event_id = str(uuid.uuid4())
        started_ns, clock_source = cross_process_clock()
        event = {"eventId": event_id, "nodeId": node_id, "input": value, "output": None, "status": "running", "notes": "", "assumptions": [], "agentId": None, "startedAt": utc_now(), "finishedAt": None, "durationMs": None, "durationBasis": "agent_wall_clock", "measured": False, "evidence": [], "startedMonotonicNs": started_ns, "clockSource": clock_source, "clockEpoch": clock_epoch()}
        run["events"].append(event)
        write_json(run_path, run)
    return {"eventId": event_id, "nodeId": node_id, "startedAt": event["startedAt"]}


def finish_event(run_path, event_id, result_path, agent_id):
    result = read_json(result_path)
    require(result.get("status") in TERMINAL, "Result status must be simulated, blocked, or skipped")
    require("output" in result, "Result must include output (null is allowed for blocked/skipped)")
    require(isinstance(result.get("notes", ""), str), "Result notes must be text")
    require(isinstance(result.get("assumptions", []), list) and all(isinstance(x, str) for x in result.get("assumptions", [])), "Result assumptions must be a list of strings")
    require(isinstance(result.get("evidence", []), list), "Result evidence must be a list")
    require(isinstance(agent_id, str) and agent_id.strip() and len(agent_id) < 250, "Provide the real host agent ID")
    with run_lock(run_path):
        run = mutable_run(run_path)
        event = next((event for event in run["events"] if event["eventId"] == event_id), None)
        require(event is not None, "Unknown event ID")
        require(event["status"] == "running", "Event already finished; replay cannot overwrite measured evidence")
        require(event.get("clockEpoch") == clock_epoch(), "System clock epoch changed; start a new run for measured timing")
        finished_ns, clock_source = cross_process_clock()
        require(event["clockSource"] == clock_source, "Timing clock implementation changed; start a fresh simulation")
        elapsed = finished_ns - event["startedMonotonicNs"]
        require(elapsed >= 0, "Monotonic clock moved backward")
        event.update({"output": result["output"], "status": result["status"], "notes": result.get("notes", ""), "assumptions": result.get("assumptions", []), "evidence": result.get("evidence", []), "agentId": agent_id.strip(), "finishedAt": utc_now(), "durationMs": round(elapsed / 1_000_000, 3), "measured": True})
        write_json(run_path, run)
    return {"eventId": event_id, "status": event["status"], "durationMs": event["durationMs"], "durationBasis": "agent_wall_clock"}


def finalize_run(run_path):
    with run_lock(run_path):
        run = mutable_run(run_path)
        require(run["events"] and all(e["status"] in TERMINAL for e in run["events"]), "Finish all events before finalizing")
        agents = sorted({e["agentId"] for e in run["events"]})
        require(len(agents) >= 2, "Spawn at least two distinct host agents; a single-agent walkthrough is not a multi-agent simulation")
        visited = {e["nodeId"] for e in run["events"]}
        run.update({"status": "finalized", "finishedAt": utc_now(), "agentIds": agents, "coverage": {"visitedNodeIds": sorted(visited), "notVisitedNodeIds": sorted(set(run["nodeIds"]) - visited), "simulatedNodeIds": sorted({e["nodeId"] for e in run["events"] if e["status"] == "simulated"})}})
        run["integrity"] = fingerprint(run)
        validate_run(run)
        write_json(run_path, run)
    return {"run": str(Path(run_path).absolute()), "status": "finalized", "events": len(run["events"]), "agents": len(agents), "notVisitedNodes": run["coverage"]["notVisitedNodeIds"]}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    inv = commands.add_parser("inventory", help="Read-only bounded source file inventory")
    inv.add_argument("--repo", required=True)
    inv.add_argument("--out", required=True)
    rend = commands.add_parser("render", help="Render the source map or finalized simulation as standalone HTML")
    rend.add_argument("--repo", required=True)
    rend.add_argument("--map", required=True)
    rend.add_argument("--out", required=True)
    rend.add_argument("--run")
    val = commands.add_parser("validate", help="Validate a semantic map without loading source files")
    val.add_argument("--map", required=True)
    sim = commands.add_parser("simulation")
    operations = sim.add_subparsers(dest="operation", required=True)
    init = operations.add_parser("init")
    init.add_argument("--repo", required=True)
    init.add_argument("--map", required=True)
    init.add_argument("--out", required=True)
    init.add_argument("--scenario", required=True)
    start = operations.add_parser("start")
    start.add_argument("--run", required=True)
    start.add_argument("--node", required=True)
    start.add_argument("--input", required=True)
    finish = operations.add_parser("finish")
    finish.add_argument("--run", required=True)
    finish.add_argument("--event", required=True)
    finish.add_argument("--result", required=True)
    finish.add_argument("--agent-id", required=True)
    finalize = operations.add_parser("finalize")
    finalize.add_argument("--run", required=True)
    args = parser.parse_args(argv)
    try:
        if args.command == "inventory":
            data = inventory(args.repo)
            write_json(args.out, data)
            result = {"inventory": str(Path(args.out).absolute()), "files": len(data["files"]), "truncated": data["truncated"]}
        elif args.command == "render":
            result = render(args.repo, args.map, args.out, args.run)
        elif args.command == "validate":
            data = validate_map(read_json(args.map))
            result = {"valid": True, "nodes": len(data["nodes"]), "mapFingerprint": fingerprint(data)}
        elif args.operation == "init":
            result = init_run(args.map, args.out, args.scenario, args.repo)
        elif args.operation == "start":
            result = start_event(args.run, args.node, args.input)
        elif args.operation == "finish":
            result = finish_event(args.run, args.event, args.result, args.agent_id)
        else:
            result = finalize_run(args.run)
        print(json.dumps(result, ensure_ascii=False, allow_nan=False))
        return 0
    except (AgentlaneError, OSError, KeyError, TypeError, ValueError) as exc:
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
