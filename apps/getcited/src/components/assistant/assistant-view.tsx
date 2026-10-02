"use client";

import Link from "next/link";
import { userMessage, chatErrorMessage, MESSAGE_TOO_LARGE, INTERRUPTED_RESPONSE } from "@/lib/chat-recovery";
import { fenceResponse, StaleResponse } from "@/lib/client/identity";
import { useAccount, useRequests } from "@/components/account/account-provider";
import { ExampleButton } from "@/components/account/example-button";
import { PreparedNotice } from "@/components/account/prepared-notice";
import { ProbePanel } from "./probe-panel";
import { useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  Send,
  Square,
  Search,
  Target,
  LineChart,
  Compass,
  Sparkles,
  Paperclip,
  Download,
  Rocket,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ToolCallCard } from "./tool-call-card";
import { Markdown } from "./markdown";
import { ThreadSidebar, type ThreadItem } from "./thread-sidebar";
import { getSessionKeys } from "@/lib/session-keys";

const CARDS = [
  {
    id: "benchmark",
    title: "Where do I stand?",
    subtitle: "Benchmark",
    icon: Search,
    prompt:
      "Benchmark my brand: load my config, run the AI panel, and show my share-of-voice, citation share and sentiment vs my competitors.",
  },
  {
    id: "diagnose",
    title: "Why am I here?",
    subtitle: "Diagnose",
    icon: Compass,
    prompt:
      "Diagnose why my competitors are cited more than me — categorize where AI cites in my space and show my biggest gaps.",
  },
  {
    id: "improve",
    title: "How can I improve?",
    subtitle: "Action plan",
    icon: Rocket,
    prompt:
      "Build my costed action plan: fill my biggest citation gaps within my budget and team, expand it into a week-by-week roadmap, and give me the projection with its assumptions.",
  },
  {
    id: "plan",
    title: "Where can I get to?",
    subtitle: "Projection",
    icon: Target,
    prompt:
      "What citation share, AI traffic and conversions can I realistically get to with my current budget, team and timeline? Show the modeled projection and its assumptions.",
  },
  {
    id: "track",
    title: "How am I progressing?",
    subtitle: "Track",
    icon: LineChart,
    prompt: "Track my progress against my last plan — what's done, what's pending, and the measured impact.",
  },
];

const LAST_THREAD_KEY = "getcited_last_thread";
const MAX_UPLOAD_BYTES = 12 * 1024;

/* eslint-disable @typescript-eslint/no-explicit-any */
export function AssistantView() {
  const account = useAccount();
  const currentRequests = useRequests();
  // WorkspaceBoundary remounts on identity change; its CSRF token remains valid for this session.
  const [requests] = useState(() => currentRequests);
  const [model, setModel] = useState(account.session?.models?.agentDefault ?? "gpt-4o-mini");
  const [prepared, setPrepared] = useState(false);
  const selection = useRef(0);
  const lastThreadKey = LAST_THREAD_KEY + ":" + requests.ownerId;
  const readers = useRef(new Set<FileReader>());
  const [input, setInput] = useState("");
  const [responseError, setResponseError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [threads, setThreads] = useState<ThreadItem[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<{ name: string; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // The SDK constructor stores fetch; it reads the selection only later, when a request starts.
  // eslint-disable-next-line react-hooks/refs
  const [transport] = useState(() => new DefaultChatTransport({ api: "/api/chat", fetch: async (input, options) => { const serial = selection.current; const ticket = requests.capture(); const response = await requests.fetch(input, options); return fenceResponse(response, () => serial === selection.current && requests.current(ticket), () => {}); } }));
  const { messages, sendMessage, status, stop, setMessages } = useChat({ transport, onError: error => { const message=chatErrorMessage(error); setResponseError(message); toast.error(message); } });
  const busy = status === "submitted" || status === "streaming";

  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => () => { selection.current++; void stop(); for (const reader of readers.current) reader.abort(); readers.current.clear(); }, [stop]);
  const refreshThreads = useCallback(async (): Promise<ThreadItem[]> => {
    const data = await requests.request<{threads: ThreadItem[]}>('/api/threads');
    setThreads(data.threads ?? []); return data.threads ?? [];
  }, [requests]);
  const openThread = useCallback(async (id: string) => {
    const serial = ++selection.current; void stop(); setMessages([]); setThreadId(id); setPrepared(false); setResponseError(null); setInput(''); setAttachment(null); setSelected(new Set());
    try {
      const data = await requests.request<{thread?: {prepared?:boolean}; messages: any[]; prepared?:boolean}>(`/api/threads/${encodeURIComponent(id)}`);
      if (serial !== selection.current) return;
      setMessages(data.messages ?? []); setPrepared(Boolean(data.thread?.prepared ?? data.prepared));
      localStorage.setItem(lastThreadKey, id);
    } catch { if (serial === selection.current) toast.error('This conversation could not be opened. Please retry.'); }
  }, [setMessages, stop, lastThreadKey, requests]);
  useEffect(() => {
    let active = true;
    // Restoration reads an external server store; state updates occur after that request.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshThreads().then(list => {
      if (!active) return;
      const requested = new URLSearchParams(window.location.search).get('thread');
      const last = requested ?? localStorage.getItem(lastThreadKey);
      if (last && list.some(t => t.id === last)) void openThread(last);
    }).catch(() => { if (active) toast.error('Conversation history is unavailable. Please reload to retry.'); });
    return () => { active = false; };
  }, [refreshThreads, openThread, lastThreadKey]);
  async function ensureThread(firstText: string, expectedSelection: number): Promise<string> {
    if (threadId) return threadId;
    const data = await requests.request<{thread:{id:string}}>('/api/threads', 'POST', {title:firstText.slice(0,80)});
    if (expectedSelection !== selection.current) throw new StaleResponse();
    if (!data.thread?.id) throw new Error('Conversation was not created.');
    setThreadId(data.thread.id); localStorage.setItem(lastThreadKey, data.thread.id); void refreshThreads(); return data.thread.id;
  }
  async function newThread() {
    selection.current++; void stop(); setThreadId(null); setPrepared(false); setResponseError(null); localStorage.removeItem(lastThreadKey);
    setMessages([]); setSelected(new Set()); setInput(''); setAttachment(null);
  }
  async function deleteThreadById(id: string) {
    try { await requests.request(`/api/threads/${encodeURIComponent(id)}`, 'DELETE'); if (id === threadId) await newThread(); await refreshThreads(); }
    catch { toast.error('Conversation could not be deleted.'); }
  }
  async function send(text: string) {
    const t = text.trim();
    if (!t || busy || prepared) return;
    const ticket = requests.capture(); const selectedThread = selection.current;
    let message;
    try { message=userMessage(crypto.randomUUID(),t,attachment); }
    catch { toast.error(MESSAGE_TOO_LARGE); return; }
    let tid: string;
    try { tid = await ensureThread(t, selectedThread); } catch { if (requests.current(ticket)) toast.error("Conversation could not be saved. Please retry."); return; }
    if (!requests.current(ticket) || selectedThread !== selection.current) return;
    const sessionKeys = getSessionKeys(requests.ownerId!);
    const body: Record<string, unknown> = { model, threadId: tid ?? undefined };
    if (Object.keys(sessionKeys).length > 0) body.keys = sessionKeys;
    setResponseError(null); setAttachment(null);
    void sendMessage(message, { body }).finally(() => { if (requests.current(ticket) && selectedThread === selection.current) void refreshThreads().catch(() => {}); });
    setInput("");
    setSelected(new Set());

  }

  function runSelected() {
    const chosen = CARDS.filter((c) => selected.has(c.id));
    if (chosen.length === 0) return;
    const extra = input.trim();
    send(chosen.map((c) => c.prompt).join("\n\n") + (extra ? `\n\nAlso: ${extra}` : ""));
  }

  function toggleCard(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/\.(md|txt|csv|json|html)$/i.test(file.name)) { toast.error("Choose a text file: md, txt, csv, json, or html."); return; }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error("Attach up to 12 KiB of text. The complete message must fit within 16 KiB.");
      return;
    }
    const ticket = requests.capture(); const selectedThread = selection.current;
    const reader = new FileReader(); readers.current.add(reader);
    reader.onloadend = () => readers.current.delete(reader);
    reader.onload = () => {
      if (!requests.current(ticket) || selectedThread !== selection.current) return;
      setAttachment({ name: file.name, text: String(reader.result ?? "").slice(0, MAX_UPLOAD_BYTES) });
      toast.success(`Attached ${file.name} — it will be included with your next message.`);
    };
    reader.onerror = () => { if (requests.current(ticket) && selectedThread === selection.current) toast.error("File could not be read."); };
    reader.readAsText(file);
  }

  function downloadMessage(m: any) {
    if (!requests.current(requests.capture())) return;
    const text = (m.parts as any[])
      .filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("\n\n");
    const blob = new Blob([text], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `getcited-answer-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="gc-assistant">
      <ThreadSidebar
        threads={threads}
        activeId={threadId}
        onSelect={openThread}
        onNew={newThread}
        onDelete={deleteThreadById}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="gc-thread-mobile"><select aria-label="Conversation history" value={threadId ?? ''} onChange={e => e.target.value ? void openThread(e.target.value) : void newThread()}><option value="">New conversation</option>{threads.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select><button className="gc-small-button" onClick={() => void newThread()}>New</button></div>
        <>
            {/* Messages (wider than the composer for readable tool-result cards) */}
            <div className="min-h-0 flex-1 overflow-auto px-5 py-6">
              <div className="mx-auto max-w-4xl space-y-5">
                <PreparedNotice prepared={prepared} />
                {prepared && <p className="text-xs text-muted-foreground">Explore the saved results and explicitly approve the illustrative plan into Tracker. <Link className="underline" href="/configure">Save a new configuration</Link> to start your own research.</p>}
                {!prepared && <ProbePanel />}
                <div className="flex flex-wrap items-center gap-3"><ExampleButton /></div>
                {messages.length === 0 ? (
                  <div className="pt-8 text-center">
                    <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-card">
                      <Sparkles className="h-5 w-5 text-primary" />
                    </div>
                    <h2 className="text-lg font-semibold">GEO Assistant</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Pick starter cards below, upload a plan for content, or ask anything about
                      your AI visibility.
                    </p>
                  </div>
                ) : (
                  messages.map((m) => (
                    <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                      <div
                        className={cn(
                          "max-w-full",
                          m.role === "user"
                            ? "rounded-2xl bg-primary/15 px-4 py-2.5 text-sm"
                            : "group w-full",
                        )}
                      >
                        {(m.parts as any[]).map((p, i) => {
                          if (p.type === "text") {
                            return m.role === "user" ? (
                              <div key={i} className="whitespace-pre-wrap leading-relaxed">
                                {p.text}
                              </div>
                            ) : (
                              <Markdown key={i}>{p.text}</Markdown>
                            );
                          }
                          if (p.type === "dynamic-tool" || (typeof p.type === "string" && p.type.startsWith("tool-"))) {
                            return <ToolCallCard key={i} part={p} prepared={prepared} active={busy && m.id === messages.at(-1)?.id} />;
                          }
                          return null;
                        })}
                        {m.role === "assistant" &&
                          (m.parts as any[]).some((p) => p.type === "text" && p.text?.trim()) && (
                            <button
                              type="button"
                              onClick={() => downloadMessage(m)}
                              className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground group-hover:inline-flex"
                            >
                              <Download className="h-3 w-3" /> Download as markdown
                            </button>
                          )}
                      </div>
                    </div>
                  ))
                )}
                {busy && (
                  <div className="text-xs text-muted-foreground" role="status" aria-live="polite">
                    {status === "submitted" ? "Generating…" : "Working on your request… Results appear when each model or tool step finishes."}
                  </div>
                )}
                {responseError && <div className="rounded-lg border border-warning/40 p-3 text-sm" role="alert">{responseError}{threadId && <button type="button" className="ml-2 underline" onClick={()=>void openThread(threadId)}>Restore saved conversation</button>}</div>}
                <div ref={bottomRef} />
              </div>
            </div>

            {/* Starter cards + composer (no divider line above the cards) */}
            <div className="px-5 pb-4 pt-1">
              <div className="mx-auto max-w-2xl space-y-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {CARDS.map((c) => {
                    const Icon = c.icon;
                    const on = selected.has(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        disabled={prepared}
                        onClick={() => toggleCard(c.id)}
                        className={cn(
                          "rounded-xl border p-2.5 text-left transition-colors",
                          on ? "border-primary/60 bg-primary/10" : "border-border bg-card hover:bg-secondary",
                        )}
                      >
                        <Icon className={cn("mb-1.5 h-4 w-4", on ? "text-primary" : "text-muted-foreground")} />
                        <div className="text-xs font-medium leading-tight">{c.title}</div>
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{c.subtitle}</div>
                      </button>
                    );
                  })}
                </div>

                {/* Composer: upload + textarea + model + send inside one surface */}
                <div className="rounded-xl border border-border bg-card p-2">
                  {attachment && (
                    <div className="mb-2 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs">
                      <Paperclip className="h-3 w-3 text-primary" />
                      <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
                      <button type="button" onClick={() => setAttachment(null)} aria-label="Remove attachment">
                        <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                      </button>
                    </div>
                  )}
                  <Textarea
                    aria-label="Message to GEO agent"
                    disabled={prepared}
                    maxLength={16000}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (selected.size > 0) runSelected();
                        else send(input);
                      }
                    }}
                    placeholder="Ask about your AI visibility, or select cards and hit Go…"
                    className="max-h-40 min-h-[44px] resize-none border-0 bg-transparent p-2 shadow-none focus-visible:ring-0"
                    rows={1}
                  />
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      aria-label="Attach text file"
                      ref={fileInputRef}
                      type="file"
                      accept=".md,.txt,.csv,.json,.html"
                      className="hidden"
                      onChange={onPickFile}
                    />
                    <button
                      type="button"
                      disabled={prepared}
                      onClick={() => fileInputRef.current?.click()}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
                      aria-label="Attach a file (e.g. your plan) for the agent"
                      title="Attach a file — e.g. upload your plan and ask for the content"
                    >
                      <Paperclip className="h-4 w-4" />
                    </button>
                    <select
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className="rounded-md border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground outline-none focus:border-ring"
                      aria-label="Agent model"
                    >
                      {[{ id: account.session?.models?.agentDefault ?? "gpt-4o-mini", label: "Configured agent model" }].map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                    <div className="flex-1" />
                    {busy ? (
                      <Button type="button" variant="outline" size="sm" onClick={() => { void stop(); setResponseError(INTERRUPTED_RESPONSE); }}>
                        <Square className="h-3.5 w-3.5" /> Stop
                      </Button>
                    ) : selected.size > 0 ? (
                      <Button type="button" size="sm" onClick={runSelected}>
                        Go ({selected.size})
                      </Button>
                    ) : (
                      <Button type="button" size="sm" onClick={() => send(input)} aria-label="Send message" disabled={!input.trim() || prepared}>
                        <Send className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
                <p className="text-center text-[11px] text-muted-foreground">
                  Projections are modeled estimates, not guarantees. Assumptions are always listed.
                </p>
              </div>
            </div>
        </>
      </div>
    </div>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

