#!/usr/bin/env python3
"""Validate the distributable collection, respecting Git's ignore rules.

Checks source hygiene and catalogs, not external provider behavior or factual
correctness. Gitleaks is a separate required check before publication.
"""
from __future__ import annotations
import html
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import sys
import shutil
import tempfile
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
errors: list[str] = []

def fail(path, reason):
    errors.append(f"{path}: {reason}")

def files():
    output = subprocess.check_output(
        ['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd=ROOT)
    return sorted({Path(p.decode()) for p in output.split(b'\0') if p})

def target_exists(source, reference):
    parts = urlsplit(html.unescape(reference))
    if parts.scheme or parts.netloc or not parts.path:
        return
    target = (source.parent / unquote(parts.path)).resolve()
    if not target.is_relative_to(ROOT) or not target.exists():
        fail(source.relative_to(ROOT), f"missing/outside local target: {reference}")

selected = files()
company = re.compile('|'.join(['fy'+'nd', 'pixel'+'bin', 'shops'+'ense', 'opt'+'imus']), re.I)
personal_path = re.compile(r'/(?:Users|home)/(?:macbook|anandpareek)(?:/|\b)', re.I)
viewer = re.compile(r'__FRAME_PREAMBLE|claudeusercontent\.[^\s"<>]+\?(?:[^\s"<>]*&)?token=|eyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}')
secret = re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\s+[A-Za-z0-9+/=]{40,}|AKIA[A-Z0-9]{16}|gh[pousr]_[A-Za-z0-9]{30,}')
notebooks = 0
text_files = 0
for rel in selected:
    path = ROOT / rel
    if path.is_symlink():
        fail(rel, 'symlink should not be distributed')
        continue
    if not path.is_file():
        fail(rel, 'tracked file is missing')
        continue
    if path.stat().st_size >= 95 * 1024 * 1024:
        fail(rel, 'oversized GitHub asset')
    if path.name.startswith('.env') and path.name not in {'.env.example', '.env.sample', '.env.template'}:
        fail(rel, 'runtime environment file')
    if any(x in rel.parts for x in ('node_modules', '.next', '.local', '.cache', '__pycache__', '.venv')):
        fail(rel, 'runtime/cache content')
    try:
        text = path.read_text(encoding='utf-8')
    except (UnicodeDecodeError, OSError):
        continue
    text_files += 1
    if secret.search(text):
        fail(rel, 'credential pattern; inspect locally without exposing value')
    if personal_path.search(text):
        fail(rel, 'source-machine home path')
    if path.suffix == '.html' and viewer.search(text):
        fail(rel, 'embedded platform/authentication state')
    # The dedicated public provider skill is intentional; no company markers
    # belong in application source, lessons or training material.
    if rel.parts[0] in {'apps', 'learn', 'labs'} and company.search(html.unescape(text)):
        fail(rel, 'company/provider marker outside the dedicated API skill')
    if path.suffix == '.ipynb':
        notebooks += 1
        try:
            nb = json.loads(text)
            for i, cell in enumerate(nb['cells'], 1):
                if cell.get('outputs') or cell.get('execution_count') is not None:
                    fail(rel, f'cell {i} retains execution output')
        except (ValueError, KeyError):
            fail(rel, 'invalid notebook')

catalog = json.loads((ROOT / 'catalog.json').read_text())
slugs = set()
for entry in catalog['entries']:
    slug = entry['slug']
    if slug in slugs:
        fail('catalog.json', f'duplicate slug {slug}')
    slugs.add(slug)
    target_exists(ROOT / 'catalog.json', entry['path'])
    if entry.get('image'):
        target_exists(ROOT / 'catalog.json', entry['image'])
    target_exists(ROOT / 'catalog.json', entry['link'])
    folder = ROOT / entry['path']
    if not (folder / 'README.md').is_file():
        fail(entry['path'], 'missing README.md')
    if slug != 'ml-foundations' and not (folder / 'SOURCE.json').is_file():
        fail(entry['path'], 'missing provenance manifest')

# Entry point and collection documents only: each package owns its own links.
for path in [ROOT/'README.md', ROOT/'CONTRIBUTING.md', ROOT/'THIRD_PARTY_NOTICES.md', *sorted((ROOT/'docs').glob('*.md'))]:
    source = path.read_text()
    for ref in re.findall(r'\]\(([^)\s]+)(?:\s+"[^"]*")?\)', source):
        target_exists(path, ref.strip('<>'))
    for ref in re.findall(r'(?:src|href)=["\']([^"\']+)["\']', source):
        target_exists(path, ref)

spec = importlib.util.spec_from_file_location('learning_validation', ROOT/'learn/validate.py')
learning = importlib.util.module_from_spec(spec)
spec.loader.exec_module(learning)
landing_source = (ROOT / 'index.html').read_text()
landing = learning.PageParser()
landing.feed(landing_source)
for ref in landing.refs:
    target_exists(ROOT / 'index.html', ref)
embedded = re.search(r'const entries=(.*?);let kind=', landing_source, re.S)
if not embedded or json.loads(embedded.group(1)) != catalog['entries']:
    fail('index.html', 'embedded catalog differs from catalog.json')
node = shutil.which('node')
if node:
    for script in landing.scripts:
        with tempfile.NamedTemporaryFile(suffix='.js', mode='w') as temporary:
            temporary.write(script)
            temporary.flush()
            checked = subprocess.run([node, '--check', temporary.name], capture_output=True)
            if checked.returncode:
                fail('index.html', 'inline JavaScript syntax failure')
learning_result = learning.validate()
errors.extend(learning_result['errors'])
result = {
    'status': 'FAIL' if errors else 'PASS',
    'distributable_files': len(selected), 'text_files_scanned': text_files,
    'collection_entries': len(slugs), 'notebooks_with_cleared_outputs': notebooks,
    'learning': {k:v for k,v in learning_result.items() if k!='errors'},
    'errors': errors,
}
print(json.dumps(result, indent=2))
sys.exit(bool(errors))
