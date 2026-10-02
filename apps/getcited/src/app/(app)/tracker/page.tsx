import { PreparedNotice } from "@/components/account/prepared-notice";
import { ListChecks, ArrowRight } from "lucide-react";
import { latestTrackedPlanItems } from "@/lib/db/tracker";
import { getPlanById } from "@/lib/db/plans";
import { ButtonLink } from "@/components/ui/button-link";
import { TrackerTable } from "@/components/tracker/tracker-table";

export const metadata = { title: "Tracker · GetCited" };

function pct(n: number | null | undefined) {
  return n == null ? "—" : `${Math.round(n * 100)}%`;
}

export default async function TrackerPage() {
  const tracked = await latestTrackedPlanItems();

  if (!tracked) {
    return (
      <div className="flex min-h-[70vh] flex-1 items-center justify-center p-6">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-card">
            <ListChecks className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Nothing tracked yet</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Build a plan in the GEO Agent (&ldquo;How can I improve?&rdquo;) and approve it into the
            Tracker — every roadmap action lands here with a real due date.
          </p>
          <ButtonLink href="/assistant" className="mt-6">
            Open the GEO Agent <ArrowRight className="h-4 w-4" />
          </ButtonLink>
        </div>
      </div>
    );
  }

  const plan = await getPlanById(tracked.planId);
  const done = tracked.items.filter((i) => i.status === "done").length;

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-5 py-5 md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Tracker</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Execution items from your approved plan
            {plan ? ` of ${new Date(plan.createdAt).toLocaleDateString()}` : ""} — update status and
            remarks; the GEO Agent reads this when you ask &ldquo;How am I progressing?&rdquo;.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-full border border-border bg-card px-2.5 py-1">
            {done}/{tracked.items.length} done
          </span>
          {plan?.targetCitationShare != null && (
            <span className="rounded-full border border-border bg-card px-2.5 py-1">
              target {pct(plan.targetCitationShare)}
            </span>
          )}
        </div>
      </div>

      <PreparedNotice prepared={plan?.prepared} />
      <TrackerTable initialItems={tracked.items} />
    </div>
  );
}
