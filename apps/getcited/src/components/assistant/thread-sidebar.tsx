"use client";

import { MessageSquarePlus, Trash2, MessagesSquare } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ThreadItem {
  id: string;
  prepared?: boolean;
  title: string;
  updatedAt: string;
}

export function ThreadSidebar({
  threads,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: {
  threads: ThreadItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-background/40 lg:flex">
      <div className="flex items-center justify-between px-3 py-3">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <MessagesSquare className="h-3.5 w-3.5" /> Threads
        </span>
        <button
          type="button"
          onClick={onNew}
          className="flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-foreground hover:bg-secondary"
        >
          <MessageSquarePlus className="h-3 w-3" /> New
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-0.5 overflow-auto px-2 pb-3">
        {threads.length === 0 && (
          <p className="px-2 pt-2 text-xs text-muted-foreground">
            No threads yet — your conversations are saved here.
          </p>
        )}
        {threads.map((t) => (
          <div
            key={t.id}
            className={cn(
              "group flex items-center gap-1 rounded-lg px-2 py-1.5",
              activeId === t.id ? "bg-primary/10" : "hover:bg-secondary/70",
            )}
          >
            <button
              type="button"
              onClick={() => onSelect(t.id)}
              className="min-w-0 flex-1 text-left"
            >
              <span
                className={cn(
                  "block truncate text-xs",
                  activeId === t.id ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {t.title}{t.prepared ? " · Prepared" : ""}
              </span>
              <span className="block text-[10px] text-muted-foreground/60">
                {new Date(t.updatedAt).toLocaleDateString()}
              </span>
            </button>
            {!t.prepared && <button
              type="button"
              onClick={() => onDelete(t.id)}
              className="hidden shrink-0 text-muted-foreground hover:text-danger group-hover:block"
              aria-label="Delete thread"
            >
              <Trash2 className="h-3 w-3" />
            </button>}
          </div>
        ))}
      </div>
    </aside>
  );
}
