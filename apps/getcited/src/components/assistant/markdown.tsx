"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Markdown renderer for agent output — dark-tuned typography, GFM tables,
 * tight spacing so answers read like a well-formatted doc, not a wall of text.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div
      className="prose dark:prose-invert max-w-none prose-headings:font-semibold prose-headings:tracking-tight
        prose-h1:text-xl prose-h2:mt-5 prose-h2:mb-2 prose-h2:text-base prose-h3:mt-4 prose-h3:mb-1.5 prose-h3:text-sm
        prose-p:my-2 prose-p:leading-relaxed prose-li:my-0.5 prose-ul:my-2 prose-ol:my-2
        prose-strong:text-foreground prose-a:text-primary prose-a:no-underline hover:prose-a:underline
        prose-code:rounded prose-code:bg-secondary prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.85em]
        prose-code:before:content-none prose-code:after:content-none
        prose-pre:my-3 prose-pre:rounded-lg prose-pre:border prose-pre:border-border prose-pre:bg-secondary/60
        prose-table:block prose-table:overflow-x-auto prose-table:my-3 prose-th:border-b prose-th:border-border prose-th:px-2.5 prose-th:py-1.5 prose-th:text-left prose-th:text-xs prose-th:font-medium prose-th:text-muted-foreground
        prose-td:border-b prose-td:border-border/60 prose-td:px-2.5 prose-td:py-1.5 prose-td:text-sm
        prose-hr:my-4 prose-hr:border-border prose-blockquote:border-l-primary/50 prose-blockquote:text-muted-foreground
        text-sm text-foreground"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
