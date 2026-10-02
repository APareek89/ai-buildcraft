#!/usr/bin/env python3
"""
Revenue Skill — Auto-Discovery / Onboarding Script

Connects to Paddle, discovers your products, prices, and subscription mix,
then generates a context file for the skill.

Usage:
    python3 onboard.py

Requires: PADDLE_API_KEY, PADDLE_ENVIRONMENT in .env or environment.
"""

import os
import json
import urllib.request
import ssl
from datetime import datetime
from pathlib import Path

try:
    from dotenv import load_dotenv
    env_path = Path(__file__).resolve().parents[3] / ".env"
    if env_path.exists():
        load_dotenv(env_path)
except ImportError:
    pass

API_KEY = os.environ.get("PADDLE_API_KEY", "")
ENV = os.environ.get("PADDLE_ENVIRONMENT", "live")
BASE_URL = "https://sandbox-api.paddle.com" if ENV == "sandbox" else "https://api.paddle.com"

ctx = ssl.create_default_context()


def api_get(path):
    url = f"{BASE_URL}/{path}"
    req = urllib.request.Request(url)
    req.add_header("Authorization", f"Bearer {API_KEY}")
    with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
        return json.loads(resp.read().decode())


def paginate(path, per_page=200):
    all_items = []
    url = f"{BASE_URL}/{path}?per_page={per_page}"
    while url:
        req = urllib.request.Request(url)
        req.add_header("Authorization", f"Bearer {API_KEY}")
        with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
            data = json.loads(resp.read().decode())
        all_items.extend(data.get("data", []))
        url = data.get("meta", {}).get("pagination", {}).get("next")
    return all_items


def main():
    if not API_KEY:
        print("ERROR: Set PADDLE_API_KEY in .env or environment.")
        return

    print(f"Connecting to Paddle ({ENV}) at {BASE_URL}...")

    # 1. Test connectivity
    try:
        test = api_get("event-types")
        print(f"  Connected! {len(test.get('data', []))} event types available.")
    except Exception as e:
        print(f"  ERROR: Could not connect — {e}")
        return

    # 2. Discover products with prices
    print("Discovering products...")
    products = paginate("products?include=prices&status=active")
    print(f"  Found {len(products)} active products.")

    # 3. Count prices
    all_prices = []
    for p in products:
        for price in p.get("prices", []):
            price["_product_name"] = p.get("name", "—")
            price["_product_id"] = p.get("id", "—")
            all_prices.append(price)
    print(f"  Found {len(all_prices)} prices across all products.")

    # 4. Discover recent subscriptions (last 30 days snapshot)
    print("Fetching recent subscriptions...")
    try:
        subs = paginate("subscriptions?per_page=50&status=active")
        active_subs = len(subs)
        print(f"  Found {active_subs} active subscriptions (sample).")
    except Exception:
        subs = []
        active_subs = "unknown"

    # 5. Fetch recent transactions for revenue estimate
    print("Fetching recent transactions (last 7d)...")
    try:
        from datetime import timedelta
        txns = paginate("transactions?per_page=50&status=completed")
        total_revenue = sum(
            int(t.get("details", {}).get("totals", {}).get("total", "0"))
            for t in txns[:100]
        )
        print(f"  Sample revenue from {len(txns[:100])} txns: ${total_revenue / 100:,.2f}")
    except Exception:
        txns = []
        total_revenue = 0

    # 6. Identify product categories (from tags/custom_data)
    categories = {}
    for price in all_prices:
        tags = price.get("custom_data", {}).get("tags", "untagged")
        cat = categories.setdefault(tags, {"count": 0, "products": set()})
        cat["count"] += 1
        cat["products"].add(price["_product_name"])

    # 7. Generate context file
    output_dir = Path(__file__).resolve().parent.parent / "references"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_file = output_dir / "my-context.md"

    lines = [
        "---",
        f"generated: {datetime.now().strftime('%Y-%m-%d')}",
        "source: auto-discovery",
        "---",
        "",
        "# My Revenue Context",
        "",
        f"**Environment:** {ENV}",
        f"**Base URL:** {BASE_URL}",
        "",
        "## Products",
        "",
        "| Product | Product ID | Active Prices | Type |",
        "|---------|-----------|---------------|------|",
    ]
    for p in products:
        price_count = len([pr for pr in p.get("prices", []) if pr.get("status") == "active"])
        lines.append(f"| {p.get('name', '—')} | `{p['id']}` | {price_count} | {p.get('type', '—')} |")

    lines += [
        "",
        "## Pricing Tiers",
        "",
        "| Plan | Price ID | Amount (USD) | Billing | Tags |",
        "|------|----------|-------------|---------|------|",
    ]
    for pr in sorted(all_prices, key=lambda x: x.get("_product_name", "")):
        amt = int(pr.get("unit_price", {}).get("amount", "0")) / 100
        cycle = pr.get("billing_cycle", {})
        billing = f"{cycle['interval']}/{cycle['frequency']}" if cycle else "one-time"
        tags = pr.get("custom_data", {}).get("tags", "—")
        lines.append(f"| {pr.get('name', pr['_product_name'])} | `{pr['id']}` | ${amt:.2f} | {billing} | {tags} |")

    lines += [
        "",
        "## Product Categories (by tags)",
        "",
        "| Tag | # Prices | Products |",
        "|-----|----------|----------|",
    ]
    for tag, info in sorted(categories.items()):
        prods = ", ".join(sorted(info["products"])[:3])
        lines.append(f"| {tag} | {info['count']} | {prods} |")

    lines += [
        "",
        "## Key Metrics (snapshot)",
        "",
        f"- Active subscriptions: {active_subs}",
        f"- Recent transaction sample revenue: ${total_revenue / 100:,.2f}",
        f"- Total products: {len(products)}",
        f"- Total active prices: {len(all_prices)}",
    ]

    with open(output_file, "w") as f:
        f.write("\n".join(lines))

    print(f"\nContext saved to: {output_file}")
    print(f"\nSummary:")
    print(f"  - {len(products)} products")
    print(f"  - {len(all_prices)} prices")
    print(f"  - {len(categories)} product categories")
    print(f"\nReady! Try: /revenue query last-7d")


if __name__ == "__main__":
    main()
