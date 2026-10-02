#!/usr/bin/env python3
"""Build deterministic, offline lesson data for the single-file learning reader.

No network request is made during a build. Browser libraries are pinned in
scripts/vendor, with their source URLs, hashes and licenses. The viewer replaces
__BUILDCRAFT_RUNTIME_<id>__ in lesson HTML with the corresponding data: URL before
assigning iframe.srcdoc. Keep the iframe sandboxed without allow-same-origin.
"""
from __future__ import annotations

import base64
import hashlib
import html
from html.parser import HTMLParser
import json
import mimetypes
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
VENDOR = ROOT / "scripts/vendor"
RUNTIME_FILES = {
    "mathjax": ("mathjax-3.2.2-tex-svg-full.min.js", "Apache-2.0"),
    "highlight": ("highlight-11.9.0.min.js", "BSD-3-Clause"),
}
REMOTE_SCRIPTS = {
    "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js": "mathjax",
    "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js": "highlight",
}
HIGHLIGHT_CSS_URL = "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css"
FONT_HOSTS = {"fonts.googleapis.com", "fonts.gstatic.com"}
MATHJAX_CONFIG = "window.MathJax=" + json.dumps({
    "tex": {"inlineMath": [[r"\(", r"\)"]], "displayMath": [[r"\[", r"\]"]], "processEscapes": True},
    "svg": {"fontCache": "local"},
    "options": {"enableMenu": False},
}, separators=(",", ":")) + ";"

# Opaque-origin frames cannot call a host API or read the host's storage. All
# required scripts, figures and SVG math glyphs are already in the download.
CSP = "; ".join([
    "default-src 'none'", "script-src 'unsafe-inline' data:",
    "style-src 'unsafe-inline' data:", "img-src data: blob:",
    "font-src data:", "media-src data: blob:", "connect-src 'none'",
    "frame-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'",
])

BRIDGE_SCRIPT = r"""
(function () {
  'use strict';
  // Native confirm() is blocked in an opaque iframe. An HTML dialog keeps the
  // workbook's explicit merge choice available without relaxing the sandbox.
  window.buildcraftConfirm=function (message) {
    return new Promise(function (resolve) {
      var dialog=document.createElement('dialog');
      dialog.style.cssText='max-width:480px;padding:24px;border:1px solid #cbd5e1;border-radius:14px;background:white;color:#0f172a;font:16px/1.6 system-ui';
      var text=document.createElement('p'); text.textContent=message; dialog.appendChild(text);
      var cancel=document.createElement('button'); cancel.textContent='Cancel';
      var accept=document.createElement('button'); accept.textContent='Merge workbook';
      [cancel,accept].forEach(function(button){button.type='button';button.style.cssText='padding:10px 16px;margin:4px;border:1px solid #94a3b8;border-radius:7px;background:#f8fafc;color:#0f172a;font:inherit';dialog.appendChild(button);});
      function finish(answer){dialog.close();dialog.remove();resolve(answer);}
      cancel.onclick=function(){finish(false);}; accept.onclick=function(){finish(true);};
      dialog.addEventListener('cancel',function(event){event.preventDefault();finish(false);});
      document.body.appendChild(dialog);dialog.showModal();cancel.focus();
    });
  };
  function send(type, slug, fragment) {
    if (window.parent !== window) window.parent.postMessage({type:type,slug:slug,fragment:fragment||''}, '*');
  }
  window.addEventListener('message', function (event) {
    if (event.source !== window.parent || !event.data || event.data.type !== 'buildcraft:fragment') return;
    if (typeof event.data.fragment !== 'string') return;
    var target=document.getElementById(event.data.fragment);
    if (target) target.scrollIntoView({behavior:'smooth',block:'start'});
  });
  document.addEventListener('click', function (event) {
    var target=event.target;
    if (!target || !target.closest) return;
    var link=target.closest('[data-buildcraft-slug],[data-buildcraft-notebook]');
    if (link) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (link.hasAttribute('data-buildcraft-notebook')) send('buildcraft:download-notebook',link.getAttribute('data-buildcraft-notebook'));
      else send('buildcraft:navigate',link.getAttribute('data-buildcraft-slug'),link.getAttribute('data-buildcraft-fragment'));
      return;
    }
    // Fragment-only links in srcdoc would otherwise resolve against the host URL.
    var anchor=target.closest('a[href^="#"]');
    if (anchor && anchor.getAttribute('href').length>1) {
      var id; try { id=decodeURIComponent(anchor.getAttribute('href').slice(1)); } catch (_) { return; }
      var destination=document.getElementById(id);
      if (destination) { event.preventDefault(); destination.scrollIntoView({behavior:'smooth',block:'start'}); }
    }
    // These exported exercises originally used a hosted grading service. A
    // selection in the offline book is practice, never a "correct" score.
    var practice=target.closest('.kc-opt,.kc-submit,.kc-check,.kc-check-free');
    if (practice) {
      event.preventDefault(); event.stopImmediatePropagation();
      var item=practice.closest('.kc-item'); if (!item) return;
      item.querySelectorAll('.kc-opt').forEach(function (option) {
        option.classList.remove('correct','wrong','buildcraft-selected');
        option.setAttribute('aria-pressed','false');
      });
      practice.classList.add('buildcraft-selected'); practice.setAttribute('aria-pressed','true');
      var feedback=item.querySelector('.kc-feedback');
      if (!feedback) { feedback=document.createElement('p'); item.appendChild(feedback); }
      feedback.hidden=false; feedback.className='kc-feedback buildcraft-practice';
      feedback.textContent='Practice answer selected. Automatic grading is unavailable in this offline guide; compare your reasoning with the lesson.';
    }
  }, true);
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.handson-btn').forEach(function (button) { button.remove(); });
  });
})();
"""
BRIDGE_STYLE = ".handson-btn{display:none!important}.buildcraft-selected{outline:2px solid #64748b!important}.buildcraft-practice{background:#f1f5f9!important;color:#334155!important;border-color:#cbd5e1!important}"


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _replace_attr(tag: str, name: str, value: str) -> str:
    pattern = re.compile(r"(\s" + re.escape(name) + r"\s*=\s*)(?:\"[^\"]*\"|'[^']*'|[^\s>]+)", re.I)
    replacement = lambda match: match.group(1) + '"' + html.escape(value, quote=True) + '"'
    if pattern.search(tag):
        return pattern.sub(replacement, tag, count=1)
    ending = "/>" if tag.endswith("/>") else ">"
    return tag[:-len(ending)] + " " + name + '="' + html.escape(value, quote=True) + '"' + ending


class BundleError(ValueError):
    """A source reference cannot be made safely self-contained."""


class LessonBundler:
    def __init__(self, root: Path, catalog: dict):
        self.root = root.resolve()
        self.pages = {(self.root / guide["path"]).resolve(): guide["slug"] for guide in catalog["guides"]}
        self.pages[(self.root / "labs/ml-foundations/GLOSSARY.html").resolve()] = "glossary"
        self.home_pages = {(self.root / path).resolve() for path in ("index.html", "learn/index.html", "labs/ml-foundations/index.html")}
        self.notebooks = {(self.root / guide["notebook"]).resolve(): guide["slug"] for guide in catalog["guides"] if guide.get("notebook")}
        self.embedded_assets: dict[str, dict] = {}
        self.replaced_dependencies: set[str] = set()
        self.removed_fonts: set[str] = set()
        self.vendor_css = (self.root / "scripts/vendor/highlight-11.9.0-github-dark.min.css").read_text()

    def resolve(self, page: Path, reference: str) -> Path:
        path = (page.parent / unquote(urlsplit(reference).path)).resolve()
        if not path.is_relative_to(self.root):
            raise BundleError(f"Reference escapes collection: {page.relative_to(self.root)}: {reference}")
        if not path.is_file():
            raise BundleError(f"Missing local asset: {page.relative_to(self.root)}: {reference}")
        return path

    def data_url(self, path: Path) -> str:
        data = path.read_bytes()
        mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        if path.suffix in {".js", ".mjs"}:
            mime = "text/javascript"
        self.embedded_assets[str(path.relative_to(self.root))] = {"bytes": len(data), "sha256": digest(data), "mimeType": mime}
        return "data:" + mime + ";base64," + base64.b64encode(data).decode("ascii")

    def css(self, source: str, page: Path) -> str:
        if re.search(r"@import\b", source, re.I):
            raise BundleError(f"CSS imports require explicit bundling: {page.relative_to(self.root)}")

        def replace(match):
            reference = match.group(1).strip().strip("'\"")
            if reference.startswith(("#", "data:")):
                return match.group(0)
            parts = urlsplit(reference)
            if parts.scheme or parts.netloc:
                raise BundleError(f"External CSS asset: {page.relative_to(self.root)}: {reference}")
            return 'url("' + self.data_url(self.resolve(page, reference)) + '")'

        return re.sub(r"url\(\s*([^)]*?)\s*\)", replace, source, flags=re.I)

    def page(self, path: Path) -> str:
        path = path.resolve()
        parser = _PageBundler(self, path)
        parser.feed(path.read_text(encoding="utf-8"))
        parser.close()
        if not parser.injected:
            raise BundleError(f"Page has no head: {path.relative_to(self.root)}")
        return "".join(parser.output)


class _PageBundler(HTMLParser):
    def __init__(self, bundler: LessonBundler, path: Path):
        super().__init__(convert_charrefs=False)
        self.bundler = bundler
        self.path = path
        self.output: list[str] = []
        self.mode = None
        self.injected = False

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        raw = self.get_starttag_text()
        if tag == "base":
            return
        if tag == "meta" and values.get("http-equiv", "").lower() in {"content-security-policy", "refresh"}:
            return
        if tag == "link":
            ref = values.get("href", "")
            parts = urlsplit(ref)
            if parts.hostname in FONT_HOSTS:
                self.bundler.removed_fonts.add(ref)
                return
            if ref == HIGHLIGHT_CSS_URL:
                self.bundler.replaced_dependencies.add(ref)
                self.output.append("<style>" + self.bundler.vendor_css + "</style>")
                return
            if values.get("rel") == "stylesheet" and not parts.scheme and not parts.netloc:
                css_path = self.bundler.resolve(self.path, ref)
                self.output.append("<style>" + self.bundler.css(css_path.read_text(), css_path) + "</style>")
                return
        if values.get("srcset"):
            raise BundleError(f"srcset needs explicit bundling: {self.path.relative_to(self.bundler.root)}")
        if tag in {"iframe", "object", "embed"}:
            raise BundleError(f"Embedded document needs explicit bundling: {self.path.relative_to(self.bundler.root)}")
        for attr in ("href", "src", "poster", "xlink:href"):
            ref = values.get(attr)
            if not ref or ref.startswith(("#", "data:")):
                continue
            parts = urlsplit(ref)
            if tag == "script" and attr == "src" and ref in REMOTE_SCRIPTS:
                self.bundler.replaced_dependencies.add(ref)
                raw = _replace_attr(raw, attr, "__BUILDCRAFT_RUNTIME_" + REMOTE_SCRIPTS[ref] + "__")
                continue
            if parts.scheme or parts.netloc:
                if tag == "a" and attr == "href" and parts.scheme in {"https", "http", "mailto"}:
                    raw = _replace_attr(raw, "target", "_blank")
                    raw = _replace_attr(raw, "rel", "noopener noreferrer")
                    continue
                raise BundleError(f"Unexpected external dependency: {self.path.relative_to(self.bundler.root)}: {ref}")
            target = self.bundler.resolve(self.path, ref)
            if tag == "a" and target in self.bundler.home_pages | self.bundler.pages.keys():
                raw = _replace_attr(raw, attr, "#")
                raw = _replace_attr(raw, "data-buildcraft-slug", self.bundler.pages.get(target, ""))
                if parts.fragment:
                    raw = _replace_attr(raw, "data-buildcraft-fragment", unquote(parts.fragment))
            elif tag == "a" and target in self.bundler.notebooks:
                raw = _replace_attr(raw, attr, "#")
                raw = _replace_attr(raw, "data-buildcraft-notebook", self.bundler.notebooks[target])
            else:
                if target.suffix == ".html":
                    raise BundleError(f"HTML link is outside selected catalog: {target.relative_to(self.bundler.root)}")
                raw = _replace_attr(raw, attr, self.bundler.data_url(target))
        if values.get("style"):
            raw = _replace_attr(raw, "style", self.bundler.css(values["style"], self.path))
        self.output.append(raw)
        if tag == "head":
            self.injected = True
            self.output.extend([
                '<meta http-equiv="Content-Security-Policy" content="' + html.escape(CSP, quote=True) + '">',
                "<style>" + BRIDGE_STYLE + "</style>",
                "<script>" + BRIDGE_SCRIPT + "</script>",
            ])
        if tag in {"style", "script"}:
            self.mode = tag

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag):
        if tag == self.mode:
            self.mode = None
        self.output.append("</" + tag + ">")

    def handle_data(self, data):
        if self.mode == "style":
            data = self.bundler.css(data, self.path)
        elif self.mode == "script" and data.strip().startswith("window.MathJax="):
            # Original exports used JS strings with swallowed delimiter escapes;
            # preserve the intended \(...\) and \[...\] delimiters explicitly.
            data = MATHJAX_CONFIG
        elif self.mode == "script" and self.path.name == "agentic-systems-blueprint.html":
            data = data.replace("!window.confirm(", "!await window.buildcraftConfirm(")
        self.output.append(data)

    def handle_entityref(self, name):
        self.output.append("&" + name + ";")

    def handle_charref(self, name):
        self.output.append("&#" + name + ";")

    def handle_comment(self, data):
        self.output.append("<!--" + data + "-->")

    def handle_decl(self, data):
        self.output.append("<!" + data + ">")


def _runtime_assets(root: Path) -> dict:
    vendor = root / "scripts/vendor"
    manifest = {item["filename"]: item for item in json.loads((vendor / "manifest.json").read_text())}
    # Verify the complete pinned vendor set, including license and CSS bytes.
    for filename, metadata in manifest.items():
        if digest((vendor / filename).read_bytes()) != metadata["sha256"]:
            raise BundleError(f"Vendored asset checksum mismatch: {filename}")
    result = {}
    for key, (filename, license_id) in RUNTIME_FILES.items():
        data = (vendor / filename).read_bytes()
        result[key] = {
            "filename": filename, "mimeType": "text/javascript", "data": base64.b64encode(data).decode("ascii"),
            "sha256": digest(data), "bytes": len(data), "license": license_id, "sourceUrl": manifest[filename]["url"],
        }
    return result


def build_payload(root: Path = ROOT) -> dict:
    """Return all lesson, notebook, runtime and license bytes without network I/O."""
    root = root.resolve()
    catalog = json.loads((root / "learn/catalog.json").read_text())
    bundler = LessonBundler(root, catalog)
    lessons = []
    for guide in catalog["guides"]:
        source = root / guide["path"]
        item = {
            "slug": guide["slug"], "sourcePath": guide["path"], "sha256": digest(source.read_bytes()),
            "html": bundler.page(source),
        }
        item["bundledSha256"] = digest(item["html"].encode())
        if guide.get("notebook"):
            notebook = root / guide["notebook"]
            data = notebook.read_bytes()
            item["notebook"] = {
                "filename": guide["slug"] + ".ipynb", "data": base64.b64encode(data).decode("ascii"),
                "mimeType": "application/x-ipynb+json", "sha256": digest(data), "bytes": len(data),
                "sourcePath": guide["notebook"],
            }
        lessons.append(item)
    glossary = root / "labs/ml-foundations/GLOSSARY.html"
    supporting = {"glossary": {"slug": "glossary", "title": "ML glossary", "sourcePath": "labs/ml-foundations/GLOSSARY.html", "sha256": digest(glossary.read_bytes()), "html": bundler.page(glossary)}}
    runtime = _runtime_assets(root)
    notice_paths = [
        ("Collection license", "LICENSE"),
        ("Learning attribution", "learn/ATTRIBUTION.md"),
        ("Post-Training Lab license", "learn/licenses/Post-Training-Lab-LICENSE.txt"),
        ("Post-Training Lab notice", "learn/licenses/Post-Training-Lab-NOTICE.txt"),
        ("MathJax 3.2.2 — Apache-2.0", "scripts/vendor/MATHJAX-LICENSE.txt"),
        ("highlight.js 11.9.0 — BSD-3-Clause", "scripts/vendor/HIGHLIGHT-LICENSE.txt"),
    ]
    return {
        "schemaVersion": 1,
        "lessons": lessons,
        "supporting": supporting,
        "runtimeAssets": runtime,
        "notices": [{"title": title, "sourcePath": path, "text": (root / path).read_text()} for title, path in notice_paths],
        "stats": {
            "lessons": len(lessons), "notebooks": sum("notebook" in item for item in lessons),
            "supportingPages": len(supporting), "embeddedAssets": len(bundler.embedded_assets),
            "embeddedAssetBytes": sum(item["bytes"] for item in bundler.embedded_assets.values()),
            "sourceHtmlBytes": sum((root / item["path"]).stat().st_size for item in catalog["guides"]),
            "runtimeBytes": sum(item["bytes"] for item in runtime.values()),
        },
        "assetManifest": dict(sorted(bundler.embedded_assets.items())),
        "externalDependencies": [],
        "offlineChanges": {
            "vendoredLibraries": sorted(bundler.replaced_dependencies),
            "removedFontRequests": sorted(bundler.removed_fonts),
            "notes": [
                "All lesson content, figures, math rendering, syntax highlighting and notebook downloads are embedded.",
                "Remote fonts are replaced by each lesson's system-font fallbacks.",
                "Source links open online. Python notebooks require their documented Python packages; some optional datasets and pretrained models require internet access.",
                "Hosted grading and generated hands-on sessions are unavailable. Local visual experiments remain interactive.",
                "Sandboxed lesson storage is unavailable; use the reader's completion markers to track progress.",
            ],
        },
    }


if __name__ == "__main__":
    print(json.dumps(build_payload()["stats"], indent=2))
