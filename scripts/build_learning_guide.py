#!/usr/bin/env python3
"""Build the single-file learning guide from reviewed source documents."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
from learning_bundle import build_payload

ROOT = Path(__file__).resolve().parents[1]

def json_script(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c').replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')

def build():
    catalog = json.loads((ROOT / 'learn/catalog.json').read_text())
    navigation = json.loads((ROOT / 'scripts/learning_paths.json').read_text())
    slugs = [slug for cat in navigation['categories'] for slug in cat['slugs']]
    expected = {item['slug'] for item in catalog['guides']}
    assert len(slugs) == len(set(slugs)) and set(slugs) == expected, 'Every lesson needs exactly one category'
    for route in navigation['routes']:
        assert set(route['slugs']) <= expected, f"Unknown lesson in {route['id']}"
    payload = build_payload()
    template = (ROOT / 'scripts/templates/learning-guide.html').read_text()
    substitutions = {'CATALOG':json_script(catalog), 'NAVIGATION':json_script(navigation), 'BUNDLE':json_script(payload), 'STYLE':(ROOT/'scripts/templates/learning-guide.css').read_text(), 'SCRIPT':(ROOT/'scripts/templates/learning-guide.js').read_text()}
    for name, value in substitutions.items():
        template = template.replace('{{'+name+'}}', value)
    assert '{{' not in template[:template.index('<script id="catalog"')], 'Unexpanded template'
    return template

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Fail if the checked-in guide needs rebuilding')
    args = parser.parse_args()
    source = build()
    target = ROOT/'learn/index.html'
    if args.check:
        if target.read_text() != source:
            raise SystemExit('Learning guide is stale. Run python3 scripts/build_learning_guide.py')
        print('Single-file learning guide matches its sources.')
    else:
        target.write_text(source)
        print(f'Built {target.relative_to(ROOT)} ({len(source.encode()) / 1024 / 1024:.2f} MiB)')
