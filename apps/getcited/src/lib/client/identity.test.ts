import { describe, expect, it, vi } from 'vitest';
import { Identity, StaleResponse, fenceResponse, guardedBlob, guardedJSON, ownerHeaders, safeNext } from './identity';
import { clearSessionKeys, getSessionKeys, setSessionKey } from '../session-keys';

describe('client account boundary', () => {
  it('invalidates in-flight A requests synchronously before the B session refresh', () => {
    const identity = new Identity(); identity.accept('A'); const ticket = identity.capture();
    const controller = new AbortController(); identity.controllers.add(controller);
    identity.accept(null, true);
    expect(identity.current(ticket)).toBe(false); expect(controller.signal.aborted).toBe(true);
    identity.accept('B'); expect(identity.current(ticket)).toBe(false);
  });
  it('keeps same-session work valid and sends the rendered owner on reads and writes', () => {
    const identity = new Identity(); identity.accept('A'); const ticket = identity.capture(); identity.accept('A');
    expect(identity.current(ticket)).toBe(true);
    expect(ownerHeaders('A','token','GET')).toEqual({'X-GetCited-Owner':'A'});
    expect(ownerHeaders('A','token','POST')).toEqual({'X-GetCited-Owner':'A','X-GetCited-CSRF':'token'});
  });
  it('rejects delayed JSON after the identity changes during body parsing', async () => {
    const identity = new Identity(); identity.accept('A'); const ticket = identity.capture();
    let resolve!: (value: unknown) => void;
    const response = {json: () => new Promise(done => { resolve = done; })} as Response;
    const pending = guardedJSON(response, () => identity.current(ticket)); identity.accept('B'); resolve({private:'A'});
    await expect(pending).rejects.toBeInstanceOf(StaleResponse);
  });
  it('rejects delayed export bytes after B signs in', async () => {
    const identity = new Identity(); identity.accept('A'); const ticket = identity.capture();
    let resolve!: (value: Blob) => void;
    const response = {blob: () => new Promise<Blob>(done => { resolve = done; })} as Response;
    const pending = guardedBlob(response, () => identity.current(ticket)); identity.accept('B'); resolve(new Blob(['A export']));
    await expect(pending).rejects.toBeInstanceOf(StaleResponse);
  });
  it('current-session SSE expiry terminates before a private frame in the same chunk', async () => {
    const identity = new Identity(); identity.accept('A'); const ticket = identity.capture(); const expired = vi.fn(() => identity.accept(null,true)); const cancelled = vi.fn(); const completed = vi.fn();
    const raw = new Response(new ReadableStream({start(c) {c.enqueue(new TextEncoder().encode('data: {"code":"SESSION_CHANGED"}\n\ndata: {"text":"private-after-expiry"}\n\n'));},cancel:cancelled}), {headers:{'content-type':'text/event-stream'}});
    await expect(fenceResponse(raw, () => identity.current(ticket), expired, completed).text()).rejects.toBeInstanceOf(StaleResponse);
    expect(expired).toHaveBeenCalledOnce(); expect(cancelled).toHaveBeenCalledOnce(); expect(completed).toHaveBeenCalledOnce();
  });
  it('old-session stream expiry cannot expire the new account', async () => {
    const identity = new Identity(); identity.accept('A'); const ticket = identity.capture(); const expired = vi.fn();
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    const raw = new Response(new ReadableStream({start(c){stream=c;}}), {headers:{'content-type':'text/event-stream'}});
    const pending = fenceResponse(raw, () => identity.current(ticket), expired).text();
    identity.accept('B'); stream.enqueue(new TextEncoder().encode('data: {"code":"AUTH_REQUIRED"}\n\n'));
    await expect(pending).rejects.toBeInstanceOf(StaleResponse); expect(expired).not.toHaveBeenCalled(); expect(identity.owner).toBe('B');
  });
  it('passes split SSE frames and terminal markers in order', async () => {
    const chunks=['data: {"type":"text-delta",','"delta":"ok"}\n\n','data: [DONE]\n\n'];
    const raw = new Response(new ReadableStream({start(c){for(const chunk of chunks)c.enqueue(new TextEncoder().encode(chunk));c.close();}}),{headers:{'content-type':'text/event-stream'}});
    expect(await fenceResponse(raw,()=>true,()=>{}).text()).toBe(chunks.join(''));
  });
  it('separates owner BYOK and never adopts a legacy shared entry; logout erases all tab keys', () => {
    const values = new Map<string,string>();
    const storage = new Proxy({getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)}, {ownKeys:()=>[...values.keys()],getOwnPropertyDescriptor:()=>({enumerable:true,configurable:true})});
    vi.stubGlobal('window',{sessionStorage:storage});
    try { storage.setItem('getcited_session_keys',JSON.stringify({openai:'legacy-fixture'})); expect(getSessionKeys('A')).toEqual({}); setSessionKey('A','openai','synthetic-A'); expect(getSessionKeys('B')).toEqual({}); expect(getSessionKeys('A').openai).toBe('synthetic-A'); clearSessionKeys(); expect(values.size).toBe(0); }
    finally {vi.unstubAllGlobals();}
  });
  it('allows local return paths without protocol-relative or backslash redirects', () => {
    expect(safeNext('/assistant?thread=x')).toBe('/assistant?thread=x');
    for(const path of ['//example.com','/\\example.com','https://example.com']) expect(safeNext(path)).toBe('/configure');
  });
});
