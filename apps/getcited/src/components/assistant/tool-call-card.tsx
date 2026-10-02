"use client";

import { PreparedNotice } from "@/components/account/prepared-notice";
import { INTERRUPTED_TOOL } from "@/lib/chat-recovery";
import { useState } from "react";
import { Loader2, Check, AlertTriangle, ChevronDown, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { BenchmarkResult, type BenchmarkOutput } from "./benchmark-result";
import {
  DiagnoseResult,
  PlanResult,
  TrackResult,
  type DiagnoseOutput,
  type PlanOutput,
  type TrackOutput,
} from "./result-cards";

import { ContentResult, type ContentOutput } from "./content-result";

const TOOL_LABELS: Record<string, string> = {
  get_active_config: "Loading your config",
  run_benchmark: "Running AI panel benchmark",
  diagnose_citations: "Diagnosing citation gaps",
  build_plan: "Building your action plan + roadmap",
  approve_plan: "Adding the plan to your Tracker",
  track_progress: "Reading your Tracker progress",
  generate_content: "Writing your content",
  save_memory: "Saving to memory",
};

const SPECIAL_RENDER = new Set([
  "run_benchmark",
  "diagnose_citations",
  "build_plan",
  "track_progress",
  "generate_content",
]);

function renderResult(name: string, output: unknown): React.ReactNode {
  switch (name) {
    case "run_benchmark":
      return <BenchmarkResult data={output as BenchmarkOutput} />;
    case "diagnose_citations":
      return <DiagnoseResult data={output as DiagnoseOutput} />;
    case "build_plan":
      return <PlanResult data={output as PlanOutput} />;
    case "track_progress":
      return <TrackResult data={output as TrackOutput} />;
    case "generate_content":
      return <ContentResult data={output as ContentOutput} />;
    default:
      return null;
  }
}

interface ToolPart {
  type: string; // "tool-run_benchmark" | "dynamic-tool" ...
  toolName?: string;
  state?: string; // input-streaming | input-available | output-available | output-error
  input?: unknown;
  output?: unknown;
  errorText?: string;
}

function toolNameOf(part: ToolPart): string {
  if (part.toolName) return part.toolName;
  if (part.type.startsWith("tool-")) return part.type.slice("tool-".length);
  return "tool";
}

export function ToolCallCard({ part, prepared = false, active = true }: { part: ToolPart; prepared?: boolean; active?: boolean }) {
  const name = toolNameOf(part);
  const label = TOOL_LABELS[name] ?? name;
  const state = part.state ?? "input-available";
  const pending = state === "input-streaming" || state === "input-available";
  const running = pending && active;
  const errored = state === "output-error" || pending && !active;
  const [open, setOpen] = useState(false);

  const hasOutput = state === "output-available";
  const isSpecial = SPECIAL_RENDER.has(name) && hasOutput;
  const outputErr = Boolean(
    isSpecial && part.output && typeof part.output === "object" && "error" in (part.output as object),
  );
  const showSpecial = isSpecial && !outputErr;

  return (
    <div className="my-2 overflow-hidden rounded-xl border border-border bg-card/60">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left"
      >
        <span
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-md",
            errored ? "bg-danger/15 text-danger" : running ? "bg-primary/15 text-primary" : "bg-positive/15 text-positive",
          )}
        >
          {running ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : errored ? (
            <AlertTriangle className="h-3.5 w-3.5" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
        </span>
        <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="flex-1 text-sm">{label}</span>
        <span className="text-[11px] text-muted-foreground">{pending && !active ? "interrupted" : state}</span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      <PreparedNotice prepared={prepared} />
      {errored && <div role="alert" className="border-t border-border px-3.5 py-2.5 text-sm text-warning">{INTERRUPTED_TOOL}</div>}
      {/* Specialized result (shown when available & not an error) */}
      {showSpecial && (
        <div className="border-t border-border px-3.5 py-3">{renderResult(name, part.output)}</div>
      )}
      {outputErr && (
        <div className="border-t border-border px-3.5 py-2.5 text-sm text-warning">
          {(part.output as { error: string }).error}
        </div>
      )}

      {open && (
        <div className="border-t border-border bg-background/40 px-3.5 py-2.5">
          {part.input != null && <Detail title="input" value={part.input} />}
          {part.output != null && !showSpecial && <Detail title="output" value={part.output} />}
          {part.errorText && <div className="text-xs text-danger">{part.errorText}</div>}
        </div>
      )}
    </div>
  );
}

function Detail({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="mb-2 last:mb-0">
      <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">{title}</div>
      <pre className="max-h-48 overflow-auto rounded-md bg-secondary/50 p-2 text-[11px] leading-relaxed text-muted-foreground">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
