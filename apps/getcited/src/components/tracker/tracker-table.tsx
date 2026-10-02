"use client";
import { useRequests } from "@/components/account/account-provider";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { TrackerItemView, TrackerStatus } from "@/lib/db/tracker";
import { updateTrackerItemAction } from "@/app/(app)/tracker/actions";

const STATUS_OPTIONS: { id: TrackerStatus; label: string }[] = [
  { id: "not_started", label: "Not started" },
  { id: "in_progress", label: "In progress" },
  { id: "done", label: "Done" },
  { id: "blocked", label: "Blocked" },
];

const STATUS_STYLE: Record<TrackerStatus, string> = {
  not_started: "border-border text-muted-foreground",
  in_progress: "border-primary/50 text-primary",
  done: "border-positive/50 text-positive",
  blocked: "border-danger/50 text-danger",
};

/** Editable execution table: status dropdown + inline remarks, saved per change. */
export function TrackerTable({ initialItems }: { initialItems: TrackerItemView[] }) {
  const requests = useRequests();
  const [items, setItems] = useState(initialItems);
  const [, startTransition] = useTransition();
  const today = new Date().toISOString().slice(0, 10);

  function patchLocal(id: string, patch: Partial<TrackerItemView>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function saveStatus(id: string, status: TrackerStatus, prev: TrackerStatus) {
    patchLocal(id, { status });
    startTransition(async () => {
      const res = await requests.action(owner => updateTrackerItemAction({ id, status }, owner));
      if (!res) return;
      if (!res.ok) {
        patchLocal(id, { status: prev });
        toast.error(res.error);
      }
    });
  }

  function saveRemarks(id: string, remarks: string, prev: string | null) {
    if (remarks === (prev ?? "")) return;
    patchLocal(id, { remarks });
    startTransition(async () => {
      const res = await requests.action(owner => updateTrackerItemAction({ id, remarks }, owner));
      if (!res) return;
      if (!res.ok) {
        patchLocal(id, { remarks: prev });
        toast.error(res.error);
      }
    });
  }

  const weeks = Array.from(new Set(items.map((i) => i.week))).sort((a, b) => a - b);

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[860px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2.5 font-medium">Wk</th>
            <th className="px-3 py-2.5 font-medium">Due</th>
            <th className="px-3 py-2.5 font-medium">Action</th>
            <th className="px-3 py-2.5 font-medium">Owner</th>
            <th className="px-3 py-2.5 text-right font-medium">Hrs</th>
            <th className="px-3 py-2.5 font-medium">Deliverable</th>
            <th className="px-3 py-2.5 font-medium">Status</th>
            <th className="px-3 py-2.5 font-medium">Remarks</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) =>
            items
              .filter((i) => i.week === week)
              .map((i, idx) => {
                const overdue = i.status !== "done" && i.dueDate < today;
                return (
                  <tr key={i.id} className="border-b border-border/60 last:border-b-0 hover:bg-secondary/30">
                    <td className="px-3 py-2 text-muted-foreground">{idx === 0 ? week : ""}</td>
                    <td className={cn("whitespace-nowrap px-3 py-2 text-xs", overdue ? "text-warning" : "text-muted-foreground")}>
                      {i.dueDate}
                      {overdue && <span className="ml-1.5 rounded-full border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[9px] uppercase">late</span>}
                    </td>
                    <td className="min-w-[220px] px-3 py-2">{i.action}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{i.ownerRole ?? "—"}</td>
                    <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                      {i.hours != null ? Math.round(i.hours) : "—"}
                    </td>
                    <td className="min-w-[160px] px-3 py-2 text-xs text-muted-foreground">{i.deliverable ?? "—"}</td>
                    <td className="px-3 py-2">
                      <select
                        value={i.status}
                        onChange={(e) => saveStatus(i.id, e.target.value as TrackerStatus, i.status)}
                        className={cn(
                          "rounded-md border bg-background px-2 py-1 text-xs outline-none focus:border-ring",
                          STATUS_STYLE[i.status],
                        )}
                        aria-label="Item status"
                      >
                        {STATUS_OPTIONS.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="min-w-[200px] px-3 py-2">
                      <input
                        type="text"
                        defaultValue={i.remarks ?? ""}
                        placeholder="Add a remark…"
                        aria-label="Item remarks"
                        maxLength={2000}
                        onBlur={(e) => saveRemarks(i.id, e.target.value.trim(), i.remarks)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        }}
                        className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/50 hover:border-border focus:border-ring focus:outline-none"
                      />
                    </td>
                  </tr>
                );
              }),
          )}
        </tbody>
      </table>
    </div>
  );
}
