"use client";
import { useState } from 'react';
import { useRequests } from './account-provider';
export function ReportDownload({ planId, format, children, className, title }: { planId: string; format: string; children: React.ReactNode; className?: string; title?: string }) {
  const requests = useRequests(); const [busy, setBusy] = useState(false);
  return <button title={title} type="button" className={className} disabled={busy} aria-busy={busy} onClick={async () => { const ticket = requests.capture(); setBusy(true); await requests.download(`/api/report/plan/${encodeURIComponent(planId)}?format=${encodeURIComponent(format)}`, `getcited-plan.${format}`); if (requests.current(ticket)) setBusy(false); }}>{busy ? 'Preparing…' : children}</button>;
}
