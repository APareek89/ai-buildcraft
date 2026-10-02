#!/usr/bin/env python3
"""Validate the learning publication pack without executing lessons or training."""
from __future__ import annotations

import ast
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
SCOPES = (ROOT / "learn", ROOT / "labs" / "ml-foundations")
TEXT_SUFFIXES = {".html", ".md", ".py", ".json", ".ipynb", ".txt", ".js", ".css"}
FORBIDDEN = {
    "company-specific context": re.compile("|".join(["fy" + "nd", "pixel" + "bin", "shops" + "ense", "opt" + "imus"]), re.I),
    "machine-specific home path": re.compile("/" + r"(?:Users|home)/[A-Za-z0-9_.-]+/|~/(?:Documents|Downloads)/"),
    "credential-like token": re.compile(r"(?:sk-(?:proj-)?[A-Za-z0-9_-]{25,}|AIza[A-Za-z0-9_-]{30,}|gh[pousr]_[A-Za-z0-9]{25,}|AKIA[A-Z0-9]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)"),
    "opaque embedded document": re.compile(r"data:application/(?:pdf|zip|octet-stream);base64,", re.I),
}


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.refs = []
        self.scripts = []
        self.script = None
        self.has_title = False
        self.has_html = False

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        self.has_title |= tag == "title"
        self.has_html |= tag == "html"
        for name in ("href", "src", "poster"):
            if values.get(name):
                self.refs.append(values[name])
        if tag == "script" and not values.get("src") and values.get("type", "") not in {"application/json", "application/ld+json"}:
            self.script = []

    def handle_data(self, data):
        if self.script is not None:
            self.script.append(data)

    def handle_endtag(self, tag):
        if tag == "script" and self.script is not None:
            self.scripts.append("".join(self.script))
            self.script = None


def validate():
    errors = []
    pages = 0
    notebooks = 0
    scripts = 0
    references = 0
    node = shutil.which("node")
    catalog = json.loads((ROOT / "learn/catalog.json").read_text())
    slugs = set()
    for item in catalog["guides"]:
        if item["slug"] in slugs:
            errors.append(f"Duplicate catalog slug: {item['slug']}")
        slugs.add(item["slug"])
        for key in ("path", "notebook"):
            if key not in item:
                continue
            target = (ROOT / item[key]).resolve()
            if not target.is_relative_to(ROOT) or not target.is_file():
                errors.append(f"Invalid catalog {key}: {item[key]}")
    for scope in SCOPES:
        for path in sorted(scope.rglob("*")):
            if not path.is_file() or path.suffix not in TEXT_SUFFIXES:
                continue
            if any(part in {".venv", "__pycache__", ".ipynb_checkpoints", "_shared_data"} for part in path.parts):
                continue
            relative = path.relative_to(ROOT)
            source = path.read_text(encoding="utf-8")
            for name, pattern in FORBIDDEN.items():
                if pattern.search(html.unescape(source)):
                    errors.append(f"{relative}: {name}")
            if path.suffix == ".py":
                try:
                    ast.parse(source)
                except SyntaxError as exc:
                    errors.append(f"{relative}: Python syntax: {exc.msg}, line {exc.lineno}")
            if path.suffix == ".ipynb":
                notebooks += 1
                notebook = json.loads(source)
                for number, cell in enumerate(notebook["cells"], 1):
                    if cell.get("metadata"):
                        errors.append(f"{relative}: cell {number} retains metadata")
                    if cell["cell_type"] != "code":
                        continue
                    if cell.get("outputs") or cell.get("execution_count") is not None:
                        errors.append(f"{relative}: cell {number} retains execution output")
                    try:
                        ast.parse("".join(cell["source"]))
                    except SyntaxError as exc:
                        errors.append(f"{relative}: cell {number} Python syntax: {exc.msg}")
            if path.suffix != ".html":
                continue
            pages += 1
            parser = PageParser()
            parser.feed(source)
            if not parser.has_title or not parser.has_html:
                errors.append(f"{relative}: missing HTML document/title element")
            for reference in parser.refs:
                reference = html.unescape(reference)
                parts = urlsplit(reference)
                if parts.scheme or parts.netloc or reference.startswith("#") or not parts.path:
                    continue
                references += 1
                target = (path.parent / unquote(parts.path)).resolve()
                if not target.is_relative_to(ROOT) or not target.exists():
                    errors.append(f"{relative}: broken local reference: {reference}")
            if node:
                for number, script in enumerate(parser.scripts, 1):
                    if not script.strip():
                        continue
                    scripts += 1
                    with tempfile.NamedTemporaryFile(suffix=".js", mode="w", encoding="utf-8") as temp:
                        temp.write(script)
                        temp.flush()
                        result = subprocess.run([node, "--check", temp.name], capture_output=True, text=True)
                    if result.returncode:
                        detail = next((line.strip() for line in result.stderr.splitlines() if "SyntaxError" in line), "parse failed")
                        errors.append(f"{relative}: inline script {number}: {detail}")
    return {"status": "FAIL" if errors else "PASS", "catalog_entries": len(catalog["guides"]), "html_pages": pages, "notebooks": notebooks, "local_references": references, "inline_scripts_checked": scripts, "node_available": bool(node), "training_executed": False, "errors": errors}


if __name__ == "__main__":
    result = validate()
    print(json.dumps(result, indent=2))
    raise SystemExit(bool(result["errors"]))
