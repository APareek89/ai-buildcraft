"use client";

import { useEffect, useState } from "react";
import { Plug, Terminal, ShieldCheck, Copy, Check } from "lucide-react";

const TOOLS = [
  { name: "ping", desc: "Health check — verifies the connector is wired and authenticated." },
  { name: "get_active_config", desc: "Load your saved brand, competitors, queries, budget and team." },
  { name: "run_benchmark", desc: "Run an AI panel → share-of-voice, citation share, sentiment. Uses your bounded provider allowance." },
  { name: "get_report", desc: "Fetch a previous benchmark report by report_id." },
  { name: "build_plan", desc: "Costed action plan + modeled projection (assumptions listed, never a guarantee)." },
  { name: "get_latest_plan", desc: "Fetch your most recent plan (tactics, projection, roadmap)." },
  { name: "approve_plan", desc: "Approve a plan into your Tracker (asks first; idempotent)." },
  { name: "get_tracker", desc: "Read Tracker items — the primary source for progress questions." },
  { name: "generate_content", desc: "GEO-optimized content for a tactic (blog, comparison, Reddit, LinkedIn…)." },
];

export function McpPanel() {
  const [origin, setOrigin] = useState("https://<your-getcited-host>");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(window.location.origin);
  }, []);
  const mcpUrl = `${origin}/mcp`;

  function copy() {
    navigator.clipboard.writeText(mcpUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6 md:p-10">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
          <Plug className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">MCP connector</h1>
          <p className="text-sm text-muted-foreground">
            Drive GetCited from Claude (web/desktop), Cursor, or any MCP client — with OAuth.
          </p>
        </div>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-medium">Server URL</h2>
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded-lg border border-border bg-card px-3 py-2 text-xs text-primary">
            {mcpUrl}
          </code>
          <button
            type="button"
            onClick={copy}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs hover:bg-secondary"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-positive" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium">Install in Claude</h2>
        <ol className="ml-4 list-decimal space-y-1.5 text-sm text-muted-foreground">
          <li>
            Claude → <span className="text-foreground">Settings → Connectors → Add custom connector</span>
          </li>
          <li>Paste the server URL above.</li>
          <li>
            Claude opens the authorization page — sign in with your <span className="text-foreground">GetCited account</span>{" "}
            (the connector then acts on <em>your</em> configs, runs and plans only).
          </li>
          <li>
            Ask Claude: <span className="text-foreground">&quot;Run a GetCited benchmark&quot;</span>.
          </li>
        </ol>
      </section>

      <div className="flex items-start gap-2 rounded-lg border border-positive/20 bg-positive/5 p-3 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-positive" />
        <span>
          Auth is OAuth 2.0 with PKCE (dynamic client registration) — this app is its own
          authorization server; access expires after 24 hours and is bound to your account and revocable sign-in session,
          and tokens are accepted only by this deployment. Signing out revokes that session’s access; reconnect and approve access again. Note: Claude&apos;s hosted connectors need a
          public HTTPS URL — deploy first (or tunnel) for claude.ai; localhost works for local
          MCP clients.
        </span>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-medium">Tools</h2>
        <div className="space-y-2">
          {TOOLS.map((t) => (
            <div key={t.name} className="rounded-lg border border-border bg-card p-3">
              <code className="text-xs text-primary">{t.name}</code>
              <p className="mt-1 text-xs text-muted-foreground">{t.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
          <Terminal className="h-3.5 w-3.5" /> Scripted access (optional)
        </h2>
        <p className="text-xs text-muted-foreground">
          Use an OAuth-capable MCP client. Approve access explicitly in your GetCited account; account data is never exposed by a shared anonymous script key.
        </p>
      </section>
    </div>
  );
}
