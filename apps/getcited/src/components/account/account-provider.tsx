"use client";

// The verified account controls every protected client surface. A full navigation
// after login/logout discards cached server renders from the previous identity.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Moon, Sun, LogOut, Menu, X } from 'lucide-react';
import { toast } from 'sonner';
import { Identity, StaleResponse, ownerHeaders, isSessionFailure, fenceResponse, guardedJSON, guardedBlob } from '@/lib/client/identity';
import { clearSessionKeys } from '@/lib/session-keys';
import { LogoMark } from '@/components/logo';

export type AccountSession = { enabled: true; user: { id: string; email: string } | null; csrf: string; mode: 'mock' | 'live'; models?: { agentDefault: string; probeDefault: string; probe: { id: string; label: string }[] } };
type Account = { session: AccountSession | null; loading: boolean; error: string | null; identity: Identity; refresh: () => Promise<AccountSession | null>; invalidate: () => void };
const Context = createContext<Account | null>(null);
export function useAccount() { const value = useContext(Context); if (!value) throw new Error('Account context is missing.'); return value; }
export async function authForm(action: 'callback/credentials' | 'signout', fields: Record<string, string>, current: () => boolean) {
  const initial = await fetch('/api/auth/csrf', { cache: 'no-store' }); const csrf = await initial.json();
  if (!current()) throw new StaleResponse();
  if (!initial.ok || typeof csrf.csrfToken !== 'string') throw new Error('Account service unavailable. Please retry.');
  const response = await fetch(`/api/auth/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Auth-Return-Redirect': '1' }, body: new URLSearchParams({ ...fields, csrfToken: csrf.csrfToken, callbackUrl: window.location.origin }) });
  const result = await response.json().catch(() => null);
  if (!current()) throw new StaleResponse();
  if (!response.ok || typeof result?.url !== 'string') throw new Error('Account request was not completed. Please retry.');
  if (new URL(result.url, window.location.origin).searchParams.has('error')) throw new Error('Email or password was not accepted.');
}
const NAV = [{ href: '/configure', label: 'Configure' }, { href: '/assistant', label: 'GEO Agent' }, { href: '/connector', label: 'GEO MCP' }, { href: '/tracker', label: 'Tracker' }, { href: '/dashboard', label: 'Dashboard' }];
export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [identity] = useState(() => new Identity()); const serial = useRef(0);
  const [session, setSession] = useState<AccountSession | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const [dark, setDark] = useState(false); const [menu, setMenu] = useState(false); const path = usePathname();
  const invalidate = useCallback(() => { serial.current++; clearSessionKeys(); identity.accept(null, true); setSession(null); setLoading(true); }, [identity]);
  const refresh = useCallback(async () => {
    const request = ++serial.current;
    try {
      const response = await fetch('/api/session', { cache: 'no-store' }); const next = await response.json();
      if (request !== serial.current) return null;
      if (!response.ok || typeof next.csrf !== 'string' || (next.user && typeof next.user.id !== 'string')) throw new Error();
      if (identity.owner && identity.owner !== next.user?.id) clearSessionKeys();
      identity.accept(next.user?.id ?? null); setSession(next); setLoading(false); setError(null); return next as AccountSession;
    } catch { if (request === serial.current) { clearSessionKeys(); identity.accept(null, true); setSession(null); setLoading(false); setError('Account connection unavailable. Private work is hidden until it returns.'); } return null; }
  }, [identity]);
  useEffect(() => {
    // Persisted browser theme is intentionally hydrated after the server render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { localStorage.removeItem('getcited_last_thread'); sessionStorage.removeItem('getcited_session_keys'); localStorage.removeItem('getcited_custom_model_hint'); localStorage.removeItem('getcited_custom_hint'); const next = localStorage.getItem('getcited-theme') === 'dark'; setDark(next); document.documentElement.dataset.theme = next ? 'dark' : 'light'; document.documentElement.classList.toggle('dark', next); } catch {}
    void refresh(); const focus = () => { void refresh(); }; const storage = (event: StorageEvent) => { if (event.key === 'getcited-account-change') { invalidate(); void refresh(); } };
    window.addEventListener('focus', focus); window.addEventListener('storage', storage);
    // The request serial is deliberately read at cleanup to invalidate the latest pending refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { serial.current++; identity.accept(null, true); window.removeEventListener('focus', focus); window.removeEventListener('storage', storage); };
  }, [identity, invalidate, refresh]);
  const toggle = () => { const next = !dark; setDark(next); document.documentElement.dataset.theme = next ? 'dark' : 'light'; document.documentElement.classList.toggle('dark', next); try { localStorage.setItem('getcited-theme', next ? 'dark' : 'light'); } catch {} };
  const signout = async () => { invalidate(); const ticket = identity.capture(); try { await authForm('signout', {}, () => identity.current(ticket)); if (!identity.current(ticket)) return; localStorage.setItem('getcited-account-change', String(Date.now())); window.location.replace('/login'); } catch { if (identity.current(ticket)) { setLoading(false); setError('Sign out was not completed. Please retry.'); } } };
  return <Context.Provider value={{ session, loading, error, identity, refresh, invalidate }}>
    <header className="gc-header"><div className="gc-header-row"><Link href="/" className="gc-brand" aria-label="GetCited home"><LogoMark className="size-7" /><span>GetCited</span></Link>
      {session?.user && <nav className="gc-desktop-nav" aria-label="Workspace">{NAV.map(item => <Link key={item.href} href={item.href} aria-current={path === item.href ? 'page' : undefined}>{item.label}</Link>)}</nav>}
      <div className="gc-account-controls"><button className="gc-icon" onClick={toggle} aria-label={`Switch to ${dark ? 'light' : 'dark'} theme`}>{dark ? <Sun size={17} /> : <Moon size={17} />}</button>
      {session?.user ? <><span className="gc-account-email" title={session.user.email}>{session.user.email}</span><button className="gc-small-button" onClick={() => void signout()}><LogOut size={15} />Sign out</button><button className="gc-icon gc-mobile-menu" aria-label={menu ? 'Close navigation' : 'Open navigation'} aria-expanded={menu} onClick={() => setMenu(!menu)}>{menu ? <X size={19} /> : <Menu size={19} />}</button></> : <><Link className="gc-small-button" href="/login">Sign in</Link><Link className="gc-small-button gc-primary" href="/signup">Create account</Link></>}</div>
    </div>{menu && session?.user && <nav className="gc-mobile-nav" aria-label="Workspace">{NAV.map(item => <Link key={item.href} href={item.href} aria-current={path === item.href ? 'page' : undefined} onClick={() => setMenu(false)}>{item.label}</Link>)}</nav>}</header>
    {error && <div className="gc-account-error" role="alert">{error} <button onClick={() => void refresh()}>Retry connection</button></div>}
    {children}
  </Context.Provider>;
}
export function WorkspaceBoundary({ ownerId, children }: { ownerId: string; children: React.ReactNode }) {
  const account = useAccount(); const match = account.session?.user?.id === ownerId;
  useEffect(() => { if (!account.loading && account.session?.user && !match) window.location.replace(window.location.pathname + window.location.search); }, [account.loading, account.session?.user, match]);
  if (account.loading) return <main className="gc-wait" role="status">Checking your account…</main>;
  if (!match) return account.error ? null : <main className="gc-wait"><h1>Sign in to your workspace</h1><Link className="gc-small-button gc-primary" href="/login">Sign in</Link></main>;
  return <div className="gc-workspace" key={`${ownerId}:${account.identity.generation}`}>{children}</div>;
}
export function useRequests() {
  const account = useAccount(); const mounted = useRef(true); const own = useRef(new Set<AbortController>());
  useEffect(() => { mounted.current = true; const controllers = own.current; return () => { mounted.current = false; for (const c of controllers) c.abort(); controllers.clear(); }; }, []);
  const capture = () => account.identity.capture(); const current = (ticket: ReturnType<Identity['capture']>) => mounted.current && !!ticket.owner && account.identity.current(ticket);
  const expire = () => { account.invalidate(); void account.refresh(); };
  async function protectedFetch(input: RequestInfo | URL, options: RequestInit = {}) {
    const ticket = capture(); if (!current(ticket)) throw new StaleResponse();
    const controller = new AbortController(); own.current.add(controller); account.identity.controllers.add(controller);
    const callerSignal = options.signal; const abort = () => controller.abort(); if (callerSignal?.aborted) abort(); else callerSignal?.addEventListener('abort', abort, { once: true });
    const finish = () => { own.current.delete(controller); account.identity.controllers.delete(controller); callerSignal?.removeEventListener('abort', abort); };
    try {
      const headers = new Headers(options.headers); Object.entries(ownerHeaders(ticket.owner!, account.session!.csrf, options.method ?? 'GET')).forEach(([key, value]) => headers.set(key, value));
      const response = await fetch(input, { ...options, headers, signal: controller.signal, cache: 'no-store' });
      if (!current(ticket)) throw new StaleResponse();
      if (response.status === 401) { expire(); throw new StaleResponse(); }
      if (!response.ok) { const data = await guardedJSON<{ error?: string; message?: string }>(response, () => current(ticket)).catch(error => { if (error instanceof StaleResponse) throw error; return null; }); if (isSessionFailure(data)) { expire(); throw new StaleResponse(); } throw new Error(data?.message || data?.error || (response.status === 429 ? 'Please wait before trying again.' : 'The request failed. Please retry.')); }
      return fenceResponse(response, () => current(ticket), expire, finish);
    } catch (error) { finish(); throw error; }
  }
  async function request<T>(url: string, method = 'GET', body?: unknown) { const ticket = capture(); return guardedJSON<T>(await protectedFetch(url, { method, ...(method !== 'GET' ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) } : {}) }), () => current(ticket)); }
  async function action<T>(operation: (ownerId: string) => Promise<T>): Promise<T | null> { const ticket = capture(); if (!current(ticket)) return null; try { const result = await operation(ticket.owner!); if (!current(ticket)) return null; if (isSessionFailure(result)) { expire(); return null; } return result; } catch { if (current(ticket)) toast.error('The request was not completed. Please retry.'); return null; } }
  async function download(url: string, filename: string) { const ticket = capture(); try { const data = await guardedBlob(await protectedFetch(url), () => current(ticket)); const href = URL.createObjectURL(data); const a = document.createElement('a'); a.href = href; a.download = filename; a.click(); URL.revokeObjectURL(href); } catch (error) { if (current(ticket)) toast.error(error instanceof StaleResponse ? 'Please sign in again.' : 'Download failed. Please retry.'); } }
  return { request, fetch: protectedFetch, action, download, capture, current, ownerId: account.session?.user?.id ?? null };
}
