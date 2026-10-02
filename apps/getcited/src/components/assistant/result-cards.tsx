"use client";
import { ReportDownload } from "@/components/account/report-download";
import { PreparedNotice } from "@/components/account/prepared-notice";
import { useRequests } from "@/components/account/account-provider";

import { useState, useTransition } from "react";
import {
  ChevronDown,
  TrendingUp,
  AlertCircle,
  CircleDot,
  FileText,
  FileSpreadsheet,
  FileType,
  ListChecks,
  Loader2,
  Check,
  ArrowRight,
  ClipboardList,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { approvePlanAction } from "@/app/(app)/tracker/actions";

function pct(n: number | null | undefined) {
  return n == null ? "—" : `${Math.round(n * 100)}%`;
}

const CONF_STYLE: Record<string, string> = {
  high: "border-positive/40 bg-positive/10 text-positive",
  medium: "border-warning/40 bg-warning/10 text-warning",
  low: "border-danger/40 bg-danger/10 text-danger",
};

// ── Diagnose ─────────────────────────────────────────────────────────────────
interface Gap {
  sourceType: string;
  you: number;
  leader: number;
  deficit: number;
}
export interface DiagnoseOutput {
  current_citation_share: number;
  gap: Gap[];
  top_domains: { domain: string; count: number; is_yours: boolean; sourceType: string }[];
  crawl_grounded: boolean;
  crawled_count: number;
}

export function DiagnoseResult({ data }: { data: DiagnoseOutput }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Your citation share</span>
        <span className="font-semibold">{pct(data.current_citation_share)}</span>
        {data.crawl_grounded && (
          <span className="ml-auto rounded-full border border-positive/30 bg-positive/10 px-2 py-0.5 text-[10px] text-positive">
            {data.crawled_count} pages crawled
          </span>
        )}
      </div>
      <div>
        <div className="mb-2 text-xs text-muted-foreground">Biggest citation gaps (where AI cites others, not you)</div>
        <div className="space-y-1.5">
          {data.gap.slice(0, 6).map((g) => (
            <div key={g.sourceType} className="flex items-center gap-2 text-sm">
              <CircleDot className="h-3.5 w-3.5 text-warning" />
              <span className="capitalize">{g.sourceType}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                you {g.you} · category {g.leader} · <span className="text-warning">−{g.deficit}</span>
              </span>
            </div>
          ))}
          {data.gap.length === 0 && <div className="text-sm text-muted-foreground">No major gaps found.</div>}
        </div>
      </div>
    </div>
  );
}

// ── Plan ─────────────────────────────────────────────────────────────────────
interface ChosenTactic {
  id: string;
  name: string;
  costUsd: number;
  effortHours: number;
  leadWeeks: [number, number];
  closesGap: string | null;
}
interface Projection {
  currentCitationShare: number;
  targetCitationShare: number;
  projectedShareGain: number;
  projectedTrafficUplift: number;
  projectedConversions: number;
  timelineWeeks: number;
  confidence: string;
  assumptions: string[];
  disclaimer: string;
}
interface RoadmapWeek {
  week: number;
  theme: string;
  actions: { tactic_id: string; action: string; owner_role: string; hours: number; deliverable: string }[];
  kpi_checkpoint: string;
}
interface RoadmapOverviewWeek {
  week: number;
  theme: string;
  kpi_checkpoint: string;
  due_date?: string;
  action_count?: number;
}

export interface PlanOutput {
  prepared?: boolean;
  plan_id: string;
  budget_usd: number;
  team_size: number;
  timeline_weeks: number;
  person_hours: number;
  spent_usd: number;
  spent_hours: number;
  tactics: ChosenTactic[];
  projection: Projection;
  /** Legacy threads: full roadmap streamed into the chat. */
  roadmap?: RoadmapWeek[];
  /** Current shape: compact overview; full detail lives in the downloads. */
  roadmap_overview?: RoadmapOverviewWeek[];
  execution_guidelines?: string[];
  capacity_note?: string;
  /** Set when week-by-week roadmap generation failed — the doc lacks the schedule. */
  roadmap_error?: string;
}

/**
 * The plan deliverable card. Top tactics + first roadmap weeks are visible by
 * DEFAULT (the old card hid everything behind a "Plan details" toggle); the
 * primary action is Approve → Tracker (same idempotent path as the agent's
 * approve_plan tool), with the document downloads right next to it.
 */
export function PlanResult({ data }: { data: PlanOutput }) {
  const [showDetails, setShowDetails] = useState(false);
  const p = data.projection;
  const overview: RoadmapOverviewWeek[] =
    data.roadmap_overview ??
    (data.roadmap ?? []).map((w) => ({
      week: w.week,
      theme: w.theme,
      kpi_checkpoint: w.kpi_checkpoint,
      action_count: w.actions?.length,
    }));
  const topTactics = data.tactics.slice(0, 3);
  const moreTactics = data.tactics.length - topTactics.length;
  const allocationComplete = [data.spent_usd, data.budget_usd, data.spent_hours, data.person_hours]
    .every((value) => typeof value === "number" && Number.isFinite(value));

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-secondary">
      <PreparedNotice prepared={data.prepared} />
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-aurora">
          <ClipboardList className="h-4 w-4 text-white" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">GEO Action Plan</div>
          <div className="truncate text-xs text-muted-foreground">
            {data.tactics.length} tactics · {allocationComplete
              ? <>${data.spent_usd.toFixed(0)} of ${data.budget_usd.toFixed(0)} · {Math.round(data.spent_hours)} of {Math.round(data.person_hours)}h · </>
              : <>Allocation totals unavailable in this saved card · </>}{p.timelineWeeks}{" "}
            {p.timelineWeeks === 1 ? "week" : "weeks"}
          </div>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase",
            CONF_STYLE[p.confidence] ?? CONF_STYLE.low,
          )}
        >
          {p.confidence} confidence
        </span>
      </div>

      {/* Projection strip */}
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-baseline gap-2">
          <TrendingUp className="h-4 w-4 self-center text-primary" />
          <span className="text-2xl font-semibold tracking-tight">{pct(p.currentCitationShare)}</span>
          <ArrowRight className="h-4 w-4 self-center text-muted-foreground" />
          <span className="text-2xl font-semibold tracking-tight text-aurora">
            {pct(p.targetCitationShare)}
          </span>
          <span className="text-xs text-muted-foreground">
            citation share in {p.timelineWeeks} {p.timelineWeeks === 1 ? "week" : "weeks"}
          </span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          ~ +{p.projectedTrafficUplift.toLocaleString()} AI sessions/mo · ~ +
          {p.projectedConversions.toLocaleString()} conversions/mo (modeled)
        </div>
      </div>

      {/* Visible preview: top tactics + first weeks */}
      <div className="space-y-3 px-4 py-3">
        <div className="space-y-1.5">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Top tactics</div>
          {topTactics.map((t, i) => (
            <div key={t.id} className="flex items-center gap-2 text-sm">
              <span className="w-4 shrink-0 font-mono text-[11px] text-muted-foreground/70">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">{t.name}</span>
              {t.closesGap && (
                <span className="shrink-0 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-px text-[10px] text-primary">
                  {t.closesGap}
                </span>
              )}
              <span className="shrink-0 text-xs text-muted-foreground">
                {t.costUsd === 0 ? "free" : `$${t.costUsd.toFixed(0)}`} · {Math.round(t.effortHours)}h
              </span>
            </div>
          ))}
          {moreTactics > 0 && (
            <div className="pl-6 text-xs text-muted-foreground">
              +{moreTactics} more in the document and details below
            </div>
          )}
        </div>

        {overview.length > 0 && (
          <div className="space-y-1">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">First weeks</div>
            {overview.slice(0, 2).map((w) => (
              <div key={w.week} className="flex items-baseline gap-2 text-xs">
                <span className="shrink-0 font-medium">Wk {w.week}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{w.theme}</span>
                {w.due_date && <span className="shrink-0 text-muted-foreground/70">due {w.due_date}</span>}
              </div>
            ))}
          </div>
        )}

        {data.capacity_note && (
          <div className="rounded-lg border border-warning/30 bg-warning/10 p-2.5 text-xs text-warning">
            {data.capacity_note}
          </div>
        )}
        {data.roadmap_error && (
          <div className="rounded-lg border border-danger/30 bg-danger/10 p-2.5 text-xs text-danger">
            {data.roadmap_error}
          </div>
        )}
      </div>

      {/* Actions: approve is primary, downloads sit beside it */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border bg-secondary px-4 py-3">
        <ApproveButton planId={data.plan_id} />
        <span className="mx-1 hidden h-5 w-px bg-secondary sm:block" />
        <DownloadBtn planId={data.plan_id} format="docx" icon={FileText} label="Word" title="Full detail: WHAT/WHY/HOW/WHO + dates" />
        <DownloadBtn planId={data.plan_id} format="pdf" icon={FileType} label="PDF" />
        <DownloadBtn planId={data.plan_id} format="xlsx" icon={FileSpreadsheet} label="Excel" />
      </div>

      {/* Footer: disclaimer + collapsible full detail */}
      <div className="space-y-3 px-4 pb-3">
        <p className="flex items-start gap-1.5 pt-2 text-[11px] text-muted-foreground">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-warning" />
          {p.disclaimer}
        </p>
        <button
          type="button"
          onClick={() => setShowDetails((s) => !s)}
          className="flex items-center gap-1 text-xs font-medium text-foreground"
        >
          All tactics, guidelines &amp; assumptions
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showDetails && "rotate-180")} />
        </button>
        {showDetails && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              {data.tactics.map((t) => (
                <div key={t.id} className="flex items-center gap-2 rounded-lg border border-border bg-card p-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{t.name}</div>
                    {t.closesGap && (
                      <div className="text-[10px] uppercase tracking-wide text-primary">closes {t.closesGap} gap</div>
                    )}
                  </div>
                  <div className="shrink-0 text-right text-xs text-muted-foreground">
                    <div>{t.costUsd === 0 ? "free" : `$${t.costUsd.toFixed(0)}`}</div>
                    <div>{Math.round(t.effortHours)}h</div>
                  </div>
                </div>
              ))}
            </div>

            {overview.length > 2 && (
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Full roadmap</div>
                {overview.map((w) => (
                  <div key={w.week} className="flex items-baseline gap-2 text-xs">
                    <span className="shrink-0 font-medium">Wk {w.week}</span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">{w.theme}</span>
                    {w.due_date && <span className="shrink-0 text-muted-foreground/70">due {w.due_date}</span>}
                  </div>
                ))}
              </div>
            )}

            {(data.execution_guidelines?.length ?? 0) > 0 && (
              <div>
                <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                  How to run this plan
                </div>
                <ul className="space-y-1">
                  {data.execution_guidelines!.map((g, i) => (
                    <li key={i} className="text-[11px] text-muted-foreground">
                      • {g}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <div className="mb-1 text-[11px] uppercase tracking-wide text-warning">
                Assumptions ({p.assumptions.length})
              </div>
              <ul className="space-y-1">
                {p.assumptions.map((a, i) => (
                  <li key={i} className="text-[11px] text-muted-foreground">
                    • {a}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ApproveButton({ planId }: { planId: string }) {
  const requests = useRequests();
  const [pending, startTransition] = useTransition();
  const [approved, setApproved] = useState(false);

  function approve() {
    startTransition(async () => {
      const res = await requests.action(owner => approvePlanAction(planId, owner));
      if (!res) return;
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (res.created === 0 && !res.alreadyApproved) {
        toast.warning("This plan has no roadmap items to track — ask me to rebuild the plan.");
        return;
      }
      setApproved(true);
      toast.success(
        res.alreadyApproved
          ? "Already in your Tracker"
          : `Approved — ${res.created} items added to your Tracker`,
      );
    });
  }

  if (approved) {
    return (
      <Link
        href="/tracker"
        className="inline-flex items-center gap-1.5 rounded-full border border-positive/40 bg-positive/10 px-4 py-2 text-sm font-medium text-positive transition-colors hover:bg-positive/20"
      >
        <Check className="h-4 w-4" /> In your Tracker — view <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={approve}
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-full bg-aurora px-4 py-2 text-sm font-medium text-white shadow-none transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListChecks className="h-4 w-4" />}
      Approve → add to Tracker
    </button>
  );
}

function DownloadBtn({
  planId,
  format,
  icon: Icon,
  label,
  title,
}: {
  planId: string;
  format: string;
  icon: React.ElementType;
  label: string;
  title?: string;
}) {
  return (
    <ReportDownload
      planId={planId} format={format} title={title}
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
    >
      <Icon className="h-3.5 w-3.5 text-primary" />
      {label}
    </ReportDownload>
  );
}

// ── Track ────────────────────────────────────────────────────────────────────
const ITEM_STATUS_DOT: Record<string, string> = {
  not_started: "bg-muted-foreground/40",
  in_progress: "bg-primary",
  done: "bg-positive",
  blocked: "bg-danger",
};

interface TrackerItem {
  week: number;
  action: string;
  status: string;
  due_date: string;
  owner_role: string | null;
  remarks: string | null;
}

export interface TrackOutput {
  baseline_citation_share: number | null;
  target_citation_share: number | null;
  measured?: { current_citation_share: number } | null;
  // Tracker-based shape:
  approved?: boolean;
  message?: string;
  total_items?: number;
  status_counts?: { not_started: number; in_progress: number; done: number; blocked: number };
  done_pct?: number;
  overdue?: { week: number; action: string; due_date: string; status: string }[];
  items?: TrackerItem[];
  // Legacy shape (old threads):
  current_citation_share?: number;
  pending?: string[];
  tactics?: { id: string; name: string; done: boolean }[];
}

export function TrackResult({ data }: { data: TrackOutput }) {
  const [showItems, setShowItems] = useState(false);
  const measuredNow = data.measured?.current_citation_share ?? data.current_citation_share;
  const isTracker = data.status_counts != null || data.approved != null;

  if (!isTracker) {
    // Legacy render for threads recorded before the Tracker existed.
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Baseline" value={pct(data.baseline_citation_share)} />
          <Stat label="Now" value={pct(measuredNow)} highlight />
          <Stat label="Target" value={pct(data.target_citation_share)} />
        </div>
        <div className="space-y-1">
          {(data.tactics ?? []).map((t) => (
            <div key={t.id} className="flex items-center gap-2 text-sm">
              <span className={cn("h-2 w-2 rounded-full", t.done ? "bg-positive" : "bg-muted-foreground/40")} />
              <span className={t.done ? "text-muted-foreground line-through" : ""}>{t.name}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data.approved) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">{data.message}</p>
        {measuredNow != null && (
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Baseline" value={pct(data.baseline_citation_share)} />
            <Stat label="Now (measured)" value={pct(measuredNow)} highlight />
            <Stat label="Target" value={pct(data.target_citation_share)} />
          </div>
        )}
      </div>
    );
  }

  const c = data.status_counts!;
  const total = data.total_items ?? 0;
  return (
    <div className="space-y-3">
      {/* Progress headline from the Tracker */}
      <div className="rounded-xl border border-border bg-secondary/40 p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Execution progress</span>
          <span className="text-xs text-muted-foreground">
            {c.done}/{total} done · {data.done_pct}%
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background/60">
          <div className="h-full bg-aurora" style={{ width: `${data.done_pct ?? 0}%` }} />
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          <span>⏳ {c.not_started} not started</span>
          <span className="text-primary">▶ {c.in_progress} in progress</span>
          <span className="text-positive">✓ {c.done} done</span>
          {c.blocked > 0 && <span className="text-danger">■ {c.blocked} blocked</span>}
        </div>
      </div>

      {(data.overdue?.length ?? 0) > 0 && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 p-2.5 text-xs text-warning">
          {data.overdue!.length} item{data.overdue!.length === 1 ? "" : "s"} overdue — oldest:{" "}
          {data.overdue![0]!.action} (due {data.overdue![0]!.due_date})
        </div>
      )}

      {/* Measured impact only when a re-benchmark ran */}
      {measuredNow != null && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Baseline" value={pct(data.baseline_citation_share)} />
          <Stat label="Now (measured)" value={pct(measuredNow)} highlight />
          <Stat label="Target" value={pct(data.target_citation_share)} />
        </div>
      )}

      {(data.items?.length ?? 0) > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowItems((s) => !s)}
            className="flex items-center gap-1 text-xs font-medium text-foreground"
          >
            Items ({data.items!.length}) — edit them on the Tracker tab
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showItems && "rotate-180")} />
          </button>
          {showItems && (
            <div className="mt-2 space-y-1">
              {data.items!.map((i, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs">
                  <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", ITEM_STATUS_DOT[i.status] ?? "bg-muted-foreground/40")} />
                  <span className="min-w-0 flex-1">
                    <span className={i.status === "done" ? "text-muted-foreground line-through" : ""}>
                      wk{i.week} · {i.action}
                    </span>
                    {i.remarks && <span className="text-muted-foreground"> — “{i.remarks}”</span>}
                  </span>
                  <span className="shrink-0 text-muted-foreground/70">{i.due_date}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/40 p-2.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 text-lg font-semibold", highlight && "text-primary")}>{value}</div>
    </div>
  );
}
