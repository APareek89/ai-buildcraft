# Claude Skills Toolkit

A collection of **4 reusable Claude Code skills** for analytics, revenue, SEO, and reporting. Built for teams who want AI-powered insights from their existing tools.

Each skill connects to your existing platforms (PostHog, Paddle, GSC), auto-discovers your data schema, and provides natural language commands for analysis — with optional Slack integration for sharing insights across your team.

## Skills

| Skill | What It Does | Connects To |
|-------|-------------|-------------|
| **[Product Analytics](skills/product-analytics/)** | Conversion funnels, event analysis, cohorts, retention, drop-off diagnosis | PostHog |
| **[Revenue](skills/revenue/)** | Revenue trends, pricing management, churn analysis, localized pricing | Paddle |
| **[SEO](skills/seo/)** | On-page audits, SERP tracking, competitor analysis, keyword gaps | Google Search Console, Playwright |
| **[Performance Reporting](skills/performance-reporting/)** | Interactive HTML dashboards, DOCX reports, automated KPI tracking | PostHog, GA4, GSC |

## Quick Start

```bash
# 1. Clone
git clone https://github.com/APareek89/ai-buildcraft.git
cd ai-buildcraft/skills/claude-skills-toolkit

# 2. Configure API keys
cp .env.example .env
# Edit .env with your keys

# 3. Install skills into Claude Code
mkdir -p ~/.claude/skills
for skill in seo revenue product-analytics performance-reporting; do
  ln -sf "$(pwd)/skills/$skill" ~/.claude/skills/$skill
done
ln -sf "$(pwd)/shared" ~/.claude/skills/shared

# 4. Onboard (auto-discovers your schema)
# In Claude Code:
/product-analytics onboard
/revenue onboard
```

See **[SETUP.md](SETUP.md)** for the full setup guide.

## How It Works

### 1. Onboard — Auto-Discovery
Each skill has an `onboard` command that connects to your platform, discovers your data schema (events, products, properties), and saves it as context. This means **the skills adapt to YOUR business** — no hardcoded event names or product IDs.

```
> /product-analytics onboard

Connecting to PostHog (project 12345)...
  Found 42 event definitions
  Found 15 person properties
  Found 8 dashboards
  Top events: $pageview (120K), signup (2.3K), purchase (890)

Context saved! Ready to use.
```

### 2. Analyze — Natural Language Commands
Ask questions in plain English. The skill translates to the right API calls.

```
> /product-analytics funnel "landing page → signup → first purchase" last 30d

Funnel: Landing → Signup → Purchase (30d vs prior 30d)

| Step          | Current | Prior | Conv%  | Change  |
|---------------|---------|-------|--------|---------|
| Landing Page  | 12,340  | 11,200| 100%   | +10.2%  |
| Signup        | 2,456   | 2,100 | 19.9%  | +17.0%  |
| Purchase      | 234     | 198   | 9.5%   | +18.2%  |

Biggest drop: Landing → Signup (80% drop-off)
```

### 3. Share — Slack Integration
Every skill can push insights to Slack channels for your team.

```
> Share this to #product-analytics

Sent to #product-analytics!
```

## Example Commands

### Product Analytics
```
/product-analytics funnel "signup → activate → purchase"
/product-analytics events "purchase" last 7d
/product-analytics trends DAU last 30d
/product-analytics retention "signup" → "purchase"
/product-analytics drops "checkout funnel"
```

### Revenue
```
/revenue query last-7d
/revenue analyze churn this-month
/revenue pricing list "pro-plan"
/revenue analyze countries last-30d
```

### SEO
```
/seo audit https://example.com
/seo serp "best image editor"
/seo competitor photoroom.com
/seo gaps
/seo gsc top-queries 28d
```

### Performance Reporting
```
/performance-reporting dashboard
/performance-reporting report weekly
/performance-reporting refresh
/performance-reporting export docx
```


## Requirements

- [Claude Code](https://claude.ai/claude-code) with skills support
- API keys for the platforms you want to use (see [SETUP.md](SETUP.md))
- Python 3.8+ (optional, for report generation scripts)
- `python-docx` (optional, `pip install python-docx`)

### Recommended MCP Servers
- Slack MCP — for sharing insights
- Playwright MCP — for SEO page crawling
- PostHog MCP — for direct PostHog queries
- Google Search Console MCP — for GSC data

## Contributing

1. Fork this repo
2. Add or improve a skill in `skills/`
3. Follow the skill structure: `SKILL.md` + `scripts/` + `references/`
4. Ensure the `onboard` command works for new users
5. Submit a PR

## License

MIT
