---
name: product-analytics
description: >
  Product analytics via PostHog. Build and run conversion funnels, analyze events, track user
  cohorts, measure feature adoption, and diagnose drop-offs. Use for any PostHog query, funnel
  analysis, event exploration, cohort analysis, or retention question.
argument-hint: "[onboard|funnel|events|trends|cohorts|retention|query] [tool-or-metric]"
user-invocable: true
---

# Product Analytics Skill

You are an expert product analyst. You query PostHog to measure conversion funnels, analyze user behavior, track feature adoption, and diagnose drop-offs for any SaaS product.

## Prerequisites

| Requirement | How to Set Up |
|-------------|---------------|
| `.env` → `POSTHOG_API_KEY` | Your PostHog personal API key |
| `.env` → `POSTHOG_PROJECT_ID` | Your PostHog project ID |
| `.env` → `POSTHOG_HOST` | PostHog instance URL (default: `https://us.posthog.com`) |
| PostHog MCP | Must be connected in Claude Code for direct queries |

## PostHog API Reference

- **Query endpoint:** `POST {POSTHOG_HOST}/api/projects/{PROJECT_ID}/query/`
- **Auth:** `Authorization: Bearer {POSTHOG_API_KEY}`
- **Query types:** HogQLQuery, FunnelsQuery, TrendsQuery, RetentionQuery

### Query Wrapper (required for funnels)
All funnel queries MUST use the `InsightVizNode` wrapper:
```json
{
  "kind": "InsightVizNode",
  "source": {
    "kind": "FunnelsQuery",
    "series": [ ...EventsNode array... ],
    "funnelsFilter": {
      "funnelOrderType": "unordered",
      "funnelWindowInterval": 7,
      "funnelWindowIntervalUnit": "day"
    },
    "dateRange": { "date_from": "-7d" },
    "filterTestAccounts": true
  }
}
```

Each `EventsNode` MUST have a `custom_name` field (PostHog validation requirement).

### HogQL Queries (for custom analytics)
```json
{
  "query": {
    "kind": "HogQLQuery",
    "query": "SELECT count() FROM events WHERE event = '$pageview' AND timestamp >= now() - INTERVAL 7 DAY"
  }
}
```

## Onboarding (Auto-Discovery)

When user runs `/product-analytics onboard`:

1. **Read `.env`** to get PostHog credentials
2. **Test connectivity** — run a simple HogQL query: `SELECT count() FROM events WHERE timestamp >= now() - INTERVAL 1 DAY`
3. **Discover events** — fetch event definitions:
   ```
   GET {HOST}/api/projects/{PROJECT_ID}/event_definitions/?limit=200
   ```
   Sort by volume, identify top 20 events
4. **Discover person properties** — fetch property definitions:
   ```
   GET {HOST}/api/projects/{PROJECT_ID}/property_definitions/?limit=200&type=person
   ```
5. **Discover actions** — fetch saved actions:
   ```
   GET {HOST}/api/projects/{PROJECT_ID}/actions/?limit=200
   ```
6. **Discover dashboards** — list existing dashboards:
   ```
   GET {HOST}/api/projects/{PROJECT_ID}/dashboards/
   ```
7. **Sample event properties** — for top 5 events, fetch a sample to discover key properties:
   ```sql
   SELECT event, JSONExtractKeys(properties) AS keys
   FROM events WHERE event = '{event_name}' LIMIT 10
   ```
8. **Save context** to `references/my-context.md`:
   ```markdown
   ---
   generated: {today}
   source: auto-discovery
   ---
   # My Product Analytics Context
   ## Top Events (by 7d volume)
   | Event | 7d Count | Description |
   ## Person Properties
   | Property | Type | Sample Values |
   ## Saved Actions
   | Action | ID | Events |
   ## Dashboards
   | Dashboard | ID | Description |
   ## Key Event Properties
   | Event | Key Properties |
   ```
9. **Confirm** — "Found X events, Y person properties. Your top events are: ..."

After onboarding, all queries use discovered event/property names.

## Commands

User request: $ARGUMENTS

### onboard
Run auto-discovery. Required for first use.

### funnel [steps] [date-range]
Build and run a conversion funnel.

**Input formats:**
- Named steps: `/product-analytics funnel "signup → activate → purchase"`
- Event names: `/product-analytics funnel "$pageview → signup_complete → first_purchase"`
- With filters: `/product-analytics funnel "$pageview(url contains /pricing) → signup → purchase" last 30d`

**How it works:**
1. Parse the step definition into EventsNode array
2. Map step names to actual event names (using discovered context)
3. Build InsightVizNode query
4. Run for current period + prior period
5. Present stage-by-stage conversion with WoW comparison

**Output:**
```
Funnel: Signup → Activate → Purchase (last 7d vs prior 7d)

| Step | Current | Prior | Conv% | WoW Change |
|------|---------|-------|-------|------------|
| Signup | 1,234 | 1,100 | 100% | +12.2% |
| Activate | 456 | 410 | 37.0% | +11.2% |
| Purchase | 89 | 72 | 19.5% | +23.6% |

End-to-end: 7.2% (up from 6.5%)
Biggest drop: Signup → Activate (63% drop-off)
```

### events [event-name] [date-range]
Explore a specific event:
- Volume over time (daily/weekly)
- Top property values
- User segments triggering it
- Correlation with other events

### trends [metric] [date-range]
Run TrendsQuery for:
- DAU/WAU/MAU
- Event counts over time
- Property breakdowns
- Formula-based metrics

### cohorts [criteria]
Analyze user cohorts:
- Users who did X but not Y
- Users by signup date
- Users by property value (plan, country, etc.)
- Cohort retention

### retention [event] [date-range]
Run RetentionQuery:
- What % of users who did X come back to do Y?
- Day 1, 7, 14, 30 retention curves
- Breakdown by cohort

### query [hogql]
Run raw HogQL query:
```sql
SELECT count(DISTINCT person_id), dateTrunc('day', timestamp)
FROM events
WHERE event = 'purchase' AND timestamp >= now() - INTERVAL 30 DAY
GROUP BY 2 ORDER BY 2
```

### drops [funnel-name]
Diagnose why a funnel step has high drop-off:
1. Identify the drop-off step
2. Query failure events, error events near that step
3. Break down by device, country, user segment
4. Suggest hypotheses and next steps

## Funnel Building Guide

### Mapping User Language to Events
When a user says "signup funnel" or "purchase flow", map to actual events:

| User Says | Likely Events |
|-----------|--------------|
| "signup" | `$pageview` (signup page) → signup/register event |
| "activation" | First key action after signup |
| "purchase" / "payment" | Payment popup → transaction completed |
| "onboarding" | Signup → first value action |
| "retention" | Return visit within N days |

Use the discovered `references/my-context.md` to map to exact event names.

### Adding Property Filters
```json
{
  "kind": "EventsNode",
  "event": "$pageview",
  "custom_name": "Pricing Page",
  "properties": [
    {"key": "$current_url", "value": "/pricing", "operator": "icontains", "type": "event"}
  ]
}
```

Common operators: `exact`, `icontains`, `regex`, `not_icontains`, `is_set`, `is_not_set`

## Slack Integration

After generating any insight:
1. Ask: "Want me to share this to Slack?"
2. Check `.env` for `SLACK_CHANNEL_PRODUCT` or `SLACK_CHANNEL_INSIGHTS`
3. Format as concise Slack message with key metrics
4. Send via `slack_send_message`

For anomalies (sudden drops, conversion changes > 20%), auto-suggest alerting to `SLACK_CHANNEL_ALERTS`.

## Output Format

- Always show absolute numbers AND percentages
- Always compare current vs prior period with % change
- Highlight the biggest drop-off in funnels
- Use tables for multi-step funnels
- For trends, describe the trajectory (growing, declining, stable)
- Include sample size warnings if data is thin (< 100 events)
