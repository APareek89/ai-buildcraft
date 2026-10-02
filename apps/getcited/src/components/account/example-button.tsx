"use client";
import { useState } from 'react';
import { Loader2, Play } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useRequests } from './account-provider';
export function ExampleButton() {
  const requests = useRequests(); const [busy, setBusy] = useState(false);
  async function open() {
    const ticket = requests.capture(); setBusy(true);
    try { const result = await requests.request<{ threadId: string }>('/api/examples', 'POST', { id: 'team-tools' }); if (!requests.current(ticket)) return; window.location.replace('/assistant?thread=' + encodeURIComponent(result.threadId)); }
    catch (error) { if (requests.current(ticket)) toast.error(error instanceof Error ? error.message : 'Example could not be opened.'); }
    finally { if (requests.current(ticket)) setBusy(false); }
  }
  return <Button onClick={() => void open()} disabled={busy} aria-busy={busy} aria-live="polite">{busy ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}{busy ? 'Preparing example…' : 'Try with an example · Free'}</Button>;
}
