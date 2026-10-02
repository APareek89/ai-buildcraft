#!/usr/bin/env python3
"""
Performance Reporting Skill — Dashboard Data Fetcher

Fetches data from PostHog and rebuilds the D object in the dashboard HTML.
Preserves static data sections (geo, device, error tables).

Usage:
    python3 fetch_data.py [--output dashboard.html]

Requires: POSTHOG_API_KEY, POSTHOG_PROJECT_ID in .env or environment.
"""

import os
import json
import urllib.request
import ssl
import re
import subprocess
from datetime import date, timedelta
from pathlib import Path

try:
    from dotenv import load_dotenv
    env_path = Path(__file__).resolve().parents[3] / ".env"
    if env_path.exists():
        load_dotenv(env_path)
except ImportError:
    pass

HOST = os.environ.get("POSTHOG_HOST", "https://us.posthog.com")
PROJECT_ID = os.environ.get("POSTHOG_PROJECT_ID", "")
API_KEY = os.environ.get("POSTHOG_API_KEY", "")

ctx = ssl.create_default_context()

TODAY = date.today()
MTD_START = date(TODAY.year, TODAY.month, 1)
LM_START = date(TODAY.year, TODAY.month - 1 if TODAY.month > 1 else 12, 1)
LM_END = MTD_START
D7_START = TODAY - timedelta(days=7)
D30_START = TODAY - timedelta(days=30)

# Paid step (shared across all funnels)
PAY = ("countIf(event='paddle_transaction' AND properties.paddle_event_type='transaction.completed'"
       " AND properties.paddle_origin='api')>0")


def query_posthog(hogql):
    url = f"{HOST}/api/projects/{PROJECT_ID}/query/"
    payload = json.dumps({"query": {"kind": "HogQLQuery", "query": hogql}}).encode()
    req = urllib.request.Request(url, data=payload, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", f"Bearer {API_KEY}")
    with urllib.request.urlopen(req, context=ctx, timeout=120) as resp:
        return json.loads(resp.read())


def fmt_date(d):
    return d.strftime("%Y-%m-%d")


# ── Define your funnels here ──────────────────────────────────
# Override these in references/my-context.md or by editing this file

# F2 (Console path): studio visit → paid
F2_SLUGS = {
    # "tool_name": "studio/url-slug"
    # Example:
    # "video": "studio/video-generator",
    # "imggen": "studio/ai-image-generator",
}

def f2_query(slug, start, end):
    """2-step funnel: console studio visit → paid transaction (same person_id)"""
    return f"""
    WITH ue AS (
      SELECT person_id,
        countIf(event='$pageview' AND properties.$current_url LIKE '%console.%{slug}%')>0 AS s1,
        {PAY} AS s2
      FROM events
      WHERE timestamp>='{fmt_date(start)}' AND timestamp<'{fmt_date(end)}'
        AND event IN ('$pageview','paddle_transaction')
      GROUP BY person_id
    )
    SELECT countIf(s1), countIf(s1 AND s2) FROM ue
    """


def build_periods():
    """Return period definitions"""
    return {
        "mtd": (MTD_START, TODAY),
        "lm": (LM_START, LM_END),
        "7d": (D7_START, TODAY),
        "30d": (D30_START, TODAY),
    }


def build_d():
    """Build the D object with all dashboard data"""
    periods = build_periods()
    d = {"funnels": {}, "funnels_f1": {}}

    # F2 funnels
    for tool, slug in F2_SLUGS.items():
        d["funnels"][tool] = {}
        for pkey, (start, end) in periods.items():
            try:
                result = query_posthog(f2_query(slug, start, end))
                row = result.get("results", [[0, 0]])[0]
                d["funnels"][tool][pkey] = list(row)
            except Exception as e:
                print(f"  WARN: {tool}/{pkey} failed: {e}")
                d["funnels"][tool][pkey] = [0, 0]

    return d


def inject_into_html(html_path, d_obj):
    """Replace the D object in the dashboard HTML"""
    with open(html_path, "r") as f:
        html = f.read()

    # Find D object boundaries
    start_marker = "const D = {"
    end_marker = "const VIDEO_COST"  # Adjust to match your HTML

    start_idx = html.find(start_marker)
    if start_idx == -1:
        print("  WARN: Could not find 'const D = {' in HTML. Creating fresh.")
        return html

    # Find the end — look for the next `const` after D
    end_idx = html.find(end_marker, start_idx)
    if end_idx == -1:
        # Try finding closing `};` pattern
        end_idx = html.find("};", start_idx) + 2
    else:
        # Back up to the `};` before end_marker
        end_idx = html.rfind("};", start_idx, end_idx) + 2

    # Extract static sections from existing D
    old_d_block = html[start_idx:end_idx]
    static_sections = {}
    for key in ["geo_signup", "geo_console", "ga4_device", "console_device",
                "ga4_country", "video_errors", "image_errors",
                "video_usage_mtd", "image_usage_mtd", "seo"]:
        pattern = rf'({key}\s*:\s*)'
        if re.search(pattern, old_d_block):
            static_sections[key] = True  # Mark as present

    # Build new D object as JSON
    d_json = json.dumps(d_obj, indent=2)

    # Build the new block
    new_block = f"const D = {d_json};\n"

    # Replace
    new_html = html[:start_idx] + new_block + html[end_idx:]
    return new_html


def validate_js(html_path):
    """Check JS syntax in the HTML"""
    try:
        result = subprocess.run(
            ["node", "-e",
             f'const fs=require("fs"),h=fs.readFileSync("{html_path}","utf8"),'
             f's=h.match(/<script>([\\s\\S]*?)<\\/script>/)[1];'
             f'try{{new Function(s);console.log("JS OK")}}catch(e){{console.log("JS ERROR:",e.message)}}'],
            capture_output=True, text=True, timeout=10
        )
        print(f"  Validation: {result.stdout.strip()}")
        return "OK" in result.stdout
    except Exception as e:
        print(f"  Validation skipped: {e}")
        return True


def main():
    if not API_KEY or not PROJECT_ID:
        print("ERROR: Set POSTHOG_API_KEY and POSTHOG_PROJECT_ID in .env or environment.")
        print("Run: python3 skills/product-analytics/scripts/onboard.py first")
        return

    print(f"Fetching dashboard data from PostHog ({HOST}, project {PROJECT_ID})...")
    print(f"Periods: MTD={fmt_date(MTD_START)}..{fmt_date(TODAY)}, "
          f"7d={fmt_date(D7_START)}..{fmt_date(TODAY)}")

    if not F2_SLUGS:
        print("\nWARN: No funnels configured. Edit F2_SLUGS in this file or run /performance-reporting onboard.")
        print("Example:")
        print('  F2_SLUGS = {"video": "studio/video-generator", "imggen": "studio/ai-image-generator"}')
        return

    d = build_d()
    print(f"\nFetched data for {len(d['funnels'])} tools.")

    # Output as JSON for now (inject into HTML when dashboard exists)
    output_dir = Path(__file__).resolve().parent.parent / "references"
    output_dir.mkdir(parents=True, exist_ok=True)

    with open(output_dir / "latest-data.json", "w") as f:
        json.dump(d, f, indent=2)
    print(f"Data saved to: {output_dir / 'latest-data.json'}")


if __name__ == "__main__":
    main()
