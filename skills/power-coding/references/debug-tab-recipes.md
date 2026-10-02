# In-app debug-tab recipes

Only build this if the user chose **(B)** in Step 0. Detect the framework, then adapt one recipe. Always: add `mermaid` as a dependency, add a clearly-labelled nav link (e.g. "Architecture ▸ (debug)"), and **verify it serves** before declaring done.

The tab does 3 things: (1) read the `.mmd` files fresh on each load, (2) render them with Mermaid client-side, (3) show a **staleness banner** comparing newest source-file mtime vs newest diagram mtime.

---

## Recipe A — Next.js (App Router)

`app/<admin>/architecture/page.tsx` (server component — reads files + staleness):
```tsx
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import MermaidView from "./MermaidView";
export const dynamic = "force-dynamic";
const MMD_DIR = join(process.cwd(), "docs", "mermaid");
const SRC_DIRS = ["src", "lib", "app"]; // <-- point at the code dirs that matter for THIS project
function newestMtime(dir: string): number {
  let n = 0;
  const walk = (d: string) => {
    let es; try { es = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of es) { const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx|js|jsx|py|go|rb)$/.test(e.name)) { const m = statSync(p).mtimeMs; if (m > n) n = m; } }
  };
  walk(dir); return n;
}
export default function Page() {
  const files = readdirSync(MMD_DIR).filter(f => f.endsWith(".mmd")).sort();
  const diagrams = files.map(f => {
    const code = readFileSync(join(MMD_DIR, f), "utf8");
    const title = code.match(/^%%\s*(.+)$/m)?.[1]?.trim() ?? f;
    return { slug: f.replace(/\.mmd$/, ""), title, code, mtime: statSync(join(MMD_DIR, f)).mtimeMs };
  });
  const newestMmd = Math.max(0, ...diagrams.map(d => d.mtime));
  const newestSrc = Math.max(0, ...SRC_DIRS.map(g => newestMtime(join(process.cwd(), g))));
  return <MermaidView diagrams={diagrams} staleInfo={{ stale: newestSrc > newestMmd, srcAt: newestSrc, mmdAt: newestMmd }} />;
}
```

`app/<admin>/architecture/MermaidView.tsx` (client — renders):
```tsx
"use client";
import { useEffect, useRef, useState } from "react";
type D = { slug: string; title: string; code: string; mtime: number };
export default function MermaidView({ diagrams, staleInfo }:
  { diagrams: D[]; staleInfo: { stale: boolean; srcAt: number; mmdAt: number } }) {
  const [active, setActive] = useState(0);
  const [svg, setSvg] = useState(""); const [err, setErr] = useState(""); const [zoom, setZoom] = useState(1);
  const seq = useRef(0);
  useEffect(() => { let dead = false; (async () => {
    setErr(""); setSvg("");
    try {
      const mermaid = (await import("mermaid")).default;
      mermaid.initialize({ startOnLoad: false, securityLevel: "loose", theme: "base" });
      const out = await mermaid.render(`m${++seq.current}`, diagrams[active].code);
      if (!dead) setSvg(out.svg);
    } catch (e) { if (!dead) setErr((e as Error).message); }
  })(); return () => { dead = true; }; }, [active, diagrams]);
  const fmt = (ms: number) => ms ? new Date(ms).toLocaleString() : "—";
  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto", fontFamily: "sans-serif" }}>
      <h1>Architecture (debug)</h1>
      <div style={{ margin: "8px 0", padding: 8, borderRadius: 6,
        background: staleInfo.stale ? "#fef3c7" : "#dcfce7" }}>
        {staleInfo.stale
          ? `⚠️ code changed after the diagram (code: ${fmt(staleInfo.srcAt)} · diagram: ${fmt(staleInfo.mmdAt)}) — regenerate & reload`
          : `✓ diagrams current (updated ${fmt(staleInfo.mmdAt)})`}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        {diagrams.map((d, i) => <button key={d.slug} onClick={() => { setActive(i); setZoom(1); }}
          style={{ padding: "6px 10px", background: i === active ? "#4f46e5" : "#fff", color: i === active ? "#fff" : "#333", border: "1px solid #ccc", borderRadius: 6 }}>{d.title}</button>)}
      </div>
      <div style={{ marginBottom: 8 }}>
        <button onClick={() => setZoom(z => Math.max(0.4, z - 0.15))}>–</button>
        <span style={{ margin: "0 8px" }}>{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.min(3, z + 0.15))}>+</button>
      </div>
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff", overflow: "auto", maxHeight: "78vh" }}>
        {err ? <pre style={{ color: "#b91c1c", padding: 16 }}>{err}</pre>
          : !svg ? <div style={{ padding: 32, color: "#999" }}>rendering…</div>
          : <div style={{ transform: `scale(${zoom})`, transformOrigin: "top center", width: "fit-content", margin: "0 auto", padding: 16 }}
                 dangerouslySetInnerHTML={{ __html: svg }} />}
      </div>
    </main>
  );
}
```
Then: `pnpm add mermaid` (or npm/yarn), add a nav link, and hit the route to verify it compiles.

---

## Recipe B — Vite / CRA / plain React
- Put the `.mmd` files where they're served statically (e.g. `public/mermaid/`).
- A component `fetch()`es each `.mmd` then renders with `mermaid` (same client logic as above). Staleness can't use fs at runtime — either skip the banner or bake mtimes at build time.

## Recipe C — anything else (server-rendered templates, non-JS stacks, or user unsure)
- Skip the in-app tab. Point the user at the **standalone HTML viewer** (`docs/architecture-flow.html` from Step 4) — it needs no framework and opens in any browser.

---

## Notes
- Keep the nav label unambiguous that it's a **debug** aid.
- The client uses `mermaid.render(id, code)` inside `useEffect` (browser-only) — never import mermaid at module top-level in SSR.
- If the app can't take a new dependency, use the CDN import form: `await import("https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs")` with a `/* @vite-ignore */` or bundler-ignore hint.
