"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { LogIn, UserPlus } from "lucide-react";
import { fetchJson } from "@/lib/client";

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/start";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await fetchJson(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    router.push(next);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm">
        <Link href="/" className="font-display text-2xl font-semibold block text-center mb-6">Jhalak</Link>
        <div className="card p-6">
          <h1 className="text-lg font-bold mb-1">{mode === "signup" ? "Create your account" : "Welcome back"}</h1>
          <p className="text-sm text-slate-500 mb-5">
            {mode === "signup" ? "Free in this preview — no card needed." : "Log in to manage your website."}
          </p>
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">{error}</div>
          )}
          <form onSubmit={submit} className="space-y-3.5">
            {mode === "signup" && (
              <div>
                <label className="field-label">Your name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className="inp" placeholder="Anand" />
              </div>
            )}
            <div>
              <label className="field-label">Email</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="inp" placeholder="you@example.com" />
            </div>
            <div>
              <label className="field-label">Password</label>
              <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="inp" placeholder="min 6 characters" />
            </div>
            <button type="submit" disabled={busy} className="btn-primary w-full justify-center">
              {mode === "signup" ? <UserPlus size={15} /> : <LogIn size={15} />}
              {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Log in"}
            </button>
          </form>
          <p className="text-sm text-slate-500 mt-4 text-center">
            {mode === "signup" ? (
              <>Already have an account? <Link href={`/login?next=${encodeURIComponent(next)}`} className="text-blue-600 font-medium">Log in</Link></>
            ) : (
              <>New here? <Link href={`/signup?next=${encodeURIComponent(next)}`} className="text-blue-600 font-medium">Create an account</Link></>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

