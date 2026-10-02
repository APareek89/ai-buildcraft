"use client";
import { useState } from 'react';
import { toast } from 'sonner';
import { useAccount, useRequests } from '@/components/account/account-provider';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { MeasureOutput } from '@/lib/geo/types';
import { getSessionKeys } from '@/lib/session-keys';

type ProbeResult = MeasureOutput & { extraction_method: string; report: { answers: { model: string; prompt: string; raw_answer: string; mentions: string[]; cited_domains: string[] }[] } };
export function ProbePanel() {
  const account = useAccount(); const requests = useRequests();
  const [prompt, setPrompt] = useState(''); const [busy, setBusy] = useState(false); const [result, setResult] = useState<ProbeResult | null>(null);
  const model = account.session?.models?.probeDefault ?? 'openai';
  async function run() {
    if (!prompt.trim() || busy) return;
    const ticket = requests.capture(); if (!requests.current(ticket)) return;
    const keys = getSessionKeys(ticket.owner!); setBusy(true); setResult(null);
    try { const data = await requests.request<ProbeResult>('/api/benchmark', 'POST', { prompt: prompt.trim(), model, ...(Object.keys(keys).length ? { keys } : {}) }); if (requests.current(ticket)) setResult(data); }
    catch (error) { if (requests.current(ticket)) toast.error(error instanceof Error ? error.message : 'Probe failed. Please retry when ready.'); }
    finally { if (requests.current(ticket)) setBusy(false); }
  }
  return <details className="rounded-xl border border-border bg-card p-4">
    <summary className="text-sm font-medium">Run a single-response probe</summary>
    <div className="mt-3 space-y-3">
      <p className="text-xs text-muted-foreground">Save your brand and competitors in Configure first. This calls the configured model once and records its answer. It does not search the web.</p>
      <label className="block text-xs font-medium" htmlFor="probe-prompt">Buyer question</label>
      <Textarea id="probe-prompt" value={prompt} onChange={e => setPrompt(e.target.value)} maxLength={2000} disabled={busy} placeholder="Which team collaboration tools would you compare for a small design agency?" />
      <div className="flex flex-wrap items-center gap-3"><Button onClick={() => void run()} disabled={busy || !prompt.trim()} aria-busy={busy}>{busy ? 'Running probe…' : 'Run probe'}</Button><span className="text-xs text-muted-foreground">{account.session?.models?.probe?.find(item => item.id === model)?.label ?? 'Configured model'} · uses provider allowance</span></div>
      {result && <section className="space-y-3" aria-label="Probe result">
        <p className="text-xs text-muted-foreground">One response · directional only · estimated ${result.cost_usd.toFixed(6)}. Share of voice is each brand’s answer mentions divided by total mentions across tracked brands.</p>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left"><th className="py-2">Tracked brand</th><th>Mentions</th><th>Share</th></tr></thead><tbody>{result.share_of_voice.map(row => <tr key={row.brand} className="border-t border-border"><td className="py-2">{row.brand}</td><td>{row.mentions}</td><td>{Math.round(row.sov * 100)}%</td></tr>)}</tbody></table></div>
        {result.report.answers.map((answer, index) => <div key={index} className="space-y-2 rounded-lg border border-border p-3"><div className="text-xs text-muted-foreground">{answer.model} · recorded answer</div><p className="whitespace-pre-wrap text-sm">{answer.raw_answer}</p>{answer.cited_domains.length > 0 && <p className="text-xs text-muted-foreground">Unverified domain mentions: {answer.cited_domains.join(', ')}</p>}</div>)}
        <p className="text-xs text-muted-foreground">Literal brand and domain matching does not validate sources or measure the current AI-search market.</p>
      </section>}
    </div>
  </details>;
}
