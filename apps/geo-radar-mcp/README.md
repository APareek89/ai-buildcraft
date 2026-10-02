# GEO Radar MCP

Measure brand mentions, citations, sentiment and claims across a configurable panel of model APIs. Compare the same prompts across models and inspect the evidence behind each result. These API samples do not measure consumer ChatGPT rankings or Google AI Overviews.

An open-source **[Model Context Protocol](https://modelcontextprotocol.io) (MCP)** server. Ships all three MCP primitives (tools + resources + prompts) over **stdio** (local) and **streamable-HTTP** (remote).

> Collection snapshot: use the no-key mock panel below for a free first run. [BUILDCRAFT.md](BUILDCRAFT.md) records current checks.

## What it does

You give it a brand + competitors + buyer-intent prompts. It asks a panel of AI models, reads their answers, and computes:

- **Share of Voice** — % of answers that recommend you vs named competitors
- **Citations** — which domains the answers cite (yours vs the competitor gap)
- **Sentiment** — how you're characterized, with representative quotes
- **Hallucinations** — false/outdated claims about you, scored against a facts list

## 60-second install (local, stdio)

```bash
corepack enable && pnpm install && pnpm build
cp .env.example .env      # leave provider keys empty for the mock panel
GEO_STORE=memory pnpm dev:mcp
```

Add to **Claude Desktop** (`claude_desktop_config.json`) or Claude Code:

```json
{
  "mcpServers": {
    "geo-radar": {
      "command": "node",
      "args": ["/absolute/path/to/geo-radar-mcp/apps/mcp-server/dist/index.js"],
      "env": { "GEO_STORE": "memory" }
    }
  }
}
```

`GEO_STORE=memory` runs without a database (data isn't persisted). For persistence set `DATABASE_URL` to a Postgres and run `pnpm --filter @geo-radar/db db:migrate`.

## Tools

| Tool | Input | Returns |
|---|---|---|
| `measure_share_of_voice` | brand, competitors[], prompts[] or prompt_set_id, panel[], runs | `report_id`, SoV per brand, per-prompt breakdown |
| `get_report` | report_id | full stored report |
| `track_citations` | report_id, brand_domains[] | cited domains, your-vs-competitor share, the gap |
| `sentiment_scan` | report_id | sentiment distribution + quotes |
| `detect_hallucinations` | report_id, facts[] | flagged claims + contradicted fact + severity |
| `compare_to_competitor` | brand_a, brand_b, prompts/prompt_set_id | head-to-head SoV, citations, sentiment, winner |
| `ping` | message? | health check |

**Resources:** `prompts://library` · `brand://config` · `reports://{report_id}` · `history://sov{?brand,range}`
**Prompts:** `run_full_geo_audit` · `draft_reputation_defense_brief` · `weekly_sov_report`

## Example

```
measure_share_of_voice(brand="Northstar", competitors=["Photoroom","remove.bg"], prompt_set_id="demo")
→ { report_id, share_of_voice: [{brand:"remove.bg", sov:0.67}, {brand:"Northstar", sov:0.0}], ... }
get_report(report_id) → full answers, citations, sentiment
```

## Panel (v1)

Claude **Haiku** (also the parser/scorer) · **Gemini** Flash · **Groq** Llama · **Perplexity** Sonar. Each runs for real only when its API key is set (`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `PERPLEXITY_API_KEY`); otherwise a deterministic mock keeps everything working offline. A per-run **cost cap** (`PANEL_COST_CAP_USD_PER_RUN`) aborts before overspending.

## Remote (HTTP) mode

```bash
MCP_TRANSPORT=http PORT=8080 MCP_API_KEY=your-secret node apps/mcp-server/dist/index.js
# POST /mcp (Bearer auth) · GET /healthz
```

The included [`render.yaml`](./render.yaml) is a deployment template requiring your own resources. No hosted deployment was validated for this collection. See [`SCALING.md`](./SCALING.md).

## Develop

```bash
pnpm dev:mcp        # run the stdio server (tsx watch)
pnpm test           # offline mock-panel and database-fixture tests
pnpm typecheck
pnpm diagrams:build # regenerate docs/architecture-flow.html
```

Monorepo: `apps/mcp-server` · `packages/{shared,core,db}`. Architecture: [`docs/ARCHITECTURE_FLOW.md`](./docs/ARCHITECTURE_FLOW.md).

## License

See the collection licensing notes and third-party notices. Original provenance is in [SOURCE.json](SOURCE.json).
