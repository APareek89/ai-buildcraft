import { ExampleButton } from "@/components/account/example-button";
import { SavedReport } from "@/components/dashboard/saved-report";
import { ReportDownload } from "@/components/account/report-download";
import { PreparedNotice } from "@/components/account/prepared-notice";
import Link from "next/link";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  Quote,
  AlertTriangle,
  FileText,
  Trophy,
  ArrowRight,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import { loadDashboard } from "@/lib/db/dashboard";
import { ButtonLink } from "@/components/ui/button-link";
import { Card } from "@/components/ui/card";
import { SovTrendChart } from "@/components/dashboard/sov-trend-chart";
import { cn } from "@/lib/utils";

export const metadata = { title: "Dashboard · GetCited" };

function pct(n: number | null | undefined) {
  return n == null ? "—" : `${Math.round(n * 100)}%`;
}

export default async function DashboardPage() {
  const user = await requireUser();
  const d = await loadDashboard(user.id);

  if (!d.hasRuns) {
    return (
      <div className="flex min-h-[70vh] flex-1 items-center justify-center p-6">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-card">
            <Trophy className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">No data yet</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Run your first benchmark in the GEO Assistant to see your AI share-of-voice,
            citations, and a costed plan here.
          </p>
          <div className="mt-5"><ExampleButton /></div>
          <ButtonLink href="/assistant" className="mt-6">
            Run your first benchmark <ArrowRight className="h-4 w-4" />
          </ButtonLink>
        </div>
      </div>
    );
  }

  const k = d.kpis;
  const brand = d.config?.brandName || d.config?.brandUrl || "Your brand";

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 md:p-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {brand}
            {d.lastRunAt ? ` · last run ${new Date(d.lastRunAt).toLocaleDateString()}` : ""}
          </p>
        </div>
        <ButtonLink href="/assistant" size="sm" variant="outline">
          New benchmark <ArrowRight className="h-4 w-4" />
        </ButtonLink>
      </div>

      <PreparedNotice prepared={d.prepared} />
      <p className="text-xs text-muted-foreground">Results are directional snapshots. Share of voice divides a brand’s answer mentions by total tracked-brand mentions. Domain text from an ungrounded model response is unverified, not a confirmed cited source.</p>
      <SavedReport />
      {/* KPI cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={TrendingUp} label="Share of voice" value={pct(k?.sov)} delta={k?.sovDelta} />
        <Kpi icon={Target} label="Domain / citation share" value={pct(k?.citationShare)} />
        <Kpi
          icon={Quote}
          label="Sentiment"
          value={
            k?.sentimentScore == null
              ? "—"
              : k.sentimentScore > 0.2
                ? "Positive"
                : k.sentimentScore < -0.2
                  ? "Negative"
                  : "Neutral"
          }
        />
        <Kpi icon={AlertTriangle} label="Claim flags" value={String(k?.hallucinations ?? 0)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Trend */}
        <Card className="p-5 lg:col-span-2">
          <div className="mb-3 text-sm font-medium">Share-of-voice trend</div>
          {d.trend.length > 1 ? (
            <SovTrendChart data={d.trend} />
          ) : (
            <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
              Run more benchmarks to see a trend.
            </div>
          )}
        </Card>

        {/* Leaderboard */}
        <Card className="p-5">
          <div className="mb-3 text-sm font-medium">Competitor leaderboard</div>
          <div className="space-y-2.5">
            {d.leaderboard.map((e) => {
              const isBrand = e.brand === brand;
              return (
                <div key={e.brand}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className={isBrand ? "font-medium text-foreground" : "text-muted-foreground"}>
                      {e.brand}
                      {isBrand && <span className="ml-1.5 text-[10px] uppercase text-primary">you</span>}
                    </span>
                    <span className={isBrand ? "text-foreground" : "text-muted-foreground"}>{pct(e.sov)}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className={isBrand ? "h-full rounded-full bg-aurora" : "h-full rounded-full"}
                      style={{ width: pct(e.sov), ...(isBrand ? {} : { background: "var(--bg-muted)" }) }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Active plan */}
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium">Active plan</span>
            {d.plan && (
              <span className="text-xs text-muted-foreground capitalize">{d.plan.confidence} confidence</span>
            )}
          </div>
          {d.plan ? (
            <div className="space-y-3">
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-semibold">
                  {pct(d.plan.projection?.currentCitationShare)}
                </span>
                <span className="text-muted-foreground">→</span>
                <span className="text-xl font-semibold text-primary">{pct(d.plan.targetCitationShare)}</span>
                <span className="text-xs text-muted-foreground">
                  · {d.plan.tactics.length} tactics · ~{d.plan.timelineWeeks} wks
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <ReportChip planId={d.plan.id} format="html" label="HTML" />
                <ReportChip planId={d.plan.id} format="pdf" label="PDF" />
                <ReportChip planId={d.plan.id} format="xlsx" label="Excel" />
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              No plan yet.{" "}
              <Link href="/assistant" className="text-primary">
                Build one →
              </Link>
            </div>
          )}
        </Card>

        {/* All plans, with dates + downloads */}
        <Card className="p-5">
          <div className="mb-3 text-sm font-medium">Plan documents</div>
          {d.plans.length > 0 ? (
            <div className="space-y-2">
              {d.plans.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2"
                >
                  <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium">
                      {new Date(p.createdAt).toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}{" "}
                      <span className="text-muted-foreground">
                        · {new Date(p.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      target {pct(p.targetCitationShare)} · {p.tactics.length} tactics ·{" "}
                      <span className="capitalize">{p.confidence ?? "low"}</span> confidence
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <ReportChip planId={p.id} format="pdf" label="PDF" />
                    <ReportChip planId={p.id} format="xlsx" label="XLS" />
                    <ReportChip planId={p.id} format="html" label="HTML" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              No plans yet.{" "}
              <Link href="/assistant" className="text-primary">
                Build one →
              </Link>
            </div>
          )}
        </Card>
      </div>

      {/* Config summary */}
      {d.config && (
        <Card className="p-5">
          <div className="mb-2 text-sm font-medium">Configuration</div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Chip>{d.config.competitors.length} competitors</Chip>
            <Chip>{d.config.queries.length} queries</Chip>
            <Chip>${d.config.budgetUsd} budget</Chip>
            <Chip>{d.config.teamSize} people</Chip>
            <Chip>{d.config.timelineWeeks} wk timeline</Chip>
            {d.config.queries.length === 0 && <Chip warn>add queries to run benchmarks</Chip>}
          </div>
        </Card>
      )}
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  delta,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  delta?: number | null;
}) {
  const DeltaIcon = delta == null ? Minus : delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const deltaColor = delta == null || delta === 0 ? "text-muted-foreground" : delta > 0 ? "text-positive" : "text-danger";
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-tight">{value}</span>
        {delta != null && (
          <span className={cn("flex items-center gap-0.5 text-xs", deltaColor)}>
            <DeltaIcon className="h-3 w-3" />
            {Math.abs(Math.round(delta * 100))}pp
          </span>
        )}
      </div>
    </Card>
  );
}

function ReportChip({ planId, format, label }: { planId: string; format: string; label: string }) {
  return (
    <ReportDownload
      planId={planId} format={format}
      className="rounded-lg border border-border bg-card px-2.5 py-1 text-xs hover:bg-secondary"
    >
      {label}
    </ReportDownload>
  );
}

function Chip({ children, warn }: { children: React.ReactNode; warn?: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full border px-2.5 py-1",
        warn ? "border-warning/30 bg-warning/10 text-warning" : "border-border bg-secondary text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}
