# Setup Guide

Get your Claude Skills Toolkit running in 5 minutes.

## Step 1: Clone & Configure

```bash
git clone https://github.com/APareek89/ai-buildcraft.git
cd ai-buildcraft/skills/claude-skills-toolkit
cp .env.example .env
```

Edit `.env` and add your API keys (only the ones you need):

| Key | Where to Get It | Required For |
|-----|----------------|-------------|
| `POSTHOG_API_KEY` | PostHog → Settings → Personal API Keys | Product Analytics, Performance Reporting |
| `POSTHOG_PROJECT_ID` | PostHog → Settings → Project ID | Product Analytics, Performance Reporting |
| `PADDLE_API_KEY` | Paddle → Developer Tools → API Keys | Revenue |
| `GSC_PROPERTY` | Google Search Console → Settings | SEO |

## Step 2: Install the Skills in Claude Code

Symlink the package so onboarding can find the `.env` beside this README:

```bash
mkdir -p ~/.claude/skills
for skill in seo revenue product-analytics performance-reporting; do
  ln -sf "$(pwd)/skills/$skill" ~/.claude/skills/$skill
done
ln -sf "$(pwd)/shared" ~/.claude/skills/shared
```

Check for an existing installation before replacing a link. Keep this package in place after installing. The onboarding scripts resolve their real source path, so `.env` remains local to this checkout.

## Step 3: Connect MCP Servers

Some skills require MCP servers to be configured in Claude Code:

| MCP Server | Required For | How to Connect |
|------------|-------------|----------------|
| **Slack MCP** | All skills (sharing insights) | Claude Code Settings → MCP Servers → Add Slack |
| **Playwright MCP** | SEO (page crawling) | Claude Code Settings → MCP Servers → Add Playwright |
| **PostHog MCP** | Product Analytics | Claude Code Settings → MCP Servers → Add PostHog |
| **Paddle MCP** | Revenue | Claude Code Settings → MCP Servers → Add Paddle |
| **Google Search Console MCP** | SEO | Claude Code Settings → MCP Servers → Add GSC |

**Note:** Skills work without MCP servers too — they fall back to direct API calls via curl/Python. MCP servers just provide a more integrated experience.

## Step 4: Install Python Dependencies (optional)

Only needed if you want to use the report generation scripts:

```bash
pip install python-docx python-dotenv
```

## Step 5: Run Onboarding

Each skill has an `onboard` command that auto-discovers your data schema:

```
/product-analytics onboard    # Discovers PostHog events, properties, dashboards
/revenue onboard              # Discovers Paddle products, prices, subscriptions
/seo onboard                  # Discovers GSC properties, top pages/queries
/performance-reporting onboard # Sets up dashboard with your metrics
```

Or run the Python onboarding scripts directly:
```bash
python3 skills/product-analytics/scripts/onboard.py
python3 skills/revenue/scripts/onboard.py
```

## Step 6: Connect Slack (optional but recommended)

1. Set `SLACK_ENABLED=true` in `.env`
2. Configure your channels:
   ```
   SLACK_CHANNEL_INSIGHTS=#analytics-insights
   SLACK_CHANNEL_ALERTS=#analytics-alerts
   SLACK_CHANNEL_REPORTS=#weekly-reports
   ```
3. Ensure Slack MCP is connected in Claude Code
4. Skills will offer to share insights after every analysis

## Step 7: Schedule Reports (optional)

Use Claude Code's scheduling to automate reports:

```
/schedule "every Monday 9am" /product-analytics funnel "signup → activate → purchase" → #product-analytics
/schedule "every Friday 5pm" /revenue analyze revenue this-week → #revenue-updates
/schedule "1st of month" /performance-reporting report monthly → #monthly-reports
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "PostHog API key invalid" | Check `POSTHOG_API_KEY` is a personal API key, not a project key |
| "Paddle 429 rate limit" | Wait 30-60s, then retry. Use sequential calls. |
| "GSC not connected" | Run GSC OAuth flow or use Google Search Console MCP |
| "python-docx not found" | `pip install python-docx` |
| Skills not showing in Claude Code | Verify files are in `~/.claude/skills/` and have correct frontmatter |

## Included folders

`skills/product-analytics`, `skills/revenue`, `skills/seo`, and `skills/performance-reporting` contain the skill instructions. `shared/` contains onboarding and optional sharing guidance. Connectors and credentials are configured by the user; do not assume a connector is installed.
