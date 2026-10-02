"use client";

import { useState } from "react";
import { Copy, Check, Download, FileText } from "lucide-react";
import { Markdown } from "./markdown";

export interface ContentOutput {
  type: string;
  topic: string;
  markdown: string;
}

/** Renders generate_content output: ready-to-publish markdown + copy/download. */
export function ContentResult({ data }: { data: ContentOutput }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(data.markdown).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function download() {
    const blob = new Blob([data.markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.type}-${data.topic.slice(0, 32).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <FileText className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          {data.type.replace(/_/g, " ")}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] hover:bg-secondary"
        >
          {copied ? <Check className="h-3 w-3 text-positive" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
        <button
          type="button"
          onClick={download}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] hover:bg-secondary"
        >
          <Download className="h-3 w-3" /> .md
        </button>
      </div>
      <div className="max-h-[420px] overflow-auto rounded-lg border border-border bg-background/50 p-3.5">
        <Markdown>{data.markdown}</Markdown>
      </div>
    </div>
  );
}
