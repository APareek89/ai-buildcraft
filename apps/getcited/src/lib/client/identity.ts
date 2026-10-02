// Capture identity before asynchronous work; never infer it after a response arrives.
// Server ownership checks remain authoritative. This fence prevents old work from
// appearing after a cookie/account change, including response bodies and streams.
export class Identity {
  owner: string | null = null;
  generation = 0;
  controllers = new Set<AbortController>();
  accept(owner: string | null, force = false) {
    if (force || owner !== this.owner) {
      this.owner = owner; this.generation++;
      for (const controller of this.controllers) controller.abort();
      this.controllers.clear();
    }
  }
  capture() { return { owner: this.owner, generation: this.generation }; }
  current(ticket: ReturnType<Identity['capture']>) { return ticket.owner === this.owner && ticket.generation === this.generation; }
}
export class StaleResponse extends Error { constructor() { super('Account changed. Please sign in again.'); } }
export function ownerHeaders(owner: string, csrf: string, method: string) {
  return { 'X-GetCited-Owner': owner, ...(!['GET', 'HEAD'].includes(method.toUpperCase()) ? { 'X-GetCited-CSRF': csrf } : {}) };
}
export function isSessionFailure(value: unknown) {
  if (!value || typeof value !== 'object') return false;
  const e = value as { code?: string; type?: string; error?: string };
  return ['AUTH_REQUIRED', 'SESSION_CHANGED', 'session_expired', 'authentication_required'].some(code => e.code === code || e.type === code || e.error === code);
}
// AI SDK receives a guarded stream, rather than a fetch-only check which loses
// ownership while its reader is still consuming. Expiry stops the current chunk.
export function fenceResponse(response: Response, current: () => boolean, expire: () => void, complete = () => {}) {
  if (!current()) throw new StaleResponse();
  if (!response.body) { complete(); return response; }
  const reader = response.body.getReader(); const decoder = new TextDecoder(); const encoder = new TextEncoder();
  const sse = response.headers.get('content-type')?.includes('text/event-stream');
  let buffer = ''; let finished = false;
  const finish = async () => { if (finished) return; finished = true; await reader.cancel().catch(() => {}); reader.releaseLock(); complete(); };
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        // A transport chunk can contain only part of an SSE frame. Keep reading
        // until there is output, rather than leaving the consumer waiting forever.
        while (true) {
          if (!current()) throw new StaleResponse();
          const { done, value } = await reader.read();
          if (!current()) throw new StaleResponse();
          let emitted = false;
          if (sse) {
            buffer = (buffer + decoder.decode(value, { stream: !done })).replace(/\r\n/g, '\n');
            if (buffer.length > 1048576) throw new Error('Stream frame too large.');
            let boundary: number;
            while ((boundary = buffer.indexOf('\n\n')) >= 0) {
              const block = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
              let event: unknown;
              const data = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n');
              try { event = JSON.parse(data); } catch { /* SSE comments / terminal marker */ }
              if (!current()) throw new StaleResponse();
              if (isSessionFailure(event)) { expire(); throw new StaleResponse(); }
              controller.enqueue(encoder.encode(block + '\n\n')); emitted = true;
            }
            if (done && buffer.trim()) throw new Error('Incomplete stream response.');
          } else if (value) { controller.enqueue(value); emitted = true; }
          if (done) { await finish(); controller.close(); return; }
          if (emitted) return;
        }
      } catch (error) { await finish(); controller.error(error); }
    },
    cancel() { return finish(); },
  });
  const headers = new Headers(response.headers); headers.delete('content-length'); headers.delete('content-encoding');
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}
export async function guardedJSON<T>(response: Response, current: () => boolean): Promise<T> {
  const value = await response.json(); if (!current()) throw new StaleResponse(); return value as T;
}
export async function guardedBlob(response: Response, current: () => boolean) {
  const value = await response.blob(); if (!current()) throw new StaleResponse(); return value;
}
export function safeNext(value: string | null) { return value?.startsWith('/') && !value.startsWith('//') && !value.includes('\\') ? value : '/configure'; }
