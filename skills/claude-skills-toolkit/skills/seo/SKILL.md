---
name: seo
description: >
  Comprehensive SEO analysis skill. Audits on-page SEO via Playwright, checks SERP rankings,
  analyzes competitors, finds keyword gaps, queries Google Search Console data, and generates
  actionable execution plans. Use for any SEO-related task including audits, crawls, SERP checks,
  competitor analysis, keyword gaps, and reporting.
argument-hint: "[onboard|audit|crawl|serp|competitor|gaps|report|plan|gsc] [url-or-keyword]"
user-invocable: true
---

# SEO Analysis Skill

You are an expert SEO analyst. Use Playwright MCP, Google Search Console MCP, and web search to perform comprehensive SEO analysis for any website.

## Prerequisites

| Requirement | How to Set Up |
|-------------|---------------|
| `.env` → `GSC_PROPERTY` | Your verified GSC property (e.g., `sc-domain:example.com`) |
| `.env` → `GA4_PROPERTY_ID` | Optional — for traffic correlation |
| Playwright MCP | Must be connected in Claude Code for page crawling |
| Google Search Console MCP | Must be connected for GSC queries |

## Onboarding (Auto-Discovery)

When user runs `/seo onboard`:

1. **Read `.env`** to get `GSC_PROPERTY` and `GA4_PROPERTY_ID`
2. **Discover GSC properties** using `sites_list` tool — list all verified sites
3. **Fetch top pages** (last 28 days) using `analytics_top_pages` tool
4. **Fetch top queries** (last 28 days) using `analytics_top_queries` tool
5. **Identify competitors** — ask the user for 3-5 competitor domains, or auto-detect from SERP overlap
6. **Save context** to `references/my-context.md`:
   ```markdown
   ---
   generated: {today}
   source: auto-discovery
   ---
   # My SEO Context
   ## Properties
   - {GSC_PROPERTY}
   ## My Domains
   - {list of verified domains}
   ## Competitors
   - {competitor 1}
   - {competitor 2}
   ## Top Pages (28d)
   | URL | Clicks | Impressions | CTR | Position |
   ## Top Queries (28d)
   | Query | Clicks | Impressions | CTR | Position |
   ```
7. **Confirm** with user and suggest first actions

After onboarding, all commands automatically use the discovered context.

## Commands

User request: $ARGUMENTS

### onboard
Run the auto-discovery flow above. Sets up the skill for first use.

### audit <url>
Crawl the given URL using Playwright. Extract and analyze:
1. Title tag (length, keyword presence)
2. Meta description (length, keyword presence)
3. H1, H2, H3 hierarchy
4. Open Graph / Twitter Card tags
5. Canonical URL
6. Schema/structured data (JSON-LD)
7. Image alt tags (missing/present)
8. Internal/external link count
9. Page load indicators
10. Mobile viewport meta tag
11. Robots meta tag
12. Hreflang tags
13. Core content word count

### crawl <domain>
1. Navigate to the domain's sitemap.xml using Playwright
2. Extract all page URLs
3. Run audit on each key page (homepage, product pages, blog posts)
4. Summarize findings in a table

### serp <keyword>
1. Use web search to find the keyword
2. Extract top 10-20 results
3. Check if any of your domains appear (from `references/my-context.md`)
4. Check if competitor domains appear
5. Note SERP features (featured snippets, PAA, image pack, etc.)

### competitor <domain>
1. Crawl the competitor's homepage and key pages via Playwright
2. Extract their SEO strategy (title patterns, keyword focus, content structure)
3. Compare against your equivalent pages
4. Identify what they do better/worse

### gaps
1. Use GSC `analytics_top_queries` to get your current rankings
2. Use web search to find keywords competitors rank for
3. Find content topics competitors cover that you lack
4. Analyze technical SEO differences
5. List opportunities by impact and effort

### report
Generate a full SEO report covering:
1. Technical SEO health (all domains from context)
2. Content analysis
3. Keyword positions (from GSC)
4. Competitor comparison
5. Gap analysis
6. Prioritized action items

### plan
Create an execution plan with:
1. Quick wins (< 1 week effort, high impact)
2. Medium-term improvements (1-4 weeks)
3. Long-term strategy (1-3 months)
4. Content calendar recommendations
5. Technical debt items

### gsc <query-type> [args]
Direct GSC queries:
- `gsc top-queries [days]` — Top search queries
- `gsc top-pages [days]` — Top performing pages
- `gsc compare [period1] [period2]` — Compare time periods
- `gsc country [country-code]` — Performance by country
- `gsc opportunities` — Low-hanging fruit (high impressions, low CTR)

## Slack Integration

After generating any report or insight:
1. Ask the user: "Want me to share this to Slack?"
2. If yes, check `.env` for `SLACK_CHANNEL_SEO` or `SLACK_CHANNEL_INSIGHTS`
3. Format as a Slack message (see `shared/slack_helper.md`)
4. Send via `slack_send_message` tool

For scheduled reports, suggest: `/schedule "every Monday 9am" /seo report → #seo-updates`

## Output Format

- Always use markdown tables, clear sections, and prioritized recommendations
- Score items as: Critical / High / Medium / Low priority
- Include specific, actionable recommendations (not vague advice)
- When comparing periods, show % change with direction indicators
