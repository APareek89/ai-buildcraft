"use client";

import { useState } from "react";
import { Loader2, Play, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface SovEntry {
  brand: string;
  mentions: number;
  sov: number;
}

export function MockAudit() {
  const [brand, setBrand] = useState("Linear");
  const [competitors, setCompetitors] = useState<string[]>(["Jira", "Asana"]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SovEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function setComp(i: number, v: string) {
    setCompetitors((prev) => prev.map((c, idx) => (idx === i ? v : c)));
  }

  async function run() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/mock-audit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          brand: brand.trim(),
          competitors: competitors.map((c) => c.trim()).filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Audit failed");
        setResult(null);
      } else {
        setResult(data.share_of_voice as SovEntry[]);
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  const rows =
    result
      ?.map((e) => ({
        name: e.brand,
        pct: Math.round(e.sov * 100),
        isBrand: e.brand === brand.trim(),
      }))
      .sort((a, b) => b.pct - a.pct) ?? [];

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-2xl shadow-black/40">
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm font-medium">Free instant audit</div>
        <span className="rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-warning">
          Demo · mock data
        </span>
      </div>

      <div className="space-y-2">
        <Input
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          placeholder="Your brand"
          className="bg-background"
        />
        {competitors.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={c}
              onChange={(e) => setComp(i, e.target.value)}
              placeholder={`Competitor ${i + 1}`}
              className="bg-background"
            />
            {competitors.length > 1 && (
              <button
                type="button"
                onClick={() => setCompetitors((p) => p.filter((_, idx) => idx !== i))}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Remove"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
        {competitors.length < 4 && (
          <button
            type="button"
            onClick={() => setCompetitors((p) => [...p, ""])}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-3 w-3" /> add competitor
          </button>
        )}
      </div>

      <Button onClick={run} disabled={loading} className="mt-4 w-full">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        Run mock audit
      </Button>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      {rows.length > 0 && (
        <div className="mt-5">
          <div className="mb-3 text-xs text-muted-foreground">
            AI share-of-voice across {rows.length} brands
          </div>
          <div className="space-y-3">
            {rows.map((d) => (
              <div key={d.name}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className={d.isBrand ? "font-medium text-foreground" : "text-muted-foreground"}>
                    {d.name}
                    {d.isBrand && (
                      <span className="ml-1.5 text-[10px] uppercase tracking-wide text-primary">
                        you
                      </span>
                    )}
                  </span>
                  <span className={d.isBrand ? "text-foreground" : "text-muted-foreground"}>
                    {d.pct}%
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className={d.isBrand ? "h-full rounded-full bg-aurora transition-all" : "h-full rounded-full transition-all"}
                    style={{
                      width: `${d.pct}%`,
                      ...(d.isBrand ? {} : { background: "rgba(255,255,255,0.14)" }),
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            This is illustrative mock data. Create an account for a saved prepared example, or run an ordinary OpenAI probe after configuring your brand.
          </p>
        </div>
      )}
    </div>
  );
}
