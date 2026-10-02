"use client";
import { useCallback, useEffect, useState } from 'react';
import { useRequests } from '@/components/account/account-provider';
import { PreparedNotice } from '@/components/account/prepared-notice';
import type { FullReport } from '@/lib/geo/report';

/** Read-only persisted evidence; loading this panel never starts a benchmark. */
export function SavedReport() {
  const currentRequests = useRequests(); const [requests] = useState(() => currentRequests);
  const [report, setReport] = useState<FullReport | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(false);
  const load = useCallback(async () => {
    const ticket = requests.capture(); setLoading(true); setError(false);
    try { const data = await requests.request<{report:FullReport|null}>('/api/reports/latest'); if (requests.current(ticket)) setReport(data.report); }
    catch { if (requests.current(ticket)) setError(true); }
    finally { if (requests.current(ticket)) setLoading(false); }
  }, [requests]);
  useEffect(() => {
    // This read restores external persisted evidence after the account gate opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  if (loading) return <div className="text-xs text-muted-foreground" role="status">Loading the saved report…</div>;
  if (error) return <div className="text-sm" role="alert">Saved report unavailable. <button className="underline" onClick={() => void load()}>Retry</button></div>;
  if (!report) return null;
  return <section className="space-y-3 rounded-xl border border-border bg-card p-5" aria-label="Latest saved report">
    <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-sm font-semibold">Latest saved report · {report.brand}</h2><span className="text-xs text-muted-foreground">{new Date(report.created_at).toLocaleString()}</span></div>
    <PreparedNotice prepared={report.prepared} />
    <p className="text-xs text-muted-foreground">{report.prepared ? 'Prepared example' : 'Recorded model response'} · {report.panel.join(', ')} · {report.answers.length} answer{report.answers.length === 1 ? '' : 's'} · estimated ${report.cost_usd.toFixed(6)}</p>
    <details>
      <summary className="text-sm font-medium">Read {report.answers.length} recorded answer{report.answers.length === 1 ? '' : 's'}</summary>
      <div className="mt-3 space-y-3">{report.answers.map((answer,index) => <article key={index} className="space-y-2 rounded-lg border border-border p-3">
        <h3 className="text-sm font-medium">{answer.prompt}</h3><p className="text-xs text-muted-foreground">{answer.model}</p>
        <p className="whitespace-pre-wrap break-words text-sm">{answer.raw_answer}</p>
        <p className="text-xs text-muted-foreground">Tracked mentions: {answer.mentions.join(', ') || 'None'}</p>
        {answer.cited_domains.length > 0 && <p className="break-words text-xs text-muted-foreground">Unverified domain mentions: {answer.cited_domains.join(', ')}</p>}
      </article>)}</div>
    </details>
    <p className="text-xs text-muted-foreground">Deterministic literal matching does not validate sources. A single ungrounded answer is directional evidence, not current AI-search market coverage.</p>
  </section>;
}
