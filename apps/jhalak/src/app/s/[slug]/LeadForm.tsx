"use client";

import { useState } from "react";

export default function LeadForm({ slug, accentBg }: { slug: string; accentBg: string }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) return;
    setState("busy");
    try {
      const r = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, name, phone, message }),
      });
      // don't .json() — an HTML error page must not crash the form
      if (!r.ok) throw new Error();
      setState("done");
    } catch {
      setState("error");
    }
  };

  if (state === "done") {
    return (
      <div className="rounded-2xl bg-white border border-stone-200 p-8 text-center">
        <div className="text-3xl mb-2">🙏</div>
        <p className="font-semibold">Thank you!</p>
        <p className="text-sm opacity-60 mt-1">We will get back to you very soon.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-2xl bg-white border border-stone-200 p-6 space-y-4">
      <p className="font-semibold">Send us an enquiry</p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name"
        className="w-full border border-stone-300 rounded-xl px-4 py-3 text-sm outline-none focus:border-stone-500"
      />
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Phone / WhatsApp number *"
        required
        className="w-full border border-stone-300 rounded-xl px-4 py-3 text-sm outline-none focus:border-stone-500"
      />
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="What are you looking for?"
        rows={3}
        className="w-full border border-stone-300 rounded-xl px-4 py-3 text-sm outline-none focus:border-stone-500"
      />
      <button
        type="submit"
        disabled={state === "busy"}
        className={`w-full rounded-full ${accentBg} text-white py-3 font-semibold transition disabled:opacity-60`}
      >
        {state === "busy" ? "Sending…" : "Send enquiry"}
      </button>
      {state === "error" && (
        <p className="text-xs text-red-600">Could not send — please try again.</p>
      )}
    </form>
  );
}
