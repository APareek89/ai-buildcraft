"use client";
import { useRequests } from "@/components/account/account-provider";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertCircle,
  Briefcase,
  CalendarClock,
  Check,
  DollarSign,
  Globe,
  Loader2,
  MessagesSquare,
  Plus,
  Save,
  ServerCog,
  Sparkles,
  Swords,
  Users,
  Wand2,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { ConfigurePlatform } from "@/components/configure/configure-platform";
import type { ConfigView } from "@/lib/db/configs";
import {
  saveConfigAction,
  suggestQueriesAction,
  discoverCompetitorsAction,
} from "@/app/(app)/configure/actions";

/* Client rules mirror the server zod SaveSchema — a client-valid form cannot
 * fail server parse. */
const DOMAIN_RE = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/.*)?$/i;

/* Glass depth system: Tier-1 section cards · Tier-2 recessed wells · Tier-3 chips. */
const TIER1 =
  "rounded-[20px] border border-border bg-secondary  shadow-none transition-colors hover:border-border";
const TIER2 =
  "rounded-xl border border-border bg-secondary shadow-none";
const TIER3 = "rounded-full border border-border bg-secondary";
const MICRO_LABEL =
  "mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground";
const FIELD =
  "h-9 rounded-xl border-border bg-secondary placeholder:text-muted-foreground/50 focus-visible:ring-2 focus-visible:ring-primary/50";
const AI_BTN =
  "h-9 w-full justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 text-xs text-primary transition-colors hover:border-primary/40 hover:bg-primary/10 disabled:pointer-events-none disabled:opacity-40";

function padTo<T>(arr: T[], n: number, fill: T): T[] {
  const out = [...arr];
  while (out.length < n) out.push(fill);
  return out;
}

/** Same host derivation the server uses in deriveDomains. */
function hostOf(url: string): string | null {
  const u = url.trim();
  if (!u) return null;
  try {
    return new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).host
      .replace(/^www\./, "")
      .toLowerCase();
  } catch {
    return null;
  }
}

function urlProblem(v: string): string | null {
  const t = v.trim();
  if (!t) return null; // empty is handled at save time ("required")
  if (t.length < 3 || t.length > 300 || !DOMAIN_RE.test(t)) {
    return "Enter a valid domain, e.g. acme.com";
  }
  return null;
}

function numProblem(
  v: string,
  min: number,
  max: number,
  int: boolean,
  msg: string,
): string | null {
  const t = v.trim();
  if (!t) return null; // empty falls back to defaults on blur/save — never NaN
  const n = Number(t);
  if (!Number.isFinite(n) || n < min || n > max || (int && !Number.isInteger(n))) return msg;
  return null;
}

function clampOnBlur(v: string, min: number, max: number, fallback: number): string {
  const n = Number(v.trim());
  if (v.trim() === "" || !Number.isFinite(n)) return String(fallback);
  return String(Math.min(max, Math.max(min, Math.round(n))));
}

function numOr(v: string, fallback: number): number {
  const n = Number(v.trim());
  return v.trim() !== "" && Number.isFinite(n) ? n : fallback;
}

/** Normalized snapshot for dirty tracking — mode and keys are excluded by design. */
function snapshotOf(s: {
  brandUrl: string;
  brandName: string;
  description: string;
  competitors: string[];
  competitorDomains: string[];
  queries: string[];
  budget: string;
  teamSize: string;
  timelineWeeks: string;
}): string {
  const kept = s.competitors
    .map((c, i) => ({ name: c.trim(), domain: s.competitorDomains[i] ?? "" }))
    .filter((c) => c.name);
  return JSON.stringify({
    brandUrl: s.brandUrl.trim(),
    brandName: s.brandName.trim(),
    description: s.description.trim(),
    competitors: kept,
    queries: s.queries,
    budget: s.budget.trim(),
    teamSize: s.teamSize.trim(),
    timelineWeeks: s.timelineWeeks.trim(),
  });
}

/** Shared 32px card header: icon chip · mono numeral (positive when done) · hint line. */
function CardHead({
  icon: Icon,
  num,
  title,
  hint,
  done,
  badge,
}: {
  icon: LucideIcon;
  num: string;
  title: string;
  hint: string;
  done: boolean;
  badge?: ReactNode;
}) {
  return (
    <div className="flex shrink-0 items-start gap-2.5">
      <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-border bg-secondary">
        <Icon className="h-4 w-4 text-primary" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "font-mono text-[10px] tracking-wider",
              done ? "text-positive" : "text-muted-foreground/60",
            )}
          >
            {num}
          </span>
          <span className="text-sm font-semibold">{title}</span>
          {badge}
        </div>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}

const COMPETITOR_PLACEHOLDERS = ["Competitor name or URL", "e.g. Linear", "e.g. Notion"];

export function ConfigureForm({ initial }: { initial: ConfigView | null }) {
  const requests = useRequests();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [suggesting, setSuggesting] = useState(false);
  const [discovering, setDiscovering] = useState(false);

  // ── B1 · Brand ─────────────────────────────────────────────────────────────
  const [brandUrl, setBrandUrl] = useState(initial?.brandUrl ?? "");
  const [brandName, setBrandName] = useState(initial?.brandName ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [urlError, setUrlError] = useState<string | null>(null);

  // ── B2 · Competitors (NAME inputs + parallel domain pairing) ───────────────
  // Render ALL saved competitors — the server allows up to 15, so a legacy
  // config saved with more than 5 must never be truncated (a silent slice here
  // would drop entries on the next save with no dirty flag). The ADD cap stays
  // 5 for new configs but expands to the initial length for legacy ones.
  const cap = Math.max(5, (initial?.competitors ?? []).length);
  const [competitors, setCompetitors] = useState<string[]>(() =>
    padTo(initial?.competitors ?? [], 3, ""),
  );
  const [competitorDomains, setCompetitorDomains] = useState<string[]>(() =>
    padTo(
      initial?.competitorDomains ?? [],
      Math.max(3, (initial?.competitors ?? []).length),
      "",
    ),
  );

  // ── B3 · Queries ───────────────────────────────────────────────────────────
  const [queries, setQueries] = useState<string[]>((initial?.queries ?? []).slice(0, 30));
  const [newQuery, setNewQuery] = useState("");
  const [composerMsg, setComposerMsg] = useState<string | null>(null);
  const [composerFlash, setComposerFlash] = useState(false);

  // ── C · Plan & platform ────────────────────────────────────────────────────
  const [budget, setBudget] = useState<string>(String(initial?.budgetUsd ?? 400));
  const [teamSize, setTeamSize] = useState<string>(String(initial?.teamSize ?? 2));
  const [timelineWeeks, setTimelineWeeks] = useState<string>(
    String(initial?.timelineWeeks ?? 8),
  );
  // Mode lives here so Save sends the real value, but it persists instantly via
  // saveModeAction inside ConfigurePlatform and is excluded from dirty state.
  const [mode, setMode] = useState(initial?.mode ?? "we_serve");

  // ── Rail · which panel is visible (Business Context vs Platform) ───────────
  const [tab, setTab] = useState<"business" | "platform">("business");

  // ── A · Save / dirty state ─────────────────────────────────────────────────
  const [savedVersion, setSavedVersion] = useState<number | null>(initial?.version ?? null);
  const prepared = Boolean(initial?.prepared && savedVersion === initial.version);
  const assistanceHint = prepared
    ? "Save an edited configuration before using AI suggestions."
    : mode === "self_serve"
      ? "AI suggestions use your encrypted stored key. Tab-only keys work in chat and probes."
      : "";
  const [chipKey, setChipKey] = useState(0);
  const [shaking, setShaking] = useState(false);
  const [snapshot, setSnapshot] = useState<string>(() =>
    snapshotOf({
      brandUrl: initial?.brandUrl ?? "",
      brandName: initial?.brandName ?? "",
      description: initial?.description ?? "",
      competitors: initial?.competitors ?? [],
      competitorDomains: initial?.competitorDomains ?? [],
      queries: (initial?.queries ?? []).slice(0, 30),
      budget: String(initial?.budgetUsd ?? 400),
      teamSize: String(initial?.teamSize ?? 2),
      timelineWeeks: String(initial?.timelineWeeks ?? 8),
    }),
  );

  // Entry animations for AI-filled rows / appended queries.
  const [staggerFrom, setStaggerFrom] = useState<number | null>(null);
  const [newFrom, setNewFrom] = useState<number | null>(null);
  const [flashOn, setFlashOn] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  const brandUrlRef = useRef<HTMLInputElement>(null);
  const brandNameRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const compRefs = useRef<(HTMLInputElement | null)[]>([]);
  const budgetRef = useRef<HTMLInputElement>(null);
  const teamRef = useRef<HTMLInputElement>(null);
  const weeksRef = useRef<HTMLInputElement>(null);
  const wellRef = useRef<HTMLDivElement>(null);

  // ── Derived ────────────────────────────────────────────────────────────────
  const urlValid = brandUrl.trim() !== "" && urlProblem(brandUrl) === null;
  const host = urlValid ? hostOf(brandUrl) : null;
  const filledCompetitors = competitors.filter((c) => c.trim()).length;
  const budgetErr = numProblem(budget, 0, 1_000_000, false, "Between $0 and $1,000,000.");
  const teamErr = numProblem(teamSize, 1, 100, true, "1–100 people.");
  const weeksErr = numProblem(timelineWeeks, 1, 104, true, "1–104 weeks.");
  const teamN = Math.round(numOr(teamSize, 2));
  const weeksN = Math.round(numOr(timelineWeeks, 8));
  const hours = Math.max(0, teamN * weeksN * 25);
  const planErr = budgetErr ?? teamErr ?? weeksErr;
  // Step completion: S1 valid URL (plan fields have defaults) · S2 ≥1 competitor · S3 ≥3 queries.
  const steps = [urlValid, filledCompetitors >= 1, queries.length >= 3];
  const doneCount = steps.filter(Boolean).length;
  const canGenerate = Boolean(brandUrl.trim() || brandName.trim());
  const isDirty =
    snapshotOf({
      brandUrl,
      brandName,
      description,
      competitors,
      competitorDomains,
      queries,
      budget,
      teamSize,
      timelineWeeks,
    }) !== snapshot;

  function isDupe(i: number): boolean {
    const v = competitors[i]?.trim().toLowerCase();
    if (!v) return false;
    return competitors.some((c, j) => j < i && c.trim().toLowerCase() === v);
  }

  // ── Competitors (pairing contract preserved) ───────────────────────────────
  function setCompetitor(i: number, val: string) {
    setCompetitors((prev) => prev.map((c, idx) => (idx === i ? val : c)));
    // Manual edit invalidates the suggested domain pairing for that slot.
    setCompetitorDomains((prev) => prev.map((d, idx) => (idx === i ? "" : d)));
  }
  function addCompetitor() {
    setCompetitors((prev) => (prev.length >= cap ? prev : [...prev, ""]));
    setCompetitorDomains((prev) => (prev.length >= cap ? prev : [...prev, ""]));
  }
  function removeCompetitor(i: number) {
    setCompetitors((prev) => padTo(prev.filter((_, idx) => idx !== i), 3, ""));
    setCompetitorDomains((prev) => padTo(prev.filter((_, idx) => idx !== i), 3, ""));
  }

  // ── Queries ────────────────────────────────────────────────────────────────
  function flashComposer() {
    setComposerFlash(true);
    window.setTimeout(() => setComposerFlash(false), 300);
  }
  function addQuery() {
    const q = newQuery.trim();
    if (!q) return; // empty-input Enter is a no-op
    if (queries.length >= 30) {
      setComposerMsg("30 max — remove one to add another.");
      flashComposer();
      return;
    }
    if (queries.some((x) => x.toLowerCase() === q.toLowerCase())) {
      setComposerMsg("Already added");
      flashComposer();
      return; // input intentionally NOT cleared so the collision stays visible
    }
    setQueries((prev) => [...prev, q]);
    setNewQuery("");
    setComposerMsg(null);
  }
  function removeQuery(i: number) {
    setQueries((prev) => prev.filter((_, idx) => idx !== i));
  }

  // ── AI actions ─────────────────────────────────────────────────────────────
  async function onSuggestCompetitors() {
    if (prepared || !urlValid || discovering) return;
    setDiscovering(true);
    const res = await requests.action(owner => discoverCompetitorsAction({
      brandUrl,
      brandName: brandName || undefined,
      description: description || undefined,
    }, owner));
    setDiscovering(false);
    if (!res) return;
      if (!res.ok) {
      toast.error(res.error);
      return;
    }
    if (res.data.length === 0) {
      toast("No confident matches — add them manually.");
      return;
    }
    // Fill NAMES into the inputs (mention matching needs names, not URLs) and keep
    // the domain paired in the parallel array for citation attribution. Zip
    // name+domain pairs BEFORE dropping empty rows (same as the save path) — a
    // positional slice after filtering would shift domains onto the wrong
    // competitor whenever an emptied slot precedes a filled one.
    const keptPairs = competitors
      .map((c, i) => ({ name: c.trim(), domain: competitorDomains[i] ?? "" }))
      .filter((p) => p.name);
    const merged = keptPairs.map((p) => p.name);
    const mergedDomains = keptPairs.map((p) => p.domain);
    for (const c of res.data) {
      if (merged.length >= 5) break; // suggestions cap at 5 (SoV product intent)
      if (merged.some((m) => m.toLowerCase() === c.name.toLowerCase())) continue;
      merged.push(c.name);
      try {
        mergedDomains.push(new URL(c.url).host.replace(/^www\./, "").toLowerCase());
      } catch {
        mergedDomains.push("");
      }
    }
    setCompetitors(padTo(merged, 3, ""));
    setCompetitorDomains(padTo(mergedDomains, Math.max(3, merged.length), ""));
    setStaggerFrom(keptPairs.length);
    window.setTimeout(() => setStaggerFrom(null), 1200);
    toast.success(`Found ${res.data.length} competitors`);
  }

  async function onGenerateQueries() {
    if (prepared || !canGenerate || suggesting) return;
    setSuggesting(true);
    const res = await requests.action(owner => suggestQueriesAction({
      brand: brandName || brandUrl,
      description: description || undefined,
      competitors: competitors.filter((c) => c.trim()),
    }, owner));
    setSuggesting(false);
    if (!res) return;
      if (!res.ok) {
      toast.error(res.error);
      return;
    }
    const existing = new Set(queries.map((q) => q.toLowerCase()));
    const fresh = res.data.filter((q) => !existing.has(q.toLowerCase()));
    const room = Math.max(0, 30 - queries.length);
    const added = fresh.slice(0, room);
    setNewFrom(queries.length);
    setFlashOn(true);
    window.setTimeout(() => setFlashOn(false), 600);
    window.setTimeout(() => setNewFrom(null), 1000);
    setQueries((prev) => [...prev, ...added]);
    toast.success(
      fresh.length > room ? `Added ${added.length} (30 max)` : `Added ${added.length} queries`,
    );
  }

  // ── Save ───────────────────────────────────────────────────────────────────
  function handleSave() {
    if (pending) return;
    // Client gate mirrors zod SaveSchema — a blocked save never hits the server.
    const urlErr = brandUrl.trim() ? urlProblem(brandUrl) : "Your site URL is required.";
    setUrlError(urlErr);
    if (urlErr || budgetErr || teamErr || weeksErr) {
      const firstInvalid = urlErr
        ? brandUrlRef.current
        : budgetErr
          ? budgetRef.current
          : teamErr
            ? teamRef.current
            : weeksRef.current;
      // Every gated field lives on the Business Context panel — surface it
      // first, then focus once the panel is visible again.
      setTab("business");
      requestAnimationFrame(() => firstInvalid?.focus());
      setShaking(true);
      window.setTimeout(() => setShaking(false), 250);
      return; // errors are already visible inline — no toast for client errors
    }
    startTransition(async () => {
      const kept = competitors
        .map((c, i) => ({ name: c.trim(), domain: competitorDomains[i] ?? "" }))
        .filter((c) => c.name);
      const res = await requests.action(owner => saveConfigAction({
        brandUrl,
        brandName: brandName || undefined,
        description: description || undefined,
        competitors: kept.map((c) => c.name),
        competitorDomains: kept.map((c) => c.domain),
        queries,
        budgetUsd: numOr(budget, 400),
        teamSize: Math.round(numOr(teamSize, 2)),
        timelineWeeks: Math.round(numOr(timelineWeeks, 8)),
        mode: mode === "self_serve" ? "self_serve" : "we_serve",
      }, owner));
      if (!res) return;
      if (!res.ok) {
        toast.error(res.error); // verbatim server error; dirty state kept
        return;
      }
      setSavedVersion(res.data.version);
      setSnapshot(
        snapshotOf({
          brandUrl,
          brandName,
          description,
          competitors,
          competitorDomains,
          queries,
          budget,
          teamSize,
          timelineWeeks,
        }),
      );
      setChipKey((k) => k + 1); // chip zoom-in to "Saved · vN"
      router.refresh();
    });
  }

  // Keep the latest save/dirty in a ref so global listeners never go stale.
  const latest = useRef({ save: handleSave, isDirty, pending });
  useEffect(() => {
    latest.current = { save: handleSave, isDirty, pending };
  });

  // Cmd/Ctrl+S → save when dirty; no-op otherwise.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        const { save, isDirty: dirty, pending: busy } = latest.current;
        if (dirty && !busy) save();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // beforeunload guard while dirty (in-app navigation is allowed in v1).
  useEffect(() => {
    if (!isDirty) return;
    function warn(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  // Bottom fade only when the query list actually overflows its well.
  useEffect(() => {
    const viewport = wellRef.current?.querySelector('[data-slot="scroll-area-viewport"]');
    setOverflowing(Boolean(viewport && viewport.scrollHeight > viewport.clientHeight + 1));
  }, [queries]);

  return (
    <>
      <style>{"@keyframes gc-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}"}</style>

      {/* A · Command bar — title · step progress · state chip · Save */}
      <header className="flex h-12 shrink-0 items-center justify-between">
        <div className="flex min-w-0 items-center">
          <h1 className="text-lg font-semibold tracking-tight">Configure</h1>
          <ol className="ml-4 flex items-center gap-1.5">
            {steps.map((done, i) => (
              <li
                key={i}
                className={cn("size-1.5 rounded-full", done ? "bg-aurora" : "bg-secondary")}
              />
            ))}
          </ol>
          <span className="ml-2 text-xs text-muted-foreground">
            {doneCount} of {steps.length} steps done
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span
            key={chipKey}
            className={cn(
              "animate-in fade-in zoom-in-95 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs duration-150",
              isDirty
                ? "border-warning/30 bg-warning/10 text-warning"
                : savedVersion !== null
                  ? "border-positive/30 bg-positive/10 text-positive"
                  : "border-border bg-secondary text-muted-foreground",
            )}
          >
            {isDirty ? (
              <>
                <span className="size-1.5 animate-pulse rounded-full bg-warning" aria-hidden />
                Unsaved changes
              </>
            ) : savedVersion !== null ? (
              <>
                <Check className="size-3.5" />
                Saved · <span className="font-mono tabular-nums">v{savedVersion}</span>
              </>
            ) : (
              "Not saved yet"
            )}
          </span>
          <Button
            type="button"
            onClick={handleSave}
            disabled={pending || !isDirty}
            style={shaking ? { animation: "gc-shake 0.2s" } : undefined}
            className={cn(
              "h-9 min-w-24 rounded-full px-5 text-sm font-medium transition",
              isDirty
                ? "bg-aurora text-white shadow-none hover:brightness-110 active:scale-[0.98]"
                : "bg-transparent text-muted-foreground opacity-40 shadow-none",
            )}
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {pending ? "Saving…" : !isDirty && savedVersion !== null ? "Saved" : "Save"}
          </Button>
        </div>
      </header>

      {/* B · Rail + panels — the left rail is primary navigation between the
          Business Context and Platform surfaces, inside the viewport frame. */}
      <div className="flex flex-1 flex-col gap-3 lg:min-h-0 lg:flex-row lg:gap-4">
        {/* B0 · Navigation rail — a compact tab-switcher panel hugging the top-left,
            switching between Business Context and Platform. */}
        <aside
          aria-label="Configuration sections"
          className="flex shrink-0 flex-col gap-3 lg:w-[168px]"
        >
          <div className={cn(TIER1, "flex flex-col gap-1 p-2")}>
            {(
              [
                {
                  id: "business" as const,
                  label: "Business Context",
                  caption: "Brand · competitors · queries",
                  icon: Briefcase,
                },
                {
                  id: "platform" as const,
                  label: "Platform",
                  caption: mode === "self_serve" ? "Self Serve · your keys" : "We Serve · our keys",
                  icon: ServerCog,
                },
              ]
            ).map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-current={active ? "true" : undefined}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition",
                    active
                      ? "border-transparent bg-aurora text-white shadow-none"
                      : "border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{t.label}</span>
                    <span
                      className={cn(
                        "block truncate text-[10px]",
                        active ? "text-white/75" : "text-muted-foreground/70",
                      )}
                    >
                      {t.caption}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

      {/* B1–B3 · Business Context panel — three Tier-1 columns, reading order =
          step order. Kept mounted (hidden via display) so field refs, focus
          targets and internal scroll state survive tab switches. */}
      <div
        className={
          tab === "business"
            ? "grid flex-1 grid-cols-1 gap-4 lg:min-h-0 lg:grid-cols-12 lg:items-stretch"
            : "hidden"
        }
      >
        {/* B1 · Step 1 — Brand & plan */}
        <section className={cn(TIER1, "flex h-full flex-col gap-4 p-5 lg:col-span-4")}>
          <CardHead
            icon={Globe}
            num="01"
            title="Brand & plan"
            done={steps[0]}
            hint="Citations tracked for your site · budget, team and duration bound what plan is possible."
          />
          <div className="space-y-4">
            <div>
              <label htmlFor="brandUrl" className={MICRO_LABEL}>
                Brand URL <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <Input
                  id="brandUrl"
                  ref={brandUrlRef}
                  maxLength={300}
                  placeholder="acme.com"
                  value={brandUrl}
                  aria-invalid={urlError ? true : undefined}
                  aria-describedby="brandUrl-status"
                  className={cn(FIELD, "pr-8")}
                  onChange={(e) => {
                    setBrandUrl(e.target.value);
                    // Error clears the keystroke it becomes valid — never lags.
                    if (urlError) {
                      setUrlError(
                        e.target.value.trim()
                          ? urlProblem(e.target.value)
                          : "Your site URL is required.",
                      );
                    }
                  }}
                  onBlur={() => setUrlError(brandUrl.trim() ? urlProblem(brandUrl) : null)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      brandNameRef.current?.focus();
                    }
                  }}
                />
                {urlError ? (
                  <AlertCircle className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-destructive" />
                ) : urlValid ? (
                  <Check className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-positive" />
                ) : null}
              </div>
              {/* Fixed-height status line — zero layout shift. */}
              <p
                id="brandUrl-status"
                className={cn(
                  "mt-1 h-4 truncate text-[11px]",
                  urlError
                    ? "text-destructive"
                    : urlValid
                      ? "text-muted-foreground"
                      : "text-muted-foreground/70",
                )}
              >
                {urlError ? (
                  urlError
                ) : urlValid && host ? (
                  <>
                    Tracking citations to <span className="text-foreground">{host}</span>
                  </>
                ) : (
                  "e.g. acme.com — we derive your owned domains from it"
                )}
              </p>
            </div>

            <div>
              <label htmlFor="brandName" className={MICRO_LABEL}>
                Brand name
              </label>
              <Input
                id="brandName"
                ref={brandNameRef}
                maxLength={120}
                placeholder="Acme"
                value={brandName}
                className={FIELD}
                onChange={(e) => setBrandName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    descriptionRef.current?.focus();
                  }
                }}
              />
              <p className="mt-1 h-4 text-[11px] text-muted-foreground">
                Defaults to your domain name if blank.
              </p>
            </div>

            <div>
              <label htmlFor="description" className={MICRO_LABEL}>
                What you do
              </label>
              <Textarea
                id="description"
                ref={descriptionRef}
                rows={2}
                maxLength={1000}
                placeholder="Issue tracking for modern software teams"
                value={description}
                className="h-14 min-h-0 resize-none rounded-xl border-border bg-secondary text-sm placeholder:text-muted-foreground/50 focus-visible:ring-2 focus-visible:ring-primary/50"
                onChange={(e) => setDescription(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    (
                      document.getElementById("suggest-competitors") as HTMLButtonElement | null
                    )?.focus();
                  }
                }}
              />
              <div className="mt-1 flex h-4 items-baseline justify-between gap-2 text-[11px]">
                <span className="truncate text-muted-foreground">
                  One line. Sharpens AI-generated competitors and queries.
                </span>
                {description.length > 900 && (
                  <span className="shrink-0 text-warning tabular-nums">
                    {description.length}/1000
                  </span>
                )}
              </div>
            </div>

            {/* Plan constraints live with the brand — the agentic flow uses
                budget, team and duration to bound what plan is possible. */}
            <div className={cn(TIER2, "p-3")}>
              <div className={MICRO_LABEL}>Plan constraints</div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label
                    htmlFor="budget"
                    className={cn(
                      "mb-1 flex h-4 items-center gap-1 text-[10px] font-medium uppercase tracking-[0.08em]",
                      budgetErr ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    <DollarSign className="h-3 w-3" /> Budget $
                  </label>
                  <Input
                    id="budget"
                    ref={budgetRef}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={1000000}
                    step={100}
                    aria-invalid={budgetErr ? true : undefined}
                    value={budget}
                    className={cn(FIELD, "text-sm tabular-nums")}
                    onChange={(e) => setBudget(e.target.value)}
                    onBlur={() => setBudget((v) => clampOnBlur(v, 0, 1_000_000, 400))}
                  />
                </div>
                <div>
                  <label
                    htmlFor="team"
                    className={cn(
                      "mb-1 flex h-4 items-center gap-1 text-[10px] font-medium uppercase tracking-[0.08em]",
                      teamErr ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    <Users className="h-3 w-3" /> Team
                  </label>
                  <Input
                    id="team"
                    ref={teamRef}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={100}
                    step={1}
                    aria-invalid={teamErr ? true : undefined}
                    value={teamSize}
                    className={cn(FIELD, "text-sm tabular-nums")}
                    onChange={(e) => setTeamSize(e.target.value)}
                    onBlur={() => setTeamSize((v) => clampOnBlur(v, 1, 100, 2))}
                  />
                </div>
                <div>
                  <label
                    htmlFor="timeline"
                    className={cn(
                      "mb-1 flex h-4 items-center gap-1 text-[10px] font-medium uppercase tracking-[0.08em]",
                      weeksErr ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    <CalendarClock className="h-3 w-3" /> Weeks
                  </label>
                  <Input
                    id="timeline"
                    ref={weeksRef}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={104}
                    step={1}
                    aria-invalid={weeksErr ? true : undefined}
                    value={timelineWeeks}
                    className={cn(FIELD, "text-sm tabular-nums")}
                    onChange={(e) => setTimelineWeeks(e.target.value)}
                    onBlur={() => setTimelineWeeks((v) => clampOnBlur(v, 1, 104, 8))}
                  />
                </div>
              </div>
              {/* Derived capacity readout — assumption pinned in UI, not a tooltip. */}
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-[11px]">
                  {planErr ? (
                    <span className="text-destructive">{planErr}</span>
                  ) : (
                    <span className="text-muted-foreground/70 tabular-nums">
                      {teamN} people × {weeksN} wks × ~25 hrs/wk
                    </span>
                  )}
                </p>
                <p className="shrink-0 text-[11px] text-muted-foreground">
                  ≈{" "}
                  <span
                    key={hours}
                    className="animate-in fade-in zoom-in-95 text-sm font-semibold text-aurora tabular-nums duration-200"
                  >
                    {hours.toLocaleString("en-US")}
                  </span>{" "}
                  person-hrs
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* B2 · Step 2 — Competitors */}
        <section className={cn(TIER1, "flex h-full flex-col gap-3 p-5 lg:col-span-4")}>
          <CardHead
            icon={Swords}
            num="02"
            title="Competitors"
            done={steps[1]}
            hint={`Up to ${cap} rivals we score AI share-of-voice against.`}
            badge={
              <span
                className={cn(
                  TIER3,
                  "ml-auto px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground tabular-nums",
                )}
              >
                {filledCompetitors}/{cap}
              </span>
            }
          />
          <div>
            <Button
              id="suggest-competitors"
              type="button"
              variant="ghost"
              className={AI_BTN}
              disabled={prepared || !urlValid || discovering}
              onClick={onSuggestCompetitors}
            >
              {discovering ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
              {discovering ? "Finding competitors…" : "Suggest with AI"}
            </Button>
            {/* Static gate caption — never a tooltip, never a dead-click toast. */}
            <p className="mt-1 min-h-4 text-[11px] text-muted-foreground">
              {assistanceHint || (!urlValid ? "Add your site in step 1 to enable." : "")}
            </p>
          </div>

          <div className="space-y-2">
            {competitors.map((c, i) => (
              <div key={i}>
                <div
                  className={cn(
                    "group relative flex items-center gap-2",
                    staggerFrom !== null &&
                      i >= staggerFrom &&
                      "animate-in fade-in slide-in-from-left-1",
                  )}
                  style={
                    staggerFrom !== null && i >= staggerFrom
                      ? {
                          animationDelay: `${(i - staggerFrom) * 150}ms`,
                          animationFillMode: "backwards",
                        }
                      : undefined
                  }
                >
                  <span className="w-4 text-right text-[11px] text-muted-foreground/60 tabular-nums">
                    {i + 1}
                  </span>
                  <Input
                    ref={(el) => {
                      compRefs.current[i] = el;
                    }}
                    value={c}
                    maxLength={300}
                    aria-label={`Competitor ${i + 1}`}
                    placeholder={COMPETITOR_PLACEHOLDERS[i] ?? "Competitor name or URL"}
                    className={cn(FIELD, "flex-1 pr-20")}
                    onChange={(e) => setCompetitor(i, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      if (i === competitors.length - 1 && competitors.length < cap) {
                        addCompetitor();
                        requestAnimationFrame(() => compRefs.current[i + 1]?.focus());
                      } else {
                        compRefs.current[i + 1]?.focus();
                      }
                    }}
                  />
                  {competitorDomains[i] ? (
                    <span
                      className={cn(
                        TIER3,
                        "pointer-events-none absolute top-1/2 right-11 max-w-[90px] -translate-y-1/2 truncate px-1.5 py-0.5 text-[10px] text-muted-foreground",
                      )}
                    >
                      {competitorDomains[i]}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => removeCompetitor(i)}
                    aria-label="Remove competitor"
                    className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-secondary hover:text-destructive focus-visible:opacity-100"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
                {isDupe(i) && (
                  <p className="mt-1 pl-6 text-[11px] text-destructive">Already in your list.</p>
                )}
              </div>
            ))}
          </div>

          {competitors.length < cap ? (
            <button
              type="button"
              onClick={addCompetitor}
              className="flex h-8 items-center gap-1.5 self-start text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <Plus className="size-3.5" />
              Add competitor
            </button>
          ) : (
            <p className="flex h-8 items-center text-[11px] text-muted-foreground">
              Limit reached — remove one to add another.
            </p>
          )}
        </section>

        {/* B3 · Step 3 — Buyer queries (the page's ONLY scrollable region) */}
        <section
          className={cn(TIER1, "flex h-full flex-col gap-3 p-5 lg:col-span-4 lg:min-h-0")}
        >
          <CardHead
            icon={MessagesSquare}
            num="03"
            title="Buyer queries"
            done={steps[2]}
            hint="Prompts we ask ChatGPT-style panels. 5–10 focused queries beat 30 broad ones."
            badge={
              <span
                className={cn(
                  TIER3,
                  "ml-auto px-1.5 py-0.5 font-mono text-[10px] tabular-nums",
                  queries.length >= 30 ? "text-warning" : "text-muted-foreground",
                )}
              >
                {queries.length}/30
              </span>
            }
          />
          <div>
            <Button
              type="button"
              variant="ghost"
              className={AI_BTN}
              disabled={prepared || !canGenerate || suggesting}
              onClick={onGenerateQueries}
            >
              {suggesting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {suggesting ? "Generating…" : "Generate from brand"}
            </Button>
            <p className="mt-1 min-h-4 text-[11px] text-muted-foreground">
              {assistanceHint || (!canGenerate ? "Needs step 1 first." : "")}
            </p>
          </div>

          {/* Tier-2 recessed well wrapping the internal ScrollArea. */}
          <div ref={wellRef} className={cn(TIER2, "relative min-h-40 flex-1 lg:min-h-0")}>
            <ScrollArea className="h-full px-2 py-1.5">
              {queries.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-1.5 px-4 text-center">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <p className="text-sm text-muted-foreground">No queries yet</p>
                  <p className="text-[11px] text-muted-foreground/70">
                    Generate from your brand above, or type one below.
                  </p>
                </div>
              ) : (
                <ul className="space-y-0.5">
                  {queries.map((q, i) => (
                    <li
                      key={`${i}-${q}`}
                      className={cn(
                        "group flex items-start justify-between gap-2 rounded-lg px-2 py-1.5 text-sm leading-snug transition-colors hover:bg-secondary",
                        newFrom !== null &&
                          i >= newFrom &&
                          "animate-in fade-in slide-in-from-bottom-1 duration-300",
                        flashOn && newFrom !== null && i >= newFrom && "bg-primary/10",
                      )}
                    >
                      <span className="line-clamp-2 min-w-0">{q}</span>
                      <button
                        type="button"
                        onClick={() => removeQuery(i)}
                        aria-label="Remove query"
                        className="mt-0.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
                      >
                        <X className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
            {overflowing && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 rounded-b-xl bg-background/80" />
            )}
          </div>

          {/* Composer — Enter is the affordance; ↵ keycap teaches it. */}
          <div className="shrink-0">
            <div className="relative">
              <Input
                value={newQuery}
                maxLength={400}
                placeholder="best issue tracker for startups"
                aria-label="Add a query"
                className={cn(FIELD, "pr-9", composerFlash && "border-warning")}
                onChange={(e) => {
                  setNewQuery(e.target.value);
                  setComposerMsg(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addQuery(); // add, clear, keep focus — rapid entry
                  } else if (e.key === "Backspace" && !newQuery) {
                    setQueries((prev) => prev.slice(0, -1)); // chip-input convention
                  }
                }}
              />
              {newQuery && (
                <span
                  aria-hidden
                  className="absolute top-1/2 right-3 -translate-y-1/2 rounded border border-border px-1 text-[10px] text-muted-foreground/50"
                >
                  ↵
                </span>
              )}
            </div>
            <p className="mt-1 h-4 text-[11px] text-warning">{composerMsg ?? ""}</p>
          </div>
        </section>
      </div>

        {/* C · Platform panel — three first-class option cards. May scroll
            internally at lg; the page itself never scrolls. */}
        <div className={tab === "platform" ? "min-h-0 flex-1 lg:overflow-y-auto" : "hidden"}>
          <ConfigurePlatform mode={mode} onModeChange={setMode} />
        </div>
      </div>
    </>
  );
}
