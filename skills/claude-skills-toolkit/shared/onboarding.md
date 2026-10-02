# Auto-Discovery & Onboarding Protocol

## Overview

Every skill includes an `onboard` command that automatically discovers the user's data schema, business context, and product structure. This ensures the skill works for ANY business, not just a specific one.

## How It Works

### Step 1: Validate API Keys
- Check that required environment variables are set in `.env`
- Test connectivity (make a lightweight API call)
- Report which keys are valid / missing / expired

### Step 2: Auto-Discover Schema
Each skill discovers relevant schema from the connected platform:

| Skill | Discovery Actions |
|-------|-------------------|
| **Product Analytics** | Fetch all event definitions, person properties, actions, and dashboards from PostHog |
| **Revenue** | Fetch all products, prices, and active subscriptions from Paddle |
| **SEO** | Fetch verified properties from GSC, run a sample query for top pages |
| **Performance Reporting** | Combine PostHog events + GA4 properties to build metric catalog |

### Step 3: Generate Context File
Save discovered schema to `{skill}/references/my-context.md` so the skill can reference it in future queries without re-fetching.

### Step 4: Confirm with User
Present a summary:
```
Discovered:
- 42 event types (top 5: $pageview, signup, purchase, ...)
- 15 person properties (plan, country, signup_date, ...)
- 8 products with 24 active prices
- 3 GSC properties

Ready to use! Try: /seo audit yourdomain.com
```

## Context File Format

```markdown
---
generated: 2026-03-26
source: auto-discovery
---

# My Business Context

## Products
- Product A (ID: xxx) — description
- Product B (ID: yyy) — description

## Key Events
| Event | Volume (7d) | Description |
|-------|-------------|-------------|
| $pageview | 120K | Page views |
| signup | 2.3K | User signups |

## Key Properties
| Property | Type | Sample Values |
|----------|------|---------------|
| plan | string | free, pro, enterprise |
| country | string | US, DE, BR, IN |
```

## Re-Running Onboarding

Users can re-run onboarding anytime:
- `/product-analytics onboard` — re-discover PostHog schema
- `/revenue onboard` — re-discover Paddle products
- `/seo onboard` — re-discover GSC properties

This updates the context file with the latest schema.
