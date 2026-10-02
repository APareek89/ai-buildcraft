import { Check, ShieldCheck, KeyRound, LockKeyhole } from "lucide-react";
import { ButtonLink } from "@/components/ui/button-link";

const TOOL_CHIPS = ["run_benchmark", "get_report", "build_plan"];

const NINE_TOOLS = [
  "run_benchmark",
  "get_report",
  "build_plan",
  "approve_plan",
  "get_tracker",
  "generate_content",
  "get_active_config",
  "get_latest_plan",
  "ping",
];

const SECURITY_ITEMS = [
  { icon: ShieldCheck, text: "OAuth 2.1 + PKCE" },
  { icon: KeyRound, text: "Self-hosted authorization server — no third-party identity provider in the loop" },
  { icon: LockKeyhole, text: "Scoped to your account — tokens expire after 24 hours; sign out revokes session access" },
];

function ToolChip({ name }: { name: string }) {
  return (
    <span className="glass inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 font-mono text-[11px] text-muted-foreground">
      {name} <Check className="h-3 w-3 text-cyan-400" />
    </span>
  );
}

export function McpSection() {
  return (
    <section id="mcp" className="relative mx-auto w-full max-w-7xl px-6 py-24">
      {/* Overlapping aurora radials — the visual crescendo */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/4 top-10 h-[380px] w-[380px] rounded-full bg-[#7C3AED]/30 blur-[130px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-10 right-1/4 h-[360px] w-[360px] rounded-full bg-[#22D3EE]/25 blur-[130px]"
      />

      <div className="relative mx-auto max-w-3xl text-center">
        <div className="text-aurora font-mono text-sm uppercase tracking-widest">MCP connector</div>
        <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-foreground lg:text-4xl">
          The encore: run your whole AI visibility program from inside Claude.
        </h2>
        <p className="mt-5 text-left text-muted-foreground">
          {
            'GetCited is agent-first — a chat drives the entire pipeline, so "learning the tool" mostly means asking questions in plain English. And with the GetCited MCP connector, you may never open our UI at all. Add it to Claude once, and everything you just scrolled through becomes a conversation: benchmark your brand, pull the report, build a plan against a budget, approve it into the tracker, check progress, draft the content the plan calls for. This is not a read-only data feed bolted onto a chat window. It\'s nine tools covering the full Measure → Diagnose → Plan → Track loop, so your AI visibility program lives where you already work.'
          }
        </p>
      </div>

      {/* Claude window vignette */}
      <div className="glass relative mx-auto mt-12 max-w-4xl rounded-[20px]">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-secondary" />
          <span className="h-2.5 w-2.5 rounded-full bg-secondary" />
          <span className="h-2.5 w-2.5 rounded-full bg-secondary" />
          <span className="ml-2 text-xs text-muted-foreground">
            {"Claude — connected to GetCited"}
          </span>
        </div>
        <div className="space-y-4 p-6">
          <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-secondary px-4 py-2.5 text-sm text-foreground">
            {
              "Benchmark my brand, then build a plan for a $6,000 budget, two people, eight weeks. If it looks right, put it in the tracker."
            }
          </div>
          <div className="flex flex-wrap gap-2">
            {TOOL_CHIPS.map((t) => (
              <ToolChip key={t} name={t} />
            ))}
          </div>
          <div className="glass max-w-[92%] rounded-2xl rounded-bl-sm px-4 py-3 text-sm text-muted-foreground">
            {
              "Panel complete: your AI share of voice is 18% across the Claude + Perplexity panel — citation share 9%. (Single run — read it as directional.) Biggest gap: comparison-listicle citations, where two competitors appear and you don't. I've built a 9-action plan, estimated at $5,700 of your $6,000, projected +6–9 pts SoV (modeled estimate, medium confidence, assumptions listed). Shall I approve it into your tracker?"
            }
          </div>
          <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-secondary px-4 py-2.5 text-sm text-foreground">
            Approve it.
          </div>
          <div className="flex flex-wrap gap-2">
            <ToolChip name="approve_plan" />
          </div>
          <div className="glass max-w-[92%] rounded-2xl rounded-bl-sm px-4 py-3 text-sm text-muted-foreground">
            {
              'Done — 9 tracker items created with due dates through Week 8. Ask me "how are we progressing?" any time.'
            }
          </div>
        </div>
      </div>

      {/* Nine-tool grid */}
      <div className="relative mx-auto mt-10 grid max-w-2xl grid-cols-3 gap-2">
        {NINE_TOOLS.map((t) => (
          <div
            key={t}
            className="glass truncate rounded-lg px-3 py-2 text-center font-mono text-[11px] text-muted-foreground"
          >
            {t}
          </div>
        ))}
      </div>

      {/* Security strip */}
      <div className="relative mt-8 flex flex-wrap justify-center gap-x-6 gap-y-3 text-xs text-muted-foreground">
        {SECURITY_ITEMS.map(({ icon: Icon, text }) => (
          <span key={text} className="inline-flex items-center gap-1.5">
            <Icon className="h-3.5 w-3.5 text-cyan-400" /> {text}
          </span>
        ))}
      </div>

      {/* Section CTA */}
      <div className="relative mt-10 text-center">
        <ButtonLink
          href="/connector"
          size="lg"
          className="bg-aurora rounded-full border-0 px-8 text-white hover:opacity-90"
        >
          Add GetCited to Claude
        </ButtonLink>
        <p className="mt-4 text-sm text-muted-foreground">
          {
            "Works with any MCP-capable client. You authorize with your own GetCited login — no pasted API keys in chat."
          }
        </p>
      </div>
    </section>
  );
}
