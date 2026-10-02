---
name: performance-reporting
description: >
  Interactive performance dashboard and report generator. Builds self-contained HTML dashboards
  from PostHog + GA4 + GSC data, generates DOCX reports, and maintains live funnel visualizations.
  Use for building dashboards, generating weekly/monthly reports, or creating executive summaries.
argument-hint: "[onboard|dashboard|report|refresh|export] [tool-or-period]"
user-invocable: true
---

# Performance Reporting Skill

You are an expert at building interactive performance dashboards and generating executive reports. You combine data from PostHog, GA4, and GSC into self-contained HTML dashboards and polished DOCX reports.

## Prerequisites

| Requirement | How to Set Up |
|-------------|---------------|
| `.env` → `POSTHOG_API_KEY` | PostHog personal API key |
| `.env` → `POSTHOG_PROJECT_ID` | PostHog project ID |
| `.env` → `POSTHOG_HOST` | PostHog instance URL |
| `.env` → `GSC_PROPERTY` | Optional — for SEO metrics in dashboard |
| `.env` → `GA4_PROPERTY_ID` | Optional — for traffic metrics |
| Python 3.8+ | For report generation scripts |
| `python-docx` | `pip install python-docx` — for DOCX reports |

## Onboarding (Auto-Discovery)

When user runs `/performance-reporting onboard`:

1. **Check prerequisites** — verify API keys, Python, python-docx
2. **Discover PostHog schema** — fetch top events, key properties (reuse from product-analytics if available)
3. **Discover product funnels** — ask user: "What are your key conversion funnels?" or auto-detect from PostHog actions/insights
4. **Discover KPIs** — ask user: "What KPIs do you track?" Suggest common ones:
   - Signups, DAU/WAU/MAU, Activation rate, Conversion rate, Revenue
5. **Build funnel definitions** — for each product/tool the user has, create funnel step definitions
6. **Generate initial dashboard** — create `dashboard.html` with discovered metrics
7. **Save context** to `references/my-context.md`:
   ```markdown
   ---
   generated: {today}
   source: auto-discovery
   ---
   # My Dashboard Context
   ## KPIs
   | KPI | Event/Query | Target |
   ## Funnels
   | Funnel | Steps | Window |
   ## Products/Tools
   | Product | Key Events | Studio URL |
   ## Report Schedule
   - Weekly: every Monday
   - Monthly: 1st of month
   ```

## Commands

User request: $ARGUMENTS

### onboard
Run auto-discovery and generate initial dashboard.

### dashboard [period]
Generate or refresh the interactive HTML dashboard.

**Architecture:**
- Single self-contained HTML file (no external dependencies)
- All data embedded in a `const D = { ... }` JavaScript object
- Responsive layout with tabs for different views
- Charts rendered with inline SVG or Canvas

**Sections:**
1. **Overview KPIs** — signups, DAU, conversions, revenue (MTD, last month, 7d, 30d)
2. **Funnels** — per-product conversion funnels with step-by-step visualization
3. **UTM Analysis** — traffic source breakdown
4. **Geo & Device** — country and device distribution
5. **Error Tracking** — failure rates and error tables
6. **SEO Metrics** — GSC clicks, impressions, CTR, position (if configured)

**Data fetch pattern (Python):**
```python
import urllib.request, json, os

HOST = os.environ.get('POSTHOG_HOST', 'https://us.posthog.com')
PROJECT_ID = os.environ.get('POSTHOG_PROJECT_ID')
API_KEY = os.environ.get('POSTHOG_API_KEY')

def query_posthog(hogql):
    url = f"{HOST}/api/projects/{PROJECT_ID}/query/"
    payload = json.dumps({"query": {"kind": "HogQLQuery", "query": hogql}}).encode()
    req = urllib.request.Request(url, data=payload, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", f"Bearer {API_KEY}")
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read())
```

### report [type] [period]
Generate a polished DOCX report.

**Report types:**
- `report weekly` — Last 7 days vs prior 7 days
- `report monthly` — Current month vs prior month
- `report funnel [name]` — Deep-dive funnel report for a specific product
- `report executive` — High-level summary for leadership
- `report custom [start] [end]` — Custom date range

**Report structure:**
1. Executive Summary (2-3 key takeaways)
2. KPI Table (current vs prior, with % change)
3. Funnel Analysis (per product, with drop analysis)
4. Traffic Sources & UTM breakdown
5. Geo/Device insights
6. Anomalies & Recommendations
7. Appendix (raw data tables)

**DOCX generation uses `python-docx`:**
```python
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH

doc = Document()
doc.add_heading('Weekly Performance Report', 0)
# ... build report ...
doc.save('report.docx')
```

### refresh
Re-fetch all data and update the existing dashboard HTML.

**How it works:**
1. Read current `dashboard.html`
2. Extract the `const D = { ... }` block
3. Preserve static data sections (geo, device, error tables)
4. Re-fetch dynamic data from PostHog
5. Rebuild the D object
6. Replace in HTML
7. Validate JS syntax: `node -e 'new Function(script)'`

### export [format]
Export current dashboard data:
- `export csv` — Raw data as CSV files
- `export docx` — Generate DOCX report from current data
- `export json` — Raw D object as JSON
- `export png` — Screenshot dashboard via Playwright

## Dashboard HTML Template

The generated dashboard follows this structure:
```html
<!DOCTYPE html>
<html>
<head>
  <title>{Product} Performance Dashboard</title>
  <style>/* Responsive CSS with dark/light mode */</style>
</head>
<body>
  <div id="app">
    <nav><!-- Period selector, tab navigation --></nav>
    <section id="overview"><!-- KPI cards --></section>
    <section id="funnels"><!-- Funnel visualizations --></section>
    <section id="traffic"><!-- UTM, geo, device --></section>
    <section id="errors"><!-- Error tables --></section>
    <section id="seo"><!-- GSC metrics --></section>
  </div>
  <script>
    const D = { /* all data */ };
    // Rendering logic
  </script>
</body>
</html>
```

## Funnel Query Pattern (Person-ID attribution)

For accurate funnel attribution, use person_id grouping:
```sql
WITH ue AS (
  SELECT person_id,
    countIf(event='$pageview' AND properties.$current_url LIKE '%/landing%')>0 AS s1,
    countIf(event='signup_complete')>0 AS s2,
    countIf(event='first_action')>0 AS s3,
    countIf(event='purchase')>0 AS s4
  FROM events
  WHERE timestamp >= '{start}' AND timestamp < '{end}'
    AND event IN ('$pageview','signup_complete','first_action','purchase')
  GROUP BY person_id
)
SELECT countIf(s1), countIf(s1 AND s2), countIf(s1 AND s2 AND s3), countIf(s1 AND s2 AND s3 AND s4)
FROM ue
```

## Slack Integration

After generating dashboard or report:
1. Auto-ask: "Want me to share this to Slack?"
2. For dashboards: share a summary with key metrics + link to open the HTML
3. For reports: share executive summary + attach DOCX if possible
4. Use `SLACK_CHANNEL_REPORTS` from `.env`

Suggest scheduling: `/schedule "every Monday 9am" /performance-reporting report weekly → #weekly-reports`

## Output Format

- Dashboards: self-contained HTML files, openable in any browser
- Reports: DOCX with professional formatting (tables, colors, headers)
- Always include period comparison (current vs prior)
- Always validate JS syntax after modifying HTML dashboards
- Color coding: green for improvements, red for regressions, orange for warnings
