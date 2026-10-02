#!/usr/bin/env python3
"""
Product Analytics Skill — Auto-Discovery / Onboarding Script

Connects to PostHog, discovers your event schema, person properties,
actions, and dashboards, then generates a context file for the skill.

Usage:
    python3 onboard.py

Requires: POSTHOG_API_KEY, POSTHOG_PROJECT_ID, POSTHOG_HOST in .env or environment.
"""

import os
import json
import urllib.request
import ssl
from datetime import datetime
from pathlib import Path

# ── Load .env if python-dotenv available ──
try:
    from dotenv import load_dotenv
    # Walk up to find .env
    env_path = Path(__file__).resolve().parents[3] / ".env"
    if env_path.exists():
        load_dotenv(env_path)
except ImportError:
    pass

API_KEY = os.environ.get("POSTHOG_API_KEY", "")
PROJECT_ID = os.environ.get("POSTHOG_PROJECT_ID", "")
HOST = os.environ.get("POSTHOG_HOST", "https://us.posthog.com")

ctx = ssl.create_default_context()


def api_get(path, params=""):
    url = f"{HOST}/api/projects/{PROJECT_ID}/{path}?{params}" if params else f"{HOST}/api/projects/{PROJECT_ID}/{path}"
    req = urllib.request.Request(url)
    req.add_header("Authorization", f"Bearer {API_KEY}")
    with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
        return json.loads(resp.read().decode())


def hogql_query(sql):
    url = f"{HOST}/api/projects/{PROJECT_ID}/query/"
    payload = json.dumps({"query": {"kind": "HogQLQuery", "query": sql}}).encode()
    req = urllib.request.Request(url, data=payload, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", f"Bearer {API_KEY}")
    with urllib.request.urlopen(req, context=ctx, timeout=60) as resp:
        return json.loads(resp.read().decode())


def main():
    if not API_KEY or not PROJECT_ID:
        print("ERROR: Set POSTHOG_API_KEY and POSTHOG_PROJECT_ID in .env or environment.")
        return

    print(f"Connecting to PostHog at {HOST}, project {PROJECT_ID}...")

    # 1. Test connectivity
    try:
        test = hogql_query("SELECT count() FROM events WHERE timestamp >= now() - INTERVAL 1 DAY")
        daily_events = test.get("results", [[0]])[0][0]
        print(f"  Connected! {daily_events:,} events in last 24h.")
    except Exception as e:
        print(f"  ERROR: Could not connect — {e}")
        return

    # 2. Discover events
    print("Discovering events...")
    events_data = api_get("event_definitions", "limit=200&ordering=-last_seen_at")
    events = events_data.get("results", [])
    print(f"  Found {len(events)} event definitions.")

    # 3. Get event volumes (top 20)
    print("Fetching event volumes (7d)...")
    top_events_sql = """
        SELECT event, count() AS cnt
        FROM events
        WHERE timestamp >= now() - INTERVAL 7 DAY
        GROUP BY event ORDER BY cnt DESC LIMIT 20
    """
    volumes = hogql_query(top_events_sql)
    event_volumes = {r[0]: r[1] for r in volumes.get("results", [])}

    # 4. Discover person properties
    print("Discovering person properties...")
    props_data = api_get("property_definitions", "limit=200&type=person")
    person_props = props_data.get("results", [])
    print(f"  Found {len(person_props)} person properties.")

    # 5. Discover actions
    print("Discovering actions...")
    actions_data = api_get("actions", "limit=200")
    actions = actions_data.get("results", [])
    named_actions = [a for a in actions if a.get("name")]
    print(f"  Found {len(named_actions)} named actions.")

    # 6. Discover dashboards
    print("Discovering dashboards...")
    dashboards_data = api_get("dashboards")
    dashboards = dashboards_data.get("results", [])
    print(f"  Found {len(dashboards)} dashboards.")

    # 7. Sample event properties for top 5 events
    print("Sampling event properties for top events...")
    top_5 = list(event_volumes.keys())[:5]
    event_props = {}
    for ev in top_5:
        try:
            sql = f"SELECT DISTINCT JSONExtractKeys(properties) FROM events WHERE event = '{ev}' LIMIT 5"
            result = hogql_query(sql)
            keys = set()
            for row in result.get("results", []):
                if row and row[0]:
                    keys.update(row[0] if isinstance(row[0], list) else [])
            event_props[ev] = sorted(keys)[:15]
        except Exception:
            event_props[ev] = []

    # 8. Generate context file
    output_dir = Path(__file__).resolve().parent.parent / "references"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_file = output_dir / "my-context.md"

    lines = [
        "---",
        f"generated: {datetime.now().strftime('%Y-%m-%d')}",
        "source: auto-discovery",
        "---",
        "",
        "# My Product Analytics Context",
        "",
        "## Top Events (by 7d volume)",
        "",
        "| Event | 7d Count | Description |",
        "|-------|----------|-------------|",
    ]

    event_desc_map = {e["name"]: (e.get("description") or "—") for e in events}
    for ev, cnt in sorted(event_volumes.items(), key=lambda x: -x[1])[:20]:
        desc = event_desc_map.get(ev, "—")
        lines.append(f"| `{ev}` | {cnt:,} | {desc} |")

    lines += [
        "",
        "## Person Properties",
        "",
        "| Property | Type | Description |",
        "|----------|------|-------------|",
    ]
    for p in person_props[:30]:
        lines.append(f"| `{p['name']}` | {p.get('property_type', '—')} | {p.get('description') or '—'} |")

    lines += [
        "",
        "## Saved Actions",
        "",
        "| Action | ID | Description |",
        "|--------|-----|-------------|",
    ]
    for a in named_actions[:20]:
        lines.append(f"| {a['name']} | {a['id']} | {a.get('description') or '—'} |")

    lines += [
        "",
        "## Dashboards",
        "",
        "| Dashboard | ID | Tiles |",
        "|-----------|-----|-------|",
    ]
    for d in dashboards[:15]:
        lines.append(f"| {d.get('name', '—')} | {d['id']} | {len(d.get('tiles', []))} |")

    lines += [
        "",
        "## Key Event Properties",
        "",
    ]
    for ev, props in event_props.items():
        lines.append(f"### `{ev}`")
        lines.append(f"Properties: {', '.join(f'`{p}`' for p in props) if props else '(none sampled)'}")
        lines.append("")

    with open(output_file, "w") as f:
        f.write("\n".join(lines))

    print(f"\nContext saved to: {output_file}")
    print(f"\nSummary:")
    print(f"  - {len(event_volumes)} top events discovered")
    print(f"  - {len(person_props)} person properties")
    print(f"  - {len(named_actions)} named actions")
    print(f"  - {len(dashboards)} dashboards")
    print(f"\nReady! Try: /product-analytics funnel \"signup → activate → purchase\"")


if __name__ == "__main__":
    main()
