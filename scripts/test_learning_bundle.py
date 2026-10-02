#!/usr/bin/env python3
"""Integrity tests for the downloadable learning book, without a web server."""
from __future__ import annotations

import base64
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import unittest
from urllib.parse import urlsplit

from learning_bundle import BundleError, CSP, LessonBundler, ROOT, build_payload, digest


class PageInventory(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.refs = []
        self.scripts = []
        self.script = None
        self.navigations = []
        self.downloads = []
        self.csp = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        for key in ("href", "src", "poster", "xlink:href"):
            if values.get(key):
                self.refs.append((tag, key, values[key]))
        if "data-buildcraft-slug" in values:
            self.navigations.append(values["data-buildcraft-slug"])
        if "data-buildcraft-notebook" in values:
            self.downloads.append(values["data-buildcraft-notebook"])
        if tag == "meta" and values.get("http-equiv", "").lower() == "content-security-policy":
            self.csp.append(values["content"])
        if tag == "script" and not values.get("src") and values.get("type", "") not in {"application/json", "application/ld+json"}:
            self.script = []

    def handle_data(self, data):
        if self.script is not None:
            self.script.append(data)

    def handle_endtag(self, tag):
        if tag == "script" and self.script is not None:
            self.scripts.append("".join(self.script))
            self.script = None


class LearningBundleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.payload = build_payload()
        cls.catalog = json.loads((ROOT / "learn/catalog.json").read_text())
        cls.by_slug = {item["slug"]: item for item in cls.payload["lessons"]}

    def test_exact_curated_set_and_determinism(self):
        self.assertEqual([item["slug"] for item in self.payload["lessons"]], [item["slug"] for item in self.catalog["guides"]])
        self.assertEqual(self.payload["stats"]["lessons"], 50)
        self.assertEqual(self.payload["stats"]["notebooks"], 26)
        self.assertEqual(self.payload, build_payload())

    def test_sources_and_downloads_preserve_exact_bytes(self):
        for item in self.payload["lessons"]:
            self.assertEqual(item["sha256"], digest((ROOT / item["sourcePath"]).read_bytes()), item["slug"])
            self.assertEqual(item["bundledSha256"], digest(item["html"].encode()), item["slug"])
            if notebook := item.get("notebook"):
                decoded = base64.b64decode(notebook["data"], validate=True)
                self.assertEqual(decoded, (ROOT / notebook["sourcePath"]).read_bytes())
                self.assertEqual(notebook["sha256"], digest(decoded))
                self.assertEqual(notebook["filename"], item["slug"] + ".ipynb")

    def test_no_unbundled_page_dependencies(self):
        self.assertEqual(self.payload["externalDependencies"], [])
        pages = self.payload["lessons"] + list(self.payload["supporting"].values())
        notebook_slugs = {item["slug"] for item in self.payload["lessons"] if "notebook" in item}
        valid_destinations = set(self.by_slug) | {"", "glossary"}
        for page in pages:
            parser = PageInventory()
            parser.feed(page["html"])
            self.assertEqual(parser.csp, [CSP], page["slug"])
            self.assertTrue(set(parser.navigations) <= valid_destinations)
            self.assertTrue(set(parser.downloads) <= notebook_slugs)
            for tag, attr, ref in parser.refs:
                if ref.startswith(("#", "data:")):
                    continue
                if re.fullmatch(r"__BUILDCRAFT_RUNTIME_(mathjax|highlight)__", ref):
                    self.assertEqual((tag, attr), ("script", "src"))
                    continue
                self.assertEqual((tag, attr), ("a", "href"), (page["slug"], ref))
                self.assertIn(urlsplit(ref).scheme, {"http", "https", "mailto"}, (page["slug"], ref))

    def test_figures_and_runtime_checksums(self):
        self.assertEqual(len(self.payload["assetManifest"]), 26)
        for path, metadata in self.payload["assetManifest"].items():
            data = (ROOT / path).read_bytes()
            self.assertEqual(metadata["sha256"], digest(data))
            self.assertEqual(metadata["mimeType"], "image/png")
        for item in self.payload["runtimeAssets"].values():
            decoded = base64.b64decode(item["data"], validate=True)
            self.assertEqual(item["sha256"], digest(decoded))
            self.assertEqual(decoded, (ROOT / "scripts/vendor" / item["filename"]).read_bytes())

    def test_license_notices_and_privacy_are_in_download(self):
        notices = "\n".join(item["text"] for item in self.payload["notices"])
        self.assertIn("Apache License", notices)
        self.assertIn("Ivan Sagalaev", notices)
        self.assertIn("Anand Pareek", notices)
        self.assertIn("MLX LM", notices)
        text = json.dumps(self.payload)
        self.assertNotIn(str(ROOT), text)
        private_markers = re.compile("|".join(["fy" + "nd", "pixel" + "bin", "shops" + "ense", "opt" + "imus"]), re.I)
        self.assertIsNone(private_markers.search(notices))
        # Base64 image/runtime bytes can coincidentally spell any short marker;
        # inspect actual text, not the serialization of binary encodings.
        for item in self.payload["lessons"] + list(self.payload["supporting"].values()):
            semantic_html = re.sub(r"data:[^;\s\"']+;base64,[A-Za-z0-9+/=]+", "[embedded asset]", item["html"])
            self.assertIsNone(private_markers.search(semantic_html), item["slug"])
            if notebook := item.get("notebook"):
                self.assertIsNone(private_markers.search(base64.b64decode(notebook["data"]).decode()))
        for item in self.payload["runtimeAssets"].values():
            self.assertIsNone(private_markers.search(base64.b64decode(item["data"]).decode()))
        sensitive = re.compile(
            r"/(?:Users|home)/[A-Za-z0-9_.-]+/|~/(?:Documents|Downloads)/"
            r"|sk-(?:proj-)?[A-Za-z0-9_-]{25,}|AIza[A-Za-z0-9_-]{30,}"
            r"|gh[pousr]_[A-Za-z0-9]{25,}|AKIA[A-Z0-9]{16}"
            r"|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"
        )
        fields = [notices]
        for item in self.payload["lessons"] + list(self.payload["supporting"].values()):
            fields.append(re.sub(r"data:[^;\s\"']+;base64,[A-Za-z0-9+/=]+", "[embedded asset]", item["html"]))
            if notebook := item.get("notebook"):
                fields.append(base64.b64decode(notebook["data"]).decode())
        fields.extend(base64.b64decode(item["data"]).decode() for item in self.payload["runtimeAssets"].values())
        for field in fields:
            self.assertIsNone(sensitive.search(field))

    def test_math_delimiters_and_no_false_offline_grading(self):
        lesson = self.by_slug["01-linear-01-linear-regression"]["html"]
        self.assertIn('"inlineMath":[["\\\\(","\\\\)"]]', lesson)
        self.assertIn('"fontCache":"local"', lesson)
        self.assertIn("connect-src &#x27;none&#x27;", lesson)
        for item in self.payload["lessons"]:
            self.assertIn("Automatic grading is unavailable", item["html"])
        workbook = self.by_slug["agentic-systems-blueprint"]["html"]
        self.assertNotIn("window.confirm(", workbook)
        self.assertIn("await window.buildcraftConfirm(", workbook)

    def test_all_bundled_javascript_parses(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("Node.js is unavailable")
        scripts = {}
        for page in self.payload["lessons"] + list(self.payload["supporting"].values()):
            parser = PageInventory()
            parser.feed(page["html"])
            for script in parser.scripts:
                scripts[digest(script.encode())] = (page["slug"], script)
        with tempfile.TemporaryDirectory() as directory:
            for key, (slug, script) in scripts.items():
                path = Path(directory) / (key + ".js")
                path.write_text(script)
                result = subprocess.run([node, "--check", str(path)], capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, slug + ": " + result.stderr)

    def test_cloud_navigation_with_unavailable_storage(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("Node.js is unavailable")
        parser = PageInventory()
        parser.feed((ROOT / "learn/guides/cloud-for-ai-apps.html").read_text())
        source = next(script for script in parser.scripts if 'cloudai.tab.v2' in script)
        # Exercise the real navigation script against a tiny DOM, including a
        # throwing storage property (opaque iframe) and throwing storage methods
        # (privacy/quota settings). Storage must never block tabs or keyboard use.
        harness = r"""
const assert=require('node:assert/strict'), vm=require('node:vm');
function element() {
  const classes=new Set();
  return {dataset:{label:'A section'},children:[],events:{},classList:{
    toggle(name,on){if(on)classes.add(name);else classes.delete(name)},
    contains(name){return classes.has(name)}
  },appendChild(child){this.children.push(child)},addEventListener(name,fn){this.events[name]=fn}};
}
for (const mode of ['property','methods','write-only']) {
  const sections=[element(),element(),element()], bar=element(), previous=element(), next=element(), events={};
  const context={document:{
    querySelectorAll(){return sections},
    getElementById(id){return ({tabbar:bar,prevBtn:previous,nextBtn:next})[id]},
    createElement(){return element()}, addEventListener(name,fn){events[name]=fn}
  },window:{scrollTo(){}}};
  function denied(){throw new Error('SecurityError: storage is unavailable')}
  if(mode==='property')Object.defineProperty(context,'localStorage',{get:denied});
  else context.localStorage={getItem:mode==='methods'?denied:()=> '1',setItem:denied};
  vm.runInNewContext(SOURCE,context);
  function active(){return sections.findIndex(section=>section.classList.contains('active'))}
  assert.equal(active(),mode==='write-only'?1:0);
  next.events.click();assert.equal(active(),mode==='write-only'?2:1);
  bar.children[2].events.click();assert.equal(active(),2);
  previous.events.click();assert.equal(active(),1);
  events.keydown({target:{closest(){return false}},key:'ArrowLeft'});assert.equal(active(),0);
}
""".replace("SOURCE", json.dumps(source))
        result = subprocess.run([node, "-e", harness], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_unknown_external_assets_and_path_escape_fail_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "scripts/vendor").mkdir(parents=True)
            (root / "scripts/vendor/highlight-11.9.0-github-dark.min.css").write_text("")
            page = root / "lesson.html"
            bundler = LessonBundler(root, {"guides": []})
            for content in [
                '<html><head><script src="https://example.com/new.js"></script></head></html>',
                '<html><head></head><body><img src="../outside.png"></body></html>',
                '<html><head><style>body{background:url(https://example.com/track.png)}</style></head></html>',
            ]:
                page.write_text(content)
                with self.assertRaises(BundleError):
                    bundler.page(page)


if __name__ == "__main__":
    unittest.main(verbosity=2)
