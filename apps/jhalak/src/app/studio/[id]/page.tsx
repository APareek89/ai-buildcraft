"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { fetchJson } from "@/lib/client";
import { MicButton } from "@/components/SmartTextarea";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Make the headline shorter and punchier",
  "Change the accent color to emerald",
  "Switch to the bold template",
  "Turn off the gallery tab",
  "Rewrite the about section in Hinglish",
];

export default function Studio({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [slug, setSlug] = useState("");
  const [status, setStatus] = useState("draft");
  const [name, setName] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(1);
  const [published, setPublished] = useState(false);
  const [mobileView, setMobileView] = useState<"chat" | "preview">("chat");
  const [selected, setSelected] = useState<{ sel: string; label: string } | null>(null);
  const [savedFlash, setSavedFlash] = useState("");
  const [flashErr, setFlashErr] = useState(false);
  const chatEnd = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const load = useCallback(async () => {
    const r = await fetchJson<{ business: { slug: string; status: string; name: string } }>(`/api/business/${id}`);
    if (r.ok && r.data?.business) {
      setSlug(r.data.business.slug);
      setStatus(r.data.business.status);
      setName(r.data.business.name);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);

  // bridge from the ?edit=1 preview iframe: inline text edits + section selection
  useEffect(() => {
    const onMsg = async (e: MessageEvent) => {
      // only trust messages from our own preview iframe (same origin + same window)
      if (e.origin !== window.location.origin || e.source !== iframeRef.current?.contentWindow) return;
      const d = e.data;
      if (!d || !d.__jhalak) return;
      if (d.type === "select") {
        setSelected({ sel: String(d.sel || ""), label: String(d.label || "") });
        setMobileView("chat");
      } else if (d.type === "edit" && typeof d.path === "string") {
        const r = await fetchJson(`/api/business/${id}/field`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: d.path, value: d.value }),
        });
        if (r.ok) {
          setFlashErr(false); setSavedFlash("Saved ✓");
          setTimeout(() => setSavedFlash(""), 1600);
        } else {
          // don't let a failed save look saved — surface it and revert the preview node
          setFlashErr(true); setSavedFlash(r.error || "Couldn't save — try again");
          iframeRef.current?.contentWindow?.postMessage({ __jhalakParent: true, type: "revert", path: d.path }, window.location.origin);
          setTimeout(() => { setSavedFlash(""); setFlashErr(false); }, 3000);
        }
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [id]);

  const clearSelection = () => {
    setSelected(null);
    iframeRef.current?.contentWindow?.postMessage({ __jhalakParent: true, type: "clear-selection" }, window.location.origin);
  };

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setInput("");
    setBusy(true);
    const r = await fetchJson<{ reply: string; applied: string[] }>(`/api/business/${id}/assistant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: next.slice(-12), scope: selected || undefined }),
    });
    setBusy(false);
    if (!r.ok || !r.data) {
      setMessages([...next, { role: "assistant", content: `Sorry — ${r.error}` }]);
      return;
    }
    setMessages([...next, { role: "assistant", content: r.data.reply }]);
    if (r.data.applied?.length) {
      setVersion((v) => v + 1); // reload the preview
      if (r.data.applied.some((a) => a.includes("published"))) setPublished(true);
      load();
    }
  };

  const publish = async () => {
    setBusy(true);
    await fetchJson(`/api/business/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "published" }),
    });
    setBusy(false);
    setPublished(true);
    setStatus("published");
    setVersion((v) => v + 1);
  };

  return (
    <div className="h-screen flex flex-col bg-slate-100">
      <header className="bg-white border-b border-slate-200 px-3 sm:px-5 py-3 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Link href="/" className="font-display text-lg font-semibold shrink-0 hidden sm:inline">Jhalak</Link>
          <span className="text-stone-300 hidden sm:inline">/</span>
          <span className="font-medium truncate">{name || "Studio"}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
            status === "published" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
          }`}>
            {status}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link href={`/admin/${id}`} className="hidden sm:inline-block rounded-full border border-slate-300 px-4 py-2 text-sm hover:border-slate-500 transition">
            Dashboard
          </Link>
          {slug && (
            <a href={`/s/${slug}`} target="_blank" className="hidden sm:inline-block rounded-full border border-slate-300 px-4 py-2 text-sm hover:border-slate-500 transition">
              Open site ↗
            </a>
          )}
          <button onClick={publish} disabled={busy || status === "published"}
            className="rounded-full bg-blue-600 text-white px-4 sm:px-5 py-2 text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-50 shrink-0">
            {status === "published" ? "✓ Live" : "🚀 Publish"}
          </button>
        </div>
      </header>

      <div className="sm:hidden flex border-b border-slate-200 bg-white">
        {(["chat", "preview"] as const).map((v) => (
          <button key={v} onClick={() => setMobileView(v)}
            className={`flex-1 py-2.5 text-sm font-medium capitalize border-b-2 transition ${
              mobileView === v ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500"
            }`}>
            {v === "chat" ? "✏️ Edit by chat" : "👁 Preview"}
          </button>
        ))}
      </div>
      <div className="flex-1 flex min-h-0">
        {/* chat panel */}
        <div className={`w-full sm:w-[420px] shrink-0 flex-col border-r border-slate-200 bg-white ${mobileView === "chat" ? "flex" : "hidden sm:flex"}`}>
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {!messages.length && (
              <div className="space-y-4">
                <p className="text-sm text-slate-600 leading-6">
                  👋 This is your <b>website editor</b>. Three ways to change things:
                </p>
                <ul className="text-sm text-slate-600 leading-6 list-disc pl-5 space-y-1">
                  <li><b>Click any part</b> of your site — text, button, image, tab or section — then tell me what to change (e.g. “make this image more industrial, blue tones”).</li>
                  <li><b>Double-click text</b> to retype it directly.</li>
                  <li>Or just type — like “add a testimonials section” or “add a Pricing tab”.</li>
                </ul>
                <div className="space-y-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => send(s)}
                      className="block w-full text-left text-sm rounded-xl border border-slate-200 px-4 py-2.5 hover:border-blue-500 hover:text-blue-700 transition">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-6 whitespace-pre-wrap ${
                  m.role === "user" ? "bg-slate-900 text-white" : "bg-slate-100"
                }`}>
                  {m.content}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="rounded-2xl px-4 py-2.5 text-sm bg-slate-100 text-slate-400">
                  Making changes…
                </div>
              </div>
            )}
            {published && (
              <div className="rounded-xl bg-green-50 border border-green-200 text-green-800 px-4 py-3 text-sm">
                🎉 Your site is live! Share it:{" "}
                <a href={`/s/${slug}`} target="_blank" className="underline font-medium">
                  {typeof window !== "undefined" ? window.location.host : ""}/s/{slug}
                </a>
              </div>
            )}
            <div ref={chatEnd} />
          </div>
          <div className="p-4 border-t border-slate-200">
            {(selected || savedFlash) && (
              <div className="mb-2 flex items-center gap-2 flex-wrap">
                {selected && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-blue-100 text-blue-800 rounded-full pl-3 pr-2 py-1">
                    ✏️ Editing: {selected.label || selected.sel}
                    <button onClick={clearSelection} aria-label="Clear selection" className="text-blue-500 hover:text-blue-900 text-sm leading-none">×</button>
                  </span>
                )}
                {savedFlash && <span className={`text-xs font-medium ${flashErr ? "text-red-600" : "text-green-600"}`}>{savedFlash}</span>}
              </div>
            )}
            <div className="flex gap-2 items-center">
              <MicButton onText={(t) => setInput((v) => (v ? v + " " : "") + t)} />
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder={selected ? `Editing ${selected.label || selected.sel} — e.g. "make this shorter"` : "e.g. Make the headline about bridal wear…"}
                disabled={busy}
                className="flex-1 border border-slate-300 rounded-full px-4 py-2.5 text-sm outline-none focus:border-blue-600 disabled:opacity-50"
              />
              <button onClick={() => send()} disabled={busy || !input.trim()}
                className="rounded-full bg-blue-600 text-white px-5 py-2.5 text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-50">
                Send
              </button>
            </div>
          </div>
        </div>

        {/* live preview */}
        <div className={`flex-1 flex-col bg-slate-200 p-2 sm:p-4 ${mobileView === "preview" ? "flex" : "hidden sm:flex"}`}>
          <div className="flex-1 rounded-2xl overflow-hidden bg-white shadow-xl">
            {slug ? (
              <iframe ref={iframeRef} key={version} src={`/s/${slug}?edit=1`} className="w-full h-full" title="Website preview" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-400">Loading preview…</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
