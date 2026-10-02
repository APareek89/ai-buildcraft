"use client";
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useRef, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAccount, authForm } from '@/components/account/account-provider';
import { safeNext, StaleResponse } from '@/lib/client/identity';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function LoginForm({ signup = false }: { signup?: boolean }) {
  const account = useAccount(); const params = useSearchParams(); const mounted = useRef(true);
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy) return; setError('');
    if (new TextEncoder().encode(password).length > 72 || (signup && password.length < 12)) { setError('Use at least 12 characters and at most 72 UTF-8 bytes.'); return; }
    setBusy(true); const ticket = account.identity.capture(); const current = () => mounted.current && account.identity.current(ticket);
    try {
      const session = await account.refresh(); if (!current()) throw new StaleResponse(); if (!session) throw new Error('Account service unavailable. Please retry.');
      if (signup) {
        const response = await fetch('/api/auth/signup', { method: 'POST', headers: { 'content-type': 'application/json', 'X-GetCited-CSRF': session.csrf }, body: JSON.stringify({ email, password }) });
        const result = await response.json().catch(() => null); if (!current()) throw new StaleResponse();
        if (!response.ok) throw new Error(result?.code === 'account_exists' ? 'An account already exists for this email. Sign in instead.' : response.status === 429 ? 'Please wait before trying again.' : result?.error || 'Account creation failed. Please retry.');
      }
      await authForm('callback/credentials', { email, password }, current); if (!current()) return;
      const verified = await account.refresh(); if (!mounted.current) return;
      if (!verified?.user || verified.user.email.toLowerCase() !== email.trim().toLowerCase()) throw new Error('Sign-in could not be verified. Please retry.');
      setPassword(''); try { localStorage.setItem('getcited-account-change', String(Date.now())); } catch {}
      window.location.replace(safeNext(params.get('next')));
    } catch (e) { if (mounted.current && !(e instanceof StaleResponse)) setError(e instanceof Error ? e.message : 'Account request failed.'); }
    finally { if (mounted.current) setBusy(false); }
  }
  return <div className="space-y-5"><form onSubmit={submit} className="space-y-4">
    <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" type="email" required autoComplete="email" maxLength={254} value={email} onChange={e => setEmail(e.target.value)} /></div>
    <div className="space-y-2"><Label htmlFor="password">Password</Label><Input id="password" type="password" required minLength={signup ? 12 : undefined} maxLength={72} autoComplete={signup ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} />{signup && <p className="text-xs text-muted-foreground">At least 12 characters.</p>}</div>
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    <Button className="w-full" type="submit" disabled={busy}>{busy && <Loader2 className="size-4 animate-spin" />}{busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}</Button>
  </form><Button variant="outline" className="w-full" disabled>Google · Not configured</Button>
    <p className="text-center text-sm"><Link className="text-primary underline" href={signup ? '/login' : '/signup'}>{signup ? 'Already have an account? Sign in' : 'New here? Create an account'}</Link></p>
    <p className="text-center text-xs text-muted-foreground">Password-reset email is not configured for this launch.</p>
  </div>;
}
