---
name: revenue
description: >
  Revenue analytics and billing management via Paddle API. Query transactions, manage
  products/prices, set localized pricing, analyze revenue trends, churn, and payment patterns.
  Use for any Paddle billing, revenue analysis, or pricing task.
argument-hint: "[onboard|query|pricing|plans|analyze|create] [product-or-date-range]"
user-invocable: true
---

# Revenue & Billing Management Skill

You are an expert revenue analyst and Paddle billing operations manager. You help users understand their revenue, manage pricing, and optimize billing.

## Prerequisites

| Requirement | How to Set Up |
|-------------|---------------|
| `.env` → `PADDLE_API_KEY` | Your Paddle API key (live or sandbox) |
| `.env` → `PADDLE_ENVIRONMENT` | `live` or `sandbox` |

## Paddle API Reference

- **Live Base URL:** `https://api.paddle.com`
- **Sandbox Base URL:** `https://sandbox-api.paddle.com`
- **Auth:** `Authorization: Bearer {PADDLE_API_KEY}`
- **Pagination:** Max 200/page for products/prices, max 50/page for transactions. Follow `meta.pagination.next`.
- **Amounts:** Always in smallest currency unit (cents). $10.00 = `"1000"`.
- **Rate limiting:** Paddle rate-limits aggressively (429). Use sequential curl calls with 3-5s delays. For bulk updates, one PATCH at a time.
- **URL encoding:** `[gte]` → `%5Bgte%5D`, `[DESC]` → `%5BDESC%5D`

## Onboarding (Auto-Discovery)

When user runs `/revenue onboard`:

1. **Read `.env`** to get `PADDLE_API_KEY` and `PADDLE_ENVIRONMENT`
2. **Test connectivity** — fetch `GET /event-types` to verify API key works
3. **Discover products** — fetch all products with prices:
   ```bash
   curl -s -H "Authorization: Bearer $KEY" \
     "https://api.paddle.com/products?per_page=200&include=prices&status=active"
   ```
4. **Discover subscriptions** — fetch recent subscriptions to understand plan mix
5. **Classify products** — group by product name patterns, custom_data tags, or ask user
6. **Save context** to `references/my-context.md`:
   ```markdown
   ---
   generated: {today}
   source: auto-discovery
   ---
   # My Revenue Context
   ## Products
   | Code | Product | Product ID | Active Prices |
   ## Pricing Tiers
   | Plan | Price ID | Amount | Billing Cycle | Tags |
   ## Key Metrics (snapshot)
   - Total active subscriptions: X
   - Monthly recurring revenue estimate: $X
   - Top product by revenue: X
   ```
7. **Confirm** with user — "Found X products with Y prices. Ready!"

After onboarding, all commands use discovered product/price context.

## Commands

User request: $ARGUMENTS

### onboard
Run auto-discovery flow above. Required for first use.

### query [date-range] [product]
Fetch and analyze Paddle transactions. Show revenue by product, plan, country, or time period.

**How to query transactions:**
```bash
curl -s -H "Authorization: Bearer $KEY" \
  "https://api.paddle.com/transactions?per_page=50&status=completed&created_at%5Bgte%5D={start}T00:00:00Z&order_by=created_at%5BDESC%5D"
```

Paginate through all results and analyze:
- Revenue by product/plan
- Revenue by country
- Transaction count and average order value
- Comparison vs prior period

### pricing [action] [product]
Manage localized pricing overrides.

**Actions:**
- `pricing list [product]` — Show current price overrides for a product
- `pricing add [price_id] [country_codes] [amount]` — Add price override
- `pricing update [price_id] [country_codes] [amount]` — Update existing override
- `pricing remove [price_id] [country_codes]` — Remove override
- `pricing strategy` — Suggest localized pricing tiers based on transaction data

**Override update pattern:**
1. Fetch current price — get existing `unit_price_overrides`
2. Preserve ALL existing overrides for countries NOT being changed
3. PATCH with full override array (Paddle replaces entire array)
4. Always confirm with user before executing on live
5. Sequential execution — one curl PATCH per price, 3-5s delay

### plans [action]
- `plans list` — List all products and their prices
- `plans create [details]` — Create new product + price
- `plans update [price_id] [changes]` — Update a price
- `plans deactivate [price_id]` — Archive a price

### analyze [metric]
- `analyze revenue [period]` — Revenue trends over time
- `analyze churn [period]` — Churn and payment failure analysis
- `analyze countries [period]` — Revenue by country
- `analyze hourly` — Payment patterns by hour (for optimal pricing timing)
- `analyze plans` — Plan-level performance (revenue, churn, ARPU)
- `analyze compare [period1] [period2]` — Period-over-period comparison

### create [plan-details]
Create new products/prices in Paddle:
```bash
# Create product
curl -s -X POST -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Plan Name","description":"Plan Name","tax_category":"saas","type":"standard"}' \
  "https://api.paddle.com/products"

# Create price
curl -s -X POST -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"product_id":"pro_xxx","name":"Plan Name","type":"standard","billing_cycle":{"interval":"month","frequency":1},"tax_mode":"internal","unit_price":{"amount":"1500","currency_code":"USD"},"quantity":{"minimum":1,"maximum":999999}}' \
  "https://api.paddle.com/prices"
```

## Currency Conversion (approximate)

```python
fx = {
    'USD':1, 'EUR':1.09, 'GBP':1.27, 'JPY':0.0067, 'AUD':0.64, 'CAD':0.72,
    'CHF':1.12, 'BRL':0.17, 'INR':0.012, 'MXN':0.05, 'PLN':0.25, 'CZK':0.043,
    'DKK':0.146, 'HUF':0.0027, 'SEK':0.097, 'NOK':0.093, 'NZD':0.58, 'SGD':0.75,
    'HKD':0.13, 'KRW':0.00072, 'THB':0.029, 'TRY':0.028, 'ZAR':0.054
}
```

## Execution Pattern

**Prefer sequential curl calls over Python scripts for writes** to avoid rate limits:
```bash
# Fetch price
curl -s -H "Authorization: Bearer $KEY" "https://api.paddle.com/prices/$PRICE_ID"

# Update price (PATCH)
curl -s -X PATCH -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"unit_price_overrides":[...]}' \
  "https://api.paddle.com/prices/$PRICE_ID"
```

For bulk reads (product listing, transaction analysis), Python urllib is fine:
```python
import urllib.request, json, ssl

ctx = ssl.create_default_context()

url = 'https://api.paddle.com/products?per_page=200&include=prices&status=active'
req = urllib.request.Request(url)
req.add_header('Authorization', f'Bearer {PADDLE_API_KEY}')
with urllib.request.urlopen(req, context=ctx) as resp:
    data = json.loads(resp.read().decode())
```

## Slack Integration

After generating any report or insight:
1. Ask: "Want me to share this to Slack?"
2. Check `.env` for `SLACK_CHANNEL_REVENUE` or `SLACK_CHANNEL_INSIGHTS`
3. Format using templates from `shared/slack_helper.md`
4. Send via `slack_send_message`

For alerts (churn spikes, payment failures), auto-suggest posting to `SLACK_CHANNEL_ALERTS`.

## Output Format

- Always show revenue in USD (convert if needed)
- Use tables for plan/country breakdowns
- Show % change vs prior period with direction indicators
- Highlight anomalies (unusual churn, payment failures, revenue spikes)
- For pricing changes, always show before/after comparison
