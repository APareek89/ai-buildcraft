"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Maximize2, X } from "lucide-react";

/* eslint-disable @typescript-eslint/no-explicit-any */
function getRecognition(): any {
  if (typeof window === "undefined") return null;
  const W = window as any;
  return W.SpeechRecognition || W.webkitSpeechRecognition || null;
}

const LANGS = [
  { code: "en-IN", label: "EN" },
  { code: "hi-IN", label: "हिं" },
];

/** Mic dictation button (Web Speech API). Appends transcript via onText. */
export function MicButton({ onText }: { onText: (t: string) => void }) {
  const [listening, setListening] = useState(false);
  const [lang, setLang] = useState(0);
  const recRef = useRef<any>(null);
  const supported = !!getRecognition();

  useEffect(() => () => recRef.current?.stop?.(), []);
  if (!supported) return null;

  const toggle = () => {
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const Rec = getRecognition();
    const rec = new Rec();
    rec.lang = LANGS[lang].code;
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      const t = Array.from(e.results).slice(e.resultIndex)
        .map((r: any) => r[0].transcript).join(" ");
      if (t.trim()) onText(t.trim() + " ");
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  return (
    <span className="inline-flex items-center gap-1">
      <button type="button" onClick={toggle}
        title={listening ? "Stop dictation" : `Speak (${LANGS[lang].code})`}
        className={`w-7 h-7 rounded-full flex items-center justify-center cursor-pointer transition ${
          listening ? "bg-red-500 text-white animate-pulse" : "bg-slate-100 text-slate-500 hover:bg-blue-100 hover:text-blue-600"
        }`}>
        {listening ? <MicOff size={13} /> : <Mic size={13} />}
      </button>
      <button type="button" onClick={() => setLang((lang + 1) % LANGS.length)}
        title="Dictation language"
        className="text-[10px] font-bold text-slate-400 hover:text-blue-600 cursor-pointer w-6">
        {LANGS[lang].label}
      </button>
    </span>
  );
}

/** Textarea with mic dictation + expand-to-modal. */
export default function SmartTextarea({
  label, value, onChange, placeholder, rows = 2,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; rows?: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="field-label !mb-0">{label}</label>
        <span className="flex items-center gap-1">
          <MicButton onText={(t) => onChange((value ? value + " " : "") + t)} />
          <button type="button" onClick={() => setOpen(true)} title="Write in a bigger window"
            className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 hover:bg-blue-100 hover:text-blue-600 flex items-center justify-center cursor-pointer transition">
            <Maximize2 size={12} />
          </button>
        </span>
      </div>
      <textarea value={value} rows={rows} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)} className="inp" />
      {open && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="font-semibold text-sm">{label}</p>
              <span className="flex items-center gap-2">
                <MicButton onText={(t) => onChange((value ? value + " " : "") + t)} />
                <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer"><X size={18} /></button>
              </span>
            </div>
            <textarea autoFocus value={value} rows={12} placeholder={placeholder}
              onChange={(e) => onChange(e.target.value)} className="inp !text-[15px] leading-7" />
            <div className="flex justify-end mt-3">
              <button onClick={() => setOpen(false)} className="btn-primary !py-2 !text-sm">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
