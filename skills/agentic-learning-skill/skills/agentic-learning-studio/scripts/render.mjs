#!/usr/bin/env node
/**
 * render.mjs — Blueprint JSON → ONE self-contained interactive HTML lesson.
 *
 * Zero dependencies (Node 16+ only). This is the deterministic renderer at the
 * heart of the methodology: the model emits a typed **Blueprint** (data only —
 * never HTML/CSS/JS), and this hand-written renderer turns it into the page. That
 * is why the (i) glossary tooltips, mental map, decision matrices, interactive
 * visuals, and the end-of-lesson knowledge check ALWAYS work — a tested template
 * owns them, not a hopeful one-shot generation.
 *
 * Adapted from the hosted product (https://prathibhax.com) for STANDALONE use:
 *   • every module is rendered fully inline (no background build queue / server),
 *   • the knowledge check grades MCQs CLIENT-SIDE (answer key embedded) and reveals
 *     a model answer for free-text questions to self-check,
 *   • no API calls, no auth, no database — the file works offline by double-click.
 *
 * Usage:
 *   node render.mjs blueprint.json                 # writes blueprint.html next to it
 *   node render.mjs blueprint.json lesson.html     # explicit output path
 *   node render.mjs blueprint.json -                # write HTML to stdout
 *   cat blueprint.json | node render.mjs - out.html # read Blueprint from stdin
 *
 * The renderer is forgiving: it normalizes + repairs a slightly-imperfect
 * Blueprint (fills safe defaults, drops dangling term/citation refs, aligns
 * decision-matrix cells, guarantees a visible block per module, wires the mental
 * map) and prints any residual warnings to stderr — it renders rather than crash.
 */

import { readFileSync, writeFileSync } from "node:fs";

/* ============================================================================
 * 1. CSS — the look of the lesson (inlined so the file is self-contained).
 *    Ported verbatim from the product's render/tokens.ts. Includes the 27-combo
 *    visibility gates driven by body[data-level/depth/examples].
 * ========================================================================== */
const ARTIFACT_CSS = String.raw`
:root{
  --accent:#2563eb; --accent-2:#1d4ed8; --accent-weak:#e8efff;
  --ink:#0f1729; --ink-soft:#27324a; --muted:#56607a; --faint:#8893ab;
  --bg:#f5f8ff; --surface:#ffffff; --surface-2:#f9fbff;
  --border:#e3e9f5; --border-strong:#d0d9ee;
  --ok:#1d9e75; --ok-weak:#e6f6ef; --warn:#b9770a; --warn-weak:#fbf1de;
  --danger:#d2433a; --danger-weak:#fcebea; --info:#2563eb; --info-weak:#e8efff;
  --code-bg:#0b1228; --code-ink:#e7ecff;
  --radius:14px; --radius-sm:9px; --measure:780px;
  --font-body:"Plus Jakarta Sans",ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  --font-head:"Plus Jakarta Sans",ui-sans-serif,system-ui,sans-serif;
  --font-mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
  --shadow:0 1px 2px rgba(15,23,41,.05),0 10px 30px rgba(37,99,235,.08);
}
[data-theme="dark"]{
  --ink:#eaf0ff; --ink-soft:#c8d2ea; --muted:#9aa6c4; --faint:#76829f;
  --bg:#0a0f1f; --surface:#121829; --surface-2:#161d31;
  --border:#222a44; --border-strong:#313b5c; --accent-weak:#142149;
  --code-bg:#070b18; --shadow:0 1px 2px rgba(0,0,0,.3),0 12px 34px rgba(0,0,0,.5);
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--font-body);line-height:1.65;font-size:16px}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important;scroll-behavior:auto!important}}
a{color:var(--accent);text-decoration:none}
.shell{max-width:min(1240px,94vw);margin:0 auto;padding:22px 26px 56px}
h1,h2,h3,h4{line-height:1.25;letter-spacing:-.01em;color:var(--ink);font-family:var(--font-head)}
.eyebrow{color:var(--accent);font-weight:700;font-size:12px;letter-spacing:.06em;text-transform:uppercase}
.muted{color:var(--muted)}
code{font-family:var(--font-mono);font-size:.88em;background:var(--accent-weak);color:var(--accent-2);padding:1px 6px;border-radius:6px}

.topbar{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--bg) 86%,transparent);backdrop-filter:blur(8px);border-bottom:1px solid var(--border)}
.topbar-in{max-width:1320px;margin:0 auto;padding:10px 26px;display:flex;align-items:center;gap:14px}
.tb-left{flex:1 1 0;display:flex;justify-content:flex-start;min-width:0}
.tb-center{flex:0 1 auto;text-align:center;min-width:0;padding:0 10px}
.tb-right{flex:1 1 0;display:flex;align-items:center;justify-content:flex-end;gap:12px;flex-wrap:wrap}
.brand-mini{font-weight:800;font-size:17px;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:inline-block;max-width:100%}
.spacer{flex:1}
@media(max-width:820px){.brand-mini{font-size:14px}.tb-right{gap:8px}}
.progress{height:6px;width:120px;background:var(--border);border-radius:99px;overflow:hidden}
.progress > i{display:block;height:100%;width:0;background:var(--accent);transition:width .3s ease}
.tbtn{border:1px solid var(--border-strong);background:var(--surface);color:var(--ink);font:inherit;font-size:12.5px;padding:5px 11px;border-radius:8px;cursor:pointer}

.hero{padding:14px 0 6px}
.hero h1{font-size:32px;font-weight:800;margin:.18em 0 .25em}
.thesis{font-size:18px;color:var(--ink-soft);font-weight:500}
.meta-line{margin-top:10px;color:var(--muted);font-size:13.5px;display:flex;gap:14px;flex-wrap:wrap}

.map{margin:26px 0 8px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);box-shadow:var(--shadow);padding:18px}
.map h2{font-size:15px;margin:0 0 3px}
.map .cap{color:var(--muted);font-size:13px;margin:0 0 14px}
.map-layer{margin:0 0 10px}
.map-layer-label{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--faint);font-weight:700;margin:0 0 6px}
.map-row{display:flex;flex-wrap:wrap;gap:9px}
.map-node{flex:1 1 240px;min-width:230px;text-align:left;border:1px solid var(--border-strong);background:var(--surface-2);border-radius:11px;padding:12px 14px;cursor:pointer;font:inherit;color:var(--ink);transition:border-color .12s,transform .08s,box-shadow .12s}
.map-node:hover{border-color:var(--accent);transform:translateY(-1px);box-shadow:var(--shadow)}
.map-node.spine{border-left:3px solid var(--accent)}
.map-node .mn-title{font-weight:600;font-size:13.5px}
.map-node .mn-sub{font-size:11.5px;color:var(--muted);margin-top:2px}

[hidden]{display:none!important}

#overview:not([hidden]){height:calc(100dvh - 54px);overflow:hidden;display:flex;flex-direction:column}
#overview .shell{flex:1;min-height:0;width:100%;display:flex;flex-direction:column;overflow:hidden;padding:14px 26px}
#overview .hero{flex:none;padding:2px 0 0}
#overview .hero h1{font-size:25px;margin:.05em 0 .1em}
#overview .thesis{font-size:14.5px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
#overview .meta-line{margin-top:6px;font-size:12.5px}
#overview .ov-hint{flex:none;margin:8px 0 0}
#overview .map{flex:1;min-height:0;display:flex;flex-direction:column;margin:12px 0 0;overflow:hidden;padding:14px 16px}
#overview .map h2{font-size:14px}
#overview .map .cap{margin:0 0 8px}
#overview .map-body{flex:1;min-height:0;overflow:hidden;display:flex;align-items:center;justify-content:center}
#overview .map-path,#overview .map-concept,#overview .map-options{
  width:100%;max-height:100%;justify-content:center;align-content:center;align-items:center;
}
#overview .map .map-node{width:clamp(132px,13vw,176px)}
@media(max-width:820px){
  #overview:not([hidden]){height:auto;overflow:visible}
  #overview .shell,#overview .map,#overview .map-body{overflow:visible;min-height:0}
  #overview .map-body{align-items:flex-start}
  #overview .map .map-node{width:clamp(128px,40vw,176px)}
}

.ov-hint{text-align:center;color:var(--muted);font-size:13.5px;margin:18px 0 0}
.nav-back{margin-right:4px}
#workbench{display:grid;grid-template-columns:248px 1fr;align-items:start}
#blocknav{position:sticky;top:53px;align-self:start;max-height:calc(100vh - 53px);overflow:auto;border-right:1px solid var(--border);padding:16px 10px;display:flex;flex-direction:column;gap:3px;background:var(--surface)}
.navitem{display:flex;align-items:center;gap:10px;text-align:left;width:100%;border:none;background:transparent;color:var(--ink-soft);font:inherit;font-size:13.5px;padding:9px 11px;border-radius:9px;cursor:pointer;line-height:1.3}
.navitem:hover{background:var(--surface-2)}
.navitem.active{background:var(--accent-weak);color:var(--accent-2);font-weight:600}
.navitem .ni-num{flex:none;width:22px;height:22px;border-radius:7px;background:var(--border);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--ink-soft)}
.navitem.active .ni-num{background:var(--accent);color:#fff}
.navitem.nav-special{color:var(--muted)}
#blockmain{padding:26px 40px 90px;min-width:0;max-width:1000px;margin:0 auto}
#blockmain .block p,#blockmain .block ul,#blockmain .block ol,#blockmain .module-body>p{max-width:760px}
.panel{display:none}
.panel.active{display:block;animation:fadein .22s ease}
@keyframes fadein{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
.panel h2{font-size:24px;font-weight:800;margin:.1em 0 .35em}

.module-head{padding:0 0 4px}
.panel .module-body{padding:0}
.module-head .num{color:var(--accent);font-weight:800;font-size:13px}
.module-head h2{font-size:22px;font-weight:800;margin:.15em 0 .1em}
.module-head .sub{color:var(--muted);font-size:14px;margin:0}
.module-body{padding:6px 22px 22px}
.objectives{background:var(--accent-weak);border-radius:var(--radius-sm);padding:11px 14px;margin:14px 0;font-size:13.5px}
.objectives b{display:block;color:var(--accent-2);font-size:11px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:5px}
.objectives ul{margin:0;padding-left:18px}
.decision-forces{font-size:13px;color:var(--warn);background:var(--warn-weak);border-radius:var(--radius-sm);padding:9px 13px;margin:12px 0}
.keyterms{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0}

.block{margin:16px 0}
.block h3{font-size:16px;margin:0 0 6px}
.block p{margin:.5em 0;color:var(--ink-soft)}
.block ul,.block ol{margin:.4em 0;padding-left:20px;color:var(--ink-soft)}
.block li{margin:.25em 0}
.callout{border-left:3px solid var(--info);background:var(--info-weak);border-radius:0 var(--radius-sm) var(--radius-sm) 0;padding:11px 14px;margin:14px 0}
.callout.good{border-color:var(--ok);background:var(--ok-weak)}
.callout.warn{border-color:var(--warn);background:var(--warn-weak)}
.callout.danger{border-color:var(--danger);background:var(--danger-weak)}

.dcall{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--border);border:1px solid var(--border);border-radius:var(--radius-sm);overflow:hidden;margin:14px 0}
.dcall > div{background:var(--surface);padding:11px 13px;font-size:13.5px}
.dcall .lab{font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;font-weight:700;margin-bottom:4px}
.dcall .use .lab{color:var(--ok)} .dcall .avoid .lab{color:var(--danger)}
.dcall .rot{grid-column:1/-1;background:var(--accent-weak);color:var(--accent-2)}

.matrix{overflow-x:auto;margin:14px 0}
table.dm{border-collapse:collapse;width:100%;font-size:13px;min-width:520px}
table.dm th,table.dm td{border:1px solid var(--border);padding:8px 10px;text-align:left;vertical-align:top}
table.dm thead th{background:var(--surface-2);font-weight:700}
table.dm td.when{background:var(--accent-weak);color:var(--accent-2);font-weight:500}
.rate{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px}
.rate.good{background:var(--ok)} .rate.ok{background:var(--warn)} .rate.bad{background:var(--danger)}
.howread{font-size:12px;color:var(--muted);margin-top:6px}

.ex{margin:16px 0;border:1px solid var(--border);border-radius:var(--radius-sm);overflow:hidden}
.ex-tabs{display:flex;gap:0;background:var(--surface-2);border-bottom:1px solid var(--border)}
.ex-tabs label{padding:8px 14px;font-size:12.5px;font-weight:600;color:var(--muted);cursor:pointer;border-bottom:2px solid transparent}
.ex input[type=radio]{position:absolute;opacity:0;pointer-events:none}
.ex-pane{display:none;padding:0}
.ex .pane-functional{padding:14px}
pre.code{margin:0;background:var(--code-bg);color:var(--code-ink);padding:14px 16px;overflow-x:auto;font-family:var(--font-mono);font-size:12.8px;line-height:1.6}
pre.code .cm{color:#7f88b3}
.code-path{font-size:11px;color:var(--faint);padding:7px 14px;background:var(--surface-2);border-bottom:1px solid var(--border);font-family:var(--font-mono)}
.copy{float:right;border:1px solid var(--border-strong);background:var(--surface);color:var(--muted);font:inherit;font-size:11px;padding:2px 8px;border-radius:6px;cursor:pointer}
.ex input.t-functional:checked ~ .ex-tabs label[for$="-fn"],
.ex input.t-code:checked ~ .ex-tabs label[for$="-code"]{color:var(--accent);border-bottom-color:var(--accent)}
.ex input.t-functional:checked ~ .pane-functional{display:block}
.ex input.t-code:checked ~ .pane-code{display:block}

.walk{counter-reset:step;margin:14px 0}
.walk .step{display:flex;gap:12px;padding:8px 0}
.walk .step .n{counter-increment:step;flex:none;width:26px;height:26px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700}
.walk .step .n::before{content:counter(step)}
.scn{border:1px dashed var(--border-strong);border-radius:var(--radius-sm);padding:12px 14px;margin:14px 0;font-size:13.5px}
.scn .ask{font-weight:600}.scn .imp{color:var(--muted);margin-top:4px}
.tax{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin:14px 0}
.tax .grp{border:1px solid var(--border);border-radius:var(--radius-sm);padding:11px 13px;background:var(--surface-2)}
.tax .grp h4{margin:0 0 6px;font-size:13px}
.tax .grp ul{margin:0;padding-left:16px;font-size:12.5px;color:var(--ink-soft)}

.quiz{border:1px solid var(--accent);border-radius:var(--radius-sm);background:var(--accent-weak);padding:14px;margin:18px 0}
.quiz .q{font-weight:600;margin-bottom:9px}
.quiz .opt{display:block;width:100%;text-align:left;border:1px solid var(--border-strong);background:var(--surface);color:var(--ink);font:inherit;font-size:13.5px;padding:9px 12px;border-radius:8px;margin:5px 0;cursor:pointer}
.quiz .opt:hover{border-color:var(--accent)}
.quiz .opt.correct{border-color:var(--ok);background:var(--ok-weak)}
.quiz .opt.wrong{border-color:var(--danger);background:var(--danger-weak)}
.quiz .reveal{border:none;background:var(--accent);color:#fff;font:inherit;font-size:13px;padding:7px 14px;border-radius:8px;cursor:pointer;margin-top:8px}
.quiz .answer{display:none;margin-top:10px;font-size:13.5px;color:var(--ink-soft);border-top:1px solid var(--border-strong);padding-top:10px}
.quiz.revealed .answer{display:block}

.deeper-toggle{border:1px dashed var(--border-strong);background:transparent;color:var(--accent);font:inherit;font-size:13px;font-weight:600;padding:8px 14px;border-radius:8px;cursor:pointer;margin:10px 0;width:100%}
.deeper{display:none}
.module.show-deeper .deeper{display:block}

.term{border:none;background:transparent;color:inherit;font:inherit;cursor:pointer;border-bottom:1.5px dotted var(--accent);padding:0;white-space:nowrap}
.term .i{display:inline-flex;align-items:center;justify-content:center;width:13px;height:13px;font-size:9px;font-weight:700;color:#fff;background:var(--accent);border-radius:50%;margin-left:3px;vertical-align:super;line-height:1}
.term-chip{border:1px solid var(--border-strong);background:var(--surface-2);color:var(--ink-soft);font:inherit;font-size:12px;padding:3px 9px 3px 10px;border-radius:99px;cursor:pointer}
.term-chip .i{font-size:9px;margin-left:5px}
#popover{position:fixed;z-index:60;max-width:300px;background:var(--surface);border:1px solid var(--border-strong);border-radius:var(--radius-sm);box-shadow:var(--shadow);padding:12px 14px;font-size:13px;display:none}
#popover.on{display:block}
#popover .pt{font-weight:700;margin-bottom:3px}
#popover .px{font-size:10.5px;color:var(--accent);text-transform:uppercase;letter-spacing:.04em}
#popover .pn{color:var(--ink-soft)}
#popover .ptech{margin-top:7px;padding-top:7px;border-top:1px solid var(--border);color:var(--muted);font-size:12px}
#popover .psrc{margin-top:7px;font-size:11px;color:var(--faint)}

.synth{margin:34px 0;border:1px solid var(--accent);border-radius:var(--radius);background:var(--surface);box-shadow:var(--shadow);padding:22px}
.synth h2{font-size:20px;margin:0 0 8px}
.checklist{list-style:none;padding:0;margin:12px 0}
.checklist li{padding:7px 0;border-bottom:1px solid var(--border);font-size:14px;display:flex;gap:9px}
.checklist li::before{content:"\2610";color:var(--accent)}
.capstone{margin-top:14px;background:var(--accent-weak);border-radius:var(--radius-sm);padding:13px 15px;font-size:14px}
.cites{margin-top:30px;font-size:12.5px;color:var(--muted);border-top:1px solid var(--border);padding-top:14px}
.cites h3{font-size:13px;color:var(--ink)}
.cites ol{padding-left:18px}

.whatsnew{border:1px solid var(--info);background:var(--info-weak);border-radius:var(--radius-sm);padding:12px 15px;margin:18px 0;font-size:13.5px}
.whatsnew .lab{font-weight:700;color:var(--info);font-size:11px;text-transform:uppercase;letter-spacing:.04em}

.map-node .mn-what{font-size:12.5px;color:var(--ink-soft);margin-top:5px;line-height:1.5}
.map-node .mn-rel{font-size:11.5px;color:var(--muted);margin-top:7px;border-top:1px dashed var(--border-strong);padding-top:6px;line-height:1.5}
.map-node .mn-rel-lab{display:block;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--accent);margin-bottom:2px}

.toggle-group{display:flex;gap:6px;flex-wrap:wrap}
.tbtn.toggle{font-size:12px;padding:5px 10px}
.tbtn.toggle[aria-pressed="true"]{background:var(--accent);color:#fff;border-color:var(--accent)}
.tbtn.toggle[aria-pressed="false"]{opacity:.62}
body.hide-concept .b-concept{display:none!important}
body.hide-funcex .b-funcex{display:none!important}
body.hide-code .b-code{display:none!important}

.syntax-panel{display:none;margin:10px 0 0;border:1px solid var(--border);border-left:3px solid var(--accent);border-radius:0 var(--radius-sm) var(--radius-sm) 0;background:var(--surface-2);padding:11px 14px}
body.show-syntax .syntax-panel{display:block}
.syntax-panel .sp-h{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--accent-2);margin-bottom:7px}
.syntax-panel dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font-size:13px}
.syntax-panel dt{margin:0}
.syntax-panel dt code{font-size:12px;background:var(--accent-weak);color:var(--accent-2);padding:1px 6px;border-radius:6px;white-space:nowrap}
.syntax-panel dd{margin:0;color:var(--ink-soft)}

.viz{border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);box-shadow:var(--shadow);padding:16px;margin:16px 0}
.viz .viz-cap{font-size:13.5px;color:var(--muted);margin:0 0 12px}
.viz-body{min-height:36px}
.viz-controls{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}
.viz-qbtn{border:1px solid var(--border-strong);background:transparent;color:var(--accent);font:inherit;font-size:12.5px;padding:5px 11px;border-radius:8px;cursor:pointer}
.viz-qbtn.sel{background:var(--accent);color:#fff;border-color:var(--accent)}
.viz-scatter-grid{display:grid;grid-template-columns:1fr 200px;gap:14px;align-items:start}
.viz svg.scatter{width:100%;border:1px solid var(--border);border-radius:10px;background:var(--surface-2)}
.viz-near{margin:0;padding-left:18px;font-size:13px;color:var(--ink-soft)}
.viz-near-lab{font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px}
.viz-slider-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.viz-slider-row input[type=range]{accent-color:var(--accent);flex:1;min-width:160px}
.viz-readout{font-size:14px}.viz-readout b{color:var(--accent-2)}
.viz-stop-note{margin-top:10px;font-size:13.5px;color:var(--ink-soft);background:var(--accent-weak);border-radius:var(--radius-sm);padding:10px 13px}
.viz-stop-note .vsn-label{font-weight:700;color:var(--accent-2)}
.viz-steps-nav{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
.viz-step-btn{border:1px solid var(--border-strong);background:var(--surface);color:var(--ink-soft);font:inherit;font-size:12.5px;padding:6px 11px;border-radius:8px;cursor:pointer;display:flex;gap:6px;align-items:center}
.viz-step-btn.active{background:var(--accent);color:#fff;border-color:var(--accent)}
.viz-step-btn .vsb-n{font-weight:700}
.viz-step-detail{font-size:14px;color:var(--ink-soft);border-left:3px solid var(--accent);background:var(--surface-2);border-radius:0 var(--radius-sm) var(--radius-sm) 0;padding:12px 15px}
.viz-step-detail h4{margin:0 0 5px;font-size:15px;color:var(--ink)}
@media(max-width:560px){.viz-scatter-grid{grid-template-columns:1fr}}

.provenance{display:flex;gap:11px;align-items:flex-start;margin:18px 0;padding:13px 16px;border:1px solid var(--accent);background:var(--accent-weak);border-radius:var(--radius-sm);font-size:13.5px;color:var(--ink-soft)}
.provenance .prov-star{color:var(--accent);font-size:16px;line-height:1.3;flex:none}
.provenance strong{color:var(--accent-2)}
.cites li.src-upload{color:var(--accent-2);font-weight:500}

.building{display:flex;align-items:center;gap:9px;margin:16px 0;padding:13px 15px;border:1px dashed var(--border-strong);border-radius:var(--radius-sm);background:var(--surface-2);color:var(--muted);font-size:13.5px}
.bspin{flex:none;width:13px;height:13px;border-radius:50%;border:2px solid var(--border-strong);border-top-color:var(--accent);animation:bspin .8s linear infinite}
@keyframes bspin{to{transform:rotate(360deg)}}

body[data-depth="conceptual"] .needs-technical{display:none}
body[data-depth="technical"] .needs-conceptual{display:none}
body[data-examples="functional"] .needs-code{display:none}
body[data-examples="code"] .needs-functional{display:none}
body[data-level="advanced"] .lvl-beginner-only{display:none}
body[data-level="beginner"] .lvl-advanced-only{display:none}

.blk-explain{background:linear-gradient(180deg,var(--surface) 0%,var(--surface) 100%);border-left:3px solid var(--accent)}
.blk-example{background:#fff8ec;border-left:3px solid #f0a92b}
[data-theme="dark"] .blk-example{background:#241d0f}
.blk-code{background:#eef4ff;border-left:3px solid var(--accent-2)}
[data-theme="dark"] .blk-code{background:#0e1733}
.blk-check{background:#f0fbf5;border-left:3px solid var(--ok)}
[data-theme="dark"] .blk-check{background:#0e2419}
.block.blk-explain,.block.blk-example,.block.blk-code,.block.blk-check{border-radius:12px;padding:14px 16px;margin:14px 0}

.analogy{background:var(--accent-weak);border-radius:10px;padding:9px 12px;margin:2px 0 10px;font-size:14.5px;color:var(--ink-soft)}
.analogy .an-lab{display:block;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--accent-2);margin-bottom:2px}
body[data-level="advanced"] .analogy,body[data-level="advanced"] .mn-layman{display:none}

.collapse{margin:6px 0}
.collapse-h{display:flex;align-items:center;gap:9px;width:100%;text-align:left;border:1px dashed var(--border-strong);background:transparent;color:var(--ink-soft);font:inherit;font-size:13.5px;font-weight:600;padding:9px 12px;border-radius:9px;cursor:pointer}
.collapse-h:hover{border-color:var(--accent);color:var(--accent-2)}
.collapse-h .col-ico{font-family:var(--font-mono)}
.collapse-h .col-chev{margin-left:auto;transition:transform .15s}
.collapse.open .collapse-h .col-chev{transform:rotate(90deg)}
.collapse-body{display:none;padding-top:10px}
.collapse.open .collapse-body{display:block;animation:fadein .25s ease}

.kc h3{margin:.1em 0 .4em}
.kc-intro{color:var(--muted);font-size:14px;margin:0 0 12px}
.kc-score{font-size:13px;color:var(--ok);font-weight:600;margin-bottom:10px}
.kc-item{border-top:1px solid var(--border);padding:13px 0}
.kc-item:first-of-type{border-top:none}
.kc-q{font-weight:600;font-size:14.5px;margin-bottom:9px;display:flex;gap:8px}
.kc-n{flex:none;background:var(--ok);color:#fff;font-size:11px;font-weight:700;border-radius:6px;padding:1px 7px;height:fit-content}
.kc-opts{display:flex;flex-direction:column;gap:7px}
.kc-opt{text-align:left;border:1px solid var(--border-strong);background:var(--surface);color:var(--ink);font:inherit;font-size:14px;padding:9px 12px;border-radius:9px;cursor:pointer;transition:border-color .12s,background .12s}
.kc-opt:hover{border-color:var(--accent)}
.kc-opt.correct{border-color:var(--ok);background:var(--ok-weak);color:#0f6e4f}
.kc-opt.wrong{border-color:var(--danger);background:var(--danger-weak);color:var(--danger)}
.kc-opt[disabled]{cursor:default;opacity:.85}
.kc-free{display:flex;flex-direction:column;gap:8px}
.kc-input{border:1px solid var(--border-strong);border-radius:9px;font:inherit;font-size:14px;padding:9px 11px;resize:vertical;background:var(--surface);color:var(--ink)}
.kc-input:focus{outline:none;border-color:var(--accent)}
.kc-submit{align-self:flex-start;border:none;background:var(--accent);color:#fff;font:inherit;font-size:13px;font-weight:600;padding:7px 15px;border-radius:9px;cursor:pointer}
.kc-submit[disabled]{opacity:.6;cursor:default}
.kc-feedback{font-size:13.5px;font-weight:600;margin-bottom:8px;padding:8px 11px;border-radius:8px}
.kc-feedback.ok{background:var(--ok-weak);color:#0f6e4f}
.kc-feedback.no{background:var(--danger-weak);color:var(--danger)}
.kc-feedback.grading{background:var(--accent-weak);color:var(--accent-2)}
.kc-answer{font-size:13.5px;color:var(--ink-soft);margin-top:8px;padding:9px 12px;background:var(--ok-weak);border-radius:8px}
.kc-answer strong{color:#0f6e4f}
.kc-explain{font-size:13.5px;color:var(--muted);margin-top:9px;padding-left:11px;border-left:2px solid var(--border-strong)}

.reveal{opacity:0;transform:translateY(10px);transition:opacity .45s ease,transform .45s ease}
.reveal.in{opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){.reveal{opacity:1;transform:none;transition:none}}

.module-head{display:flex;gap:13px;align-items:flex-start}
.module-head .m-ico{flex:none;width:42px;height:42px;display:flex;align-items:center;justify-content:center;font-size:22px;background:var(--accent-weak);border-radius:11px}
.module-head .mh-text{min-width:0}
.m-time{font-size:12px;color:var(--muted);margin-top:4px}

.recap{background:var(--accent-weak);border:1px solid var(--border);border-radius:12px;padding:12px 14px;margin:12px 0 0}
.recap-h{font-weight:700;font-size:13px;color:var(--accent-2);margin-bottom:6px}
.recap ul{margin:0;padding-left:18px;font-size:13px;color:var(--ink-soft)}
.recap li{margin:2px 0}

.map-body{margin-top:8px}
.map .map-node{
  position:relative;box-sizing:border-box;
  flex:0 0 auto;width:clamp(150px,15vw,196px);min-width:0;aspect-ratio:1;
  text-align:left;border:1px solid var(--border-strong);background:var(--surface-2);
  border-radius:14px;padding:16px 14px 14px;cursor:pointer;font:inherit;color:var(--ink);
  overflow:visible;transition:border-color .12s,transform .08s,box-shadow .12s;
}
.map .map-node:hover{border-color:var(--accent);transform:translateY(-2px);box-shadow:var(--shadow)}
.map .map-node.spine{border-color:var(--accent);border-width:1.5px}
.map .map-node.no-link{cursor:default}
.map .map-node.no-link:hover{transform:none;box-shadow:none}
.map .mn-body{display:flex;flex-direction:column;gap:6px;height:100%;overflow:hidden}
.map .mn-num,.map .mn-ico{
  position:absolute;top:0;left:0;transform:translate(-42%,-42%);
  width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;
  font-weight:800;font-size:14px;box-shadow:0 1px 3px rgba(0,0,0,.18);margin:0;z-index:1;
}
.map .mn-num{background:var(--accent);color:#fff}
.map .mn-ico{background:var(--surface);border:1px solid var(--border-strong);font-size:16px}
.map .map-node.is-start .mn-num{box-shadow:0 0 0 4px var(--accent-weak),0 1px 3px rgba(0,0,0,.18)}
.map .mn-title{font-weight:700;font-size:14px;line-height:1.25;margin-top:2px}
.map .mn-desc{font-size:12px;color:var(--muted);line-height:1.42;
  display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow:hidden}
.map .mn-go{position:absolute;right:9px;bottom:8px;font-size:10.5px;font-weight:700;color:#fff;
  background:var(--accent);border-radius:99px;padding:2px 9px;box-shadow:0 1px 4px rgba(0,0,0,.15);
  opacity:0;transform:translateY(3px);transition:opacity .12s,transform .12s}
.map .map-node:hover .mn-go{opacity:1;transform:none}

.map-path{margin:0;padding:16px 10px 8px;display:flex;flex-wrap:nowrap;align-items:center;justify-content:center;gap:8px}
.map-path .map-node{flex:1 1 0;min-width:0;width:auto;max-width:200px}
.map-conn{flex:none;position:relative;width:clamp(20px,3vw,34px);height:3px;border-radius:2px;
  background:linear-gradient(90deg,var(--border-strong),var(--accent));overflow:visible}
.map-conn::after{content:"";position:absolute;right:-1px;top:50%;transform:translateY(-50%);
  border-left:7px solid var(--accent);border-top:4px solid transparent;border-bottom:4px solid transparent}
.map-conn .spark{position:absolute;top:50%;margin-top:-3px;left:0;width:6px;height:6px;border-radius:50%;
  background:var(--accent);box-shadow:0 0 8px 2px var(--accent);animation:flowx 1.8s linear infinite}
@keyframes flowx{0%{left:-4px;opacity:0}15%{opacity:1}85%{opacity:1}100%{left:calc(100% - 4px);opacity:0}}
@media (prefers-reduced-motion:reduce){.map-conn .spark{animation:none;display:none}}

.map-concept,.map-options{display:flex;flex-wrap:wrap;gap:16px 12px;align-items:flex-start;justify-content:center;padding:14px 10px 6px}

.m-spine{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:5px}
.m-pos{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--accent-2);background:var(--accent-weak);border-radius:99px;padding:2px 9px}
.m-prev{font-size:12px;color:var(--muted)}
.m-what{font-size:15.5px;color:var(--ink-soft);margin:12px 0 0;line-height:1.5}
.m-rel{margin-top:10px;font-size:13.5px;color:var(--ink-soft);background:var(--surface-2);border-left:3px solid var(--accent);border-radius:0 8px 8px 0;padding:8px 12px}
.m-rel-lab{display:block;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--accent-2);margin-bottom:2px}
.next-step{margin-top:20px;border:1px solid var(--accent);background:var(--accent-weak);color:var(--accent-2);font:inherit;font-weight:700;font-size:13.5px;padding:10px 16px;border-radius:10px;cursor:pointer}
.next-step:hover{background:var(--accent);color:#fff}

.term-chip,.term{transition:background .15s,color .15s,transform .12s}
.term-chip:hover,.term:hover{transform:translateY(-1px)}

@media print{
  .topbar,.tbtn,.copy,.deeper-toggle,.map-node .mn-go{display:none!important}
  .deeper{display:block!important}.quiz .answer{display:block!important}
  .syntax-panel{display:block!important}.collapse-body{display:block!important}
  .reveal{opacity:1!important;transform:none!important}
  .ex-pane{display:block!important}.module{break-inside:avoid;box-shadow:none}
  #workbench{display:block!important}#blocknav{display:none!important}
  .panel{display:block!important}
}
@media (max-width:560px){.dcall{grid-template-columns:1fr}.module-head h2{font-size:20px}}
`;

/* ============================================================================
 * 2. RUNTIME — the ONE inline script every lesson carries. Hand-written + tested;
 *    the model never writes JS. Vertical subset of the product runtime, with the
 *    knowledge check grading CLIENT-SIDE (no server). A single delegated click
 *    handler powers: overview<->workbench, (i) popovers, Go-deeper, predict/reveal,
 *    quiz scoring, content toggles, copy, theme, scroll-reveal, viz hydration, and
 *    the graded knowledge check.
 * ========================================================================== */
const RUNTIME_JS = String.raw`
(function(){
  "use strict";
  var glossary = {};
  try { glossary = JSON.parse(document.getElementById("glossary-data").textContent || "{}"); } catch(e){}
  var depth = document.body.getAttribute("data-depth") || "conceptual_technical";
  var showTech = depth.indexOf("technical") !== -1;
  var pop = document.getElementById("popover");

  function lsGet(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function lsSet(k,v){ try { localStorage.setItem(k,v); } catch(e){} }

  function applyTheme(t){ document.body.setAttribute("data-theme", t); document.documentElement.setAttribute("data-theme", t); var b=document.getElementById("theme"); if(b) b.textContent = t==="dark" ? "☀ Light" : "☾ Dark"; }
  applyTheme(lsGet("als-theme") || "light");

  var moduleIds = Array.prototype.map.call(document.querySelectorAll(".navitem:not(.nav-special)"), function(b){ return b.getAttribute("data-goto"); });
  var total = moduleIds.length || 1;
  var visited = {};
  function markVisited(id){ if(moduleIds.indexOf(id) !== -1 && !visited[id]){ visited[id]=1; setProgress(); } }
  function setProgress(){ var n=Object.keys(visited).length; var pct=Math.round(n/total*100); var bar=document.querySelector(".progress > i"); if(bar) bar.style.width = pct+"%"; }

  function enterWorkbench(id){
    var ov=document.getElementById("overview"), wb=document.getElementById("workbench"), back=document.getElementById("to-overview");
    if(ov) ov.hidden=true; if(wb) wb.hidden=false; if(back) back.hidden=false;
    activatePanel(id);
    window.scrollTo(0,0);
  }
  function showOverview(){
    var ov=document.getElementById("overview"), wb=document.getElementById("workbench"), back=document.getElementById("to-overview");
    if(ov) ov.hidden=false; if(wb) wb.hidden=true; if(back) back.hidden=true;
    closePopover(); window.scrollTo(0,0);
  }
  function activatePanel(id){
    var found=false;
    document.querySelectorAll(".panel").forEach(function(p){ var on = p.getAttribute("data-panel")===id; p.classList.toggle("active", on); if(on) found=true; });
    document.querySelectorAll(".navitem").forEach(function(b){ b.classList.toggle("active", b.getAttribute("data-goto")===id); });
    if(found) markVisited(id);
    var main=document.getElementById("blockmain"); if(main) main.scrollTop=0;
  }

  function openPopover(btn){
    var t = glossary[btn.getAttribute("data-term")];
    if(!t){ return; }
    var tech = (showTech && t.technicalNote) ? '<div class="ptech">'+esc(t.technicalNote)+'</div>' : '';
    var acr = t.acronymExpansion ? '<div class="px">'+esc(t.acronymExpansion)+'</div>' : '';
    var src = (t.sources && t.sources.length) ? '<div class="psrc">Source: '+esc(t.sources.join(", "))+'</div>' : '';
    pop.innerHTML = '<div class="pt">'+esc(t.label)+'</div>'+acr+'<div class="pn">'+esc(t.laymanDefinition)+'</div>'+tech+src;
    pop.classList.add("on");
    var r = btn.getBoundingClientRect();
    var top = r.bottom + 8, left = Math.min(r.left, window.innerWidth - 320);
    if(top + pop.offsetHeight > window.innerHeight) top = r.top - pop.offsetHeight - 8;
    pop.style.top = Math.max(8, top) + "px";
    pop.style.left = Math.max(8, left) + "px";
  }
  function closePopover(){ pop.classList.remove("on"); pop._for=null; }

  function copyCode(btn){
    var pre = btn.parentElement.querySelector("pre.code"); if(!pre) return;
    var txt = pre.innerText;
    if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(txt).then(function(){flash(btn);}); }
    else { var ta=document.createElement("textarea"); ta.value=txt; document.body.appendChild(ta); ta.select(); try{document.execCommand("copy");}catch(e){} document.body.removeChild(ta); flash(btn); }
  }
  function flash(btn){ var o=btn.textContent; btn.textContent="Copied"; setTimeout(function(){btn.textContent=o;},1200); }
  function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

  document.addEventListener("click", function(ev){
    var t = ev.target.closest("[data-deepdive],[data-goto],#to-overview,.term,.term-chip,.deeper-toggle,.quiz .opt,.quiz .reveal,#theme,.copy,.toggle,.collapse-h,.kc-opt,.kc-submit");
    if(!t){ if(!ev.target.closest("#popover")) closePopover(); return; }

    if(t.matches(".collapse-h")){
      var col=t.closest(".collapse"); var open=col.classList.toggle("open"); t.setAttribute("aria-expanded", String(open)); return;
    }
    if(t.matches(".kc-opt")){ kcAnswerMcq(t); return; }
    if(t.matches(".kc-submit")){ kcAnswerFree(t); return; }

    if(t.matches("[data-deepdive],[data-goto]")){ ev.preventDefault(); var gid=t.getAttribute("data-deepdive")||t.getAttribute("data-goto"); enterWorkbench(gid); return; }
    if(t.id==="to-overview"){ showOverview(); return; }
    if(t.matches(".term,.term-chip")){ ev.preventDefault(); ev.stopPropagation(); if(pop.classList.contains("on") && pop._for===t){ closePopover(); } else { openPopover(t); pop._for=t; } return; }
    if(t.matches(".deeper-toggle")){
      var mod=t.closest(".panel"); mod.classList.toggle("show-deeper"); t.textContent = mod.classList.contains("show-deeper") ? "Hide advanced detail" : t.getAttribute("data-label"); return;
    }
    if(t.matches(".quiz .reveal")){ t.closest(".quiz").classList.add("revealed"); return; }
    if(t.matches(".quiz .opt")){
      var correct = t.getAttribute("data-correct")==="1";
      t.classList.add(correct?"correct":"wrong");
      if(!correct){ var c=t.closest(".quiz").querySelector('.opt[data-correct="1"]'); if(c) c.classList.add("correct"); }
      t.closest(".quiz").classList.add("revealed"); return;
    }
    if(t.id==="theme"){ var cur=document.body.getAttribute("data-theme")==="dark"?"light":"dark"; applyTheme(cur); lsSet("als-theme",cur); return; }
    if(t.matches(".copy")){ copyCode(t); return; }
    if(t.classList.contains("toggle")){
      ev.preventDefault();
      var pressed = t.getAttribute("aria-pressed")==="true";
      if(t.id==="t-concept"){ document.body.classList.toggle("hide-concept", pressed); t.setAttribute("aria-pressed", String(!pressed)); }
      else if(t.id==="t-funcex"){ document.body.classList.toggle("hide-funcex", pressed); t.setAttribute("aria-pressed", String(!pressed)); }
      else if(t.id==="t-code"){ document.body.classList.toggle("hide-code", pressed); t.setAttribute("aria-pressed", String(!pressed)); }
      else if(t.id==="t-syntax"){ document.body.classList.toggle("show-syntax", !pressed); t.setAttribute("aria-pressed", String(!pressed)); }
      return;
    }
  });

  document.addEventListener("keydown", function(e){ if(e.key==="Escape"){ closePopover(); } });
  window.addEventListener("resize", closePopover);

  // ---- knowledge check (graded CLIENT-SIDE; the answer key is embedded) ----
  function kcMcqTotal(kc){ return kc.querySelectorAll('.kc-item[data-kind="mcq"]').length; }
  function kcBumpScore(kc){
    var items=kc.querySelectorAll(".kc-item"), got=0;
    items.forEach(function(it){ if(it.getAttribute("data-result")==="ok") got++; });
    var sc=kc.querySelector(".kc-score"); if(sc){ sc.hidden=false; var b=sc.querySelector("b"); if(b) b.textContent=String(got); var d=sc.querySelector("i"); if(d) d.textContent=String(kcMcqTotal(kc)); }
  }
  function kcShow(item, ok, msg, score){
    var fb=item.querySelector(".kc-feedback"); if(fb){ fb.hidden=false; fb.className="kc-feedback "+(ok?"ok":"no"); fb.textContent=msg||(ok?"Correct ✓":"Not quite"); }
    var ans=item.querySelector(".kc-answer"); if(ans) ans.hidden=false;
    var ex=item.querySelector(".kc-explain"); if(ex) ex.hidden=false;
    if(score!==false) item.setAttribute("data-result", ok?"ok":"no");
    kcBumpScore(item.closest(".kc"));
  }
  function kcAnswerMcq(btn){
    var item=btn.closest(".kc-item"); if(item.getAttribute("data-done")) return;
    item.setAttribute("data-done","1");
    item.querySelectorAll(".kc-opt").forEach(function(o){ o.setAttribute("disabled","1"); });
    var correct = btn.getAttribute("data-correct")==="1";
    if(correct){ btn.classList.add("correct"); }
    else { btn.classList.add("wrong"); var c=item.querySelector('.kc-opt[data-correct="1"]'); if(c) c.classList.add("correct"); }
    kcShow(item, correct);
  }
  function kcAnswerFree(btn){
    var item=btn.closest(".kc-item"), inp=item.querySelector(".kc-input"); if(!inp||!inp.value.trim()) return;
    if(item.getAttribute("data-done")) return;
    item.setAttribute("data-done","1");
    btn.setAttribute("disabled","1"); inp.setAttribute("readonly","1");
    // Self-graded: reveal the model answer + explanation so the learner can compare.
    // Free-text is NOT auto-scored (the score line counts MCQs only).
    kcShow(item, true, "Compare your answer with the model answer below.", false);
  }

  // ---- scroll-reveal ----
  var revObs=null;
  if("IntersectionObserver" in window){
    revObs=new IntersectionObserver(function(entries){ entries.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add("in"); revObs.unobserve(e.target); } }); }, {rootMargin:"0px 0px -8% 0px"});
  }
  function observeReveals(root){
    var els=(root||document).querySelectorAll(".reveal:not(.in)");
    if(!revObs){ els.forEach(function(el){ el.classList.add("in"); }); return; }
    els.forEach(function(el){ revObs.observe(el); });
  }

  // ---- hydrate interactive visual blocks (data-only -> live SVG/controls) ----
  function vEsc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
  function buildScatter(body, data){
    var pts=(data.points||[]), qs=(data.queries||[]);
    if(pts.length<1||qs.length<1){ return; }
    var W=460,H=300,PAD=34;
    function sx(x){ return PAD + (Math.max(0,Math.min(100,x))/100)*(W-2*PAD); }
    function sy(y){ return PAD + (Math.max(0,Math.min(100,y))/100)*(H-2*PAD); }
    body.innerHTML = '<div class="viz-controls">'+qs.map(function(q,i){return '<button class="viz-qbtn'+(i===0?' sel':'')+'" data-qi="'+i+'">'+vEsc(q.label)+'</button>';}).join("")+'</div>'+
      '<div class="viz-scatter-grid"><svg class="scatter" viewBox="0 0 '+W+' '+H+'"></svg><div><div class="viz-near-lab">Nearest matches</div><ol class="viz-near"></ol></div></div>';
    var svg=body.querySelector("svg.scatter"), near=body.querySelector(".viz-near"), maxD=Math.hypot(100,100);
    function draw(qi){
      var q=qs[qi];
      var ranked=pts.map(function(p){return {p:p,d:Math.hypot((p.x||0)-q.x,(p.y||0)-q.y)};}).sort(function(a,b){return a.d-b.d;});
      var nearSet={}; ranked.slice(0,3).forEach(function(r){ nearSet[r.p.label]=1; });
      var h="";
      ranked.slice(0,3).forEach(function(r){ h+='<line x1="'+sx(q.x)+'" y1="'+sy(q.y)+'" x2="'+sx(r.p.x)+'" y2="'+sy(r.p.y)+'" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="3 3" opacity="0.5"/>'; });
      pts.forEach(function(p){ var on=nearSet[p.label]; h+='<circle cx="'+sx(p.x)+'" cy="'+sy(p.y)+'" r="'+(on?7:5)+'" fill="'+(on?'var(--accent)':'var(--border-strong)')+'" stroke="var(--surface)" stroke-width="2"/><text x="'+(sx(p.x)+9)+'" y="'+(sy(p.y)+4)+'" font-size="10.5" fill="'+(on?'var(--accent-2)':'var(--muted)')+'" font-weight="'+(on?700:500)+'">'+vEsc(p.label)+'</text>'; });
      h+='<text x="'+sx(q.x)+'" y="'+(sy(q.y)+6)+'" font-size="20" text-anchor="middle" fill="var(--accent)">★</text>';
      svg.innerHTML=h;
      near.innerHTML=ranked.slice(0,3).map(function(r){ return '<li>'+vEsc(r.p.label)+' <span style="color:var(--faint)">· '+Math.max(0,1-r.d/maxD).toFixed(2)+'</span></li>'; }).join("");
    }
    body.querySelector(".viz-controls").addEventListener("click", function(e){ var b=e.target.closest(".viz-qbtn"); if(!b)return; body.querySelectorAll(".viz-qbtn").forEach(function(x){x.classList.remove("sel");}); b.classList.add("sel"); draw(+b.getAttribute("data-qi")); });
    draw(0);
  }
  function buildSlider(body, data){
    var min=+data.min, max=+data.max, unit=data.unit||"", stops=(data.stops||[]).slice().sort(function(a,b){return a.at-b.at;});
    if(stops.length<2||!(max>min)){ return; }
    var step=(max-min)/100; if(!(step>0)) step=1;
    body.innerHTML='<div class="viz-slider-row"><span class="viz-readout">'+vEsc(String(min))+'</span><input type="range" min="'+min+'" max="'+max+'" step="'+step+'" value="'+stops[0].at+'"><span class="viz-readout">'+vEsc(String(max))+'</span></div>'+
      '<div class="viz-readout" style="margin-top:8px">Value: <b class="vs-val"></b> '+vEsc(unit)+'</div>'+
      '<div class="viz-stop-note"><span class="vsn-label vs-lab"></span><span class="vs-note"></span></div>';
    var range=body.querySelector("input"), val=body.querySelector(".vs-val"), lab=body.querySelector(".vs-lab"), note=body.querySelector(".vs-note");
    function nearest(v){ var best=stops[0],bd=Math.abs(v-stops[0].at); for(var i=1;i<stops.length;i++){var d=Math.abs(v-stops[i].at); if(d<bd){bd=d;best=stops[i];}} return best; }
    function upd(){ var v=+range.value; val.textContent=Math.round(v*100)/100; var s=nearest(v); lab.textContent=s.label+" — "; note.textContent=s.note; }
    range.addEventListener("input", upd); upd();
  }
  function buildStepped(body, data){
    var steps=(data.steps||[]); if(steps.length<2){ return; }
    body.innerHTML='<div class="viz-steps-nav">'+steps.map(function(s,i){return '<button class="viz-step-btn'+(i===0?' active':'')+'" data-si="'+i+'"><span class="vsb-n">'+(i+1)+'</span>'+(s.icon?vEsc(s.icon)+' ':'')+vEsc(s.label)+'</button>';}).join("")+'</div><div class="viz-step-detail"></div>';
    var detail=body.querySelector(".viz-step-detail");
    function show(i){ var s=steps[i]; detail.innerHTML='<h4>'+(s.icon?vEsc(s.icon)+' ':'')+vEsc(s.label)+'</h4>'+vEsc(s.detail); body.querySelectorAll(".viz-step-btn").forEach(function(b,bi){b.classList.toggle("active", bi===i);}); }
    body.querySelector(".viz-steps-nav").addEventListener("click", function(e){ var b=e.target.closest(".viz-step-btn"); if(!b)return; show(+b.getAttribute("data-si")); });
    show(0);
  }
  function hydrateViz(viz){
    var kind=viz.getAttribute("data-viz"), dataEl=viz.querySelector(".viz-data"), body=viz.querySelector(".viz-body");
    if(!dataEl||!body||viz._hydrated) return;
    viz._hydrated=true;
    var data; try { data=JSON.parse(dataEl.textContent||"{}"); } catch(e){ return; }
    try {
      if(kind==="scatter") buildScatter(body,data);
      else if(kind==="slider") buildSlider(body,data);
      else if(kind==="stepped") buildStepped(body,data);
    } catch(e){ /* a bad payload never breaks the page */ }
  }
  function hydrate(root){ Array.prototype.forEach.call((root||document).querySelectorAll(".viz"), hydrateViz); }

  hydrate(document);
  observeReveals(document);
  setProgress();
})();
`;

/* ============================================================================
 * 3. HTML helpers
 * ========================================================================== */
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s) => esc(s).replace(/"/g, "&quot;");

/* ============================================================================
 * 4. Components — pure string functions, one per block/section. The model
 *    supplies DATA only; these own every tag, class and (i) wiring.
 * ========================================================================== */
function spanHtml(s, bp) {
  let inner = esc(s.text);
  if (s.code) inner = `<code>${inner}</code>`;
  if (s.strong) inner = `<strong>${inner}</strong>`;
  if (s.em) inner = `<em>${inner}</em>`;
  if (s.term && bp.glossary[s.term] && bp.learnerProfile.showTermPopovers) {
    return `<button class="term" data-term="${escAttr(s.term)}">${inner}<span class="i">i</span></button>`;
  }
  return inner;
}
function richText(nodes, bp) {
  if (!Array.isArray(nodes)) return "";
  return nodes.map((n) => {
    if (!n || typeof n !== "object") return "";
    if (n.t === "p") return `<p>${(n.spans || []).map((s) => spanHtml(s, bp)).join("")}</p>`;
    if (n.t === "h") return `<h${n.level === 4 ? 4 : 3}>${(n.spans || []).map((s) => spanHtml(s, bp)).join("")}</h${n.level === 4 ? 4 : 3}>`;
    if (n.t === "ul") return `<ul>${(n.items || []).map((it) => `<li>${(it || []).map((s) => spanHtml(s, bp)).join("")}</li>`).join("")}</ul>`;
    if (n.t === "ol") return `<ol>${(n.items || []).map((it) => `<li>${(it || []).map((s) => spanHtml(s, bp)).join("")}</li>`).join("")}</ol>`;
    if (n.t === "callout") return `<div class="callout ${n.tone || "info"}">${(n.spans || []).map((s) => spanHtml(s, bp)).join("")}</div>`;
    return "";
  }).join("");
}
function keyTerms(termIds, bp) {
  if (!bp.learnerProfile.showTermPopovers || !Array.isArray(termIds)) return "";
  const chips = termIds.filter((id) => bp.glossary[id])
    .map((id) => `<button class="term-chip" data-term="${escAttr(id)}">${esc(bp.glossary[id].label)}<span class="i">i</span></button>`).join("");
  return chips ? `<div class="keyterms">${chips}</div>` : "";
}
function gateClasses(b) {
  const c = ["block", "reveal"];
  if (b.kind === "technical") c.push("needs-technical", "blk-explain");
  if (b.kind === "conceptual") c.push("needs-conceptual", "b-concept", "blk-explain");
  if (b.kind === "codeExample") c.push("needs-code", "b-code", "blk-code");
  if (b.kind === "functionalExample") c.push("needs-functional", "b-funcex", "blk-example");
  if (b.kind === "knowledgeCheck") c.push("blk-check");
  const vw = b.visibleWhen;
  if (vw?.depth?.length === 1 && vw.depth[0] === "technical") c.push("needs-technical");
  if (vw?.depth?.length === 1 && vw.depth[0] === "conceptual") c.push("needs-conceptual");
  if (vw?.examples?.length === 1 && vw.examples[0] === "code") c.push("needs-code");
  if (vw?.examples?.length === 1 && vw.examples[0] === "functional") c.push("needs-functional");
  return c.join(" ");
}
function decisionMatrix(b) {
  const head = `<tr><th>Option</th>${b.criteria.map((c) => `<th>${esc(c)}</th>`).join("")}<th>When to choose</th><th>Cost</th><th>Complexity</th></tr>`;
  const rows = b.options.map((o) => {
    const byCrit = new Map((o.cells || []).map((c) => [c.criterion, c]));
    const cells = b.criteria.map((c) => {
      const cell = byCrit.get(c);
      const dot = cell ? `<span class="rate ${cell.rating || "ok"}"></span>` : "";
      return `<td>${dot}${esc(cell?.text ?? "—")}</td>`;
    }).join("");
    return `<tr><td><strong>${esc(o.name)}</strong></td>${cells}<td class="when">${esc(o.whenToUse)}</td><td>${esc(o.cost ?? "—")}</td><td>${esc(o.complexity ?? "—")}</td></tr>`;
  }).join("");
  return `<div class="matrix"><table class="dm"><thead>${head}</thead><tbody>${rows}</tbody></table>${b.howToRead ? `<div class="howread">${esc(b.howToRead)}</div>` : ""}</div>`;
}
function tree(node) {
  if (!node) return "";
  if (node.outcome) return `<li><strong>→ ${esc(node.outcome)}</strong></li>`;
  const branches = (node.branches || []).map((br) => `<li><em>${esc(br.label)}</em><ul>${tree(br.to)}</ul></li>`).join("");
  return `<li>${node.question ? esc(node.question) : ""}<ul>${branches}</ul></li>`;
}
function codeBlock(b, bp) {
  const path = b.filePath ? `<div class="code-path">${esc(b.filePath)} · ${esc(b.language || "")}</div>` : "";
  const explain = b.explain ? richText(b.explain, bp) : "";
  const predict = b.predictThenReveal
    ? `<div class="quiz"><div class="q">Predict: ${esc(b.predictThenReveal.prompt)}</div><button class="reveal">Reveal</button><div class="answer">${esc(b.predictThenReveal.answer)}</div></div>` : "";
  const syntax = (b.syntax && b.syntax.length)
    ? `<div class="syntax-panel"><div class="sp-h">Syntax breakdown</div><dl>${b.syntax.map((s) => `<dt><code>${esc(s.part)}</code></dt><dd>${esc(s.explains)}</dd>`).join("")}</dl></div>` : "";
  return `<div class="ex"><button class="copy">Copy</button>${path}<pre class="code">${esc(b.code)}</pre></div>${syntax}${explain}${predict}`;
}
function vizBlock(kind, title, caption, data) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return (title ? `<h3>${esc(title)}</h3>` : "") +
    `<div class="viz" data-viz="${kind}">${caption ? `<p class="viz-cap">${esc(caption)}</p>` : ""}<div class="viz-body"></div>` +
    `<script type="application/json" class="viz-data">${json}</script></div>`;
}
function quiz(b) {
  let body = "";
  if (b.format === "mcq" && b.options) {
    body = b.options.map((o) => `<button class="opt" data-correct="${o.correct ? "1" : "0"}">${esc(o.text)}</button>`).join("");
    body += `<div class="answer">${esc(b.explanation)}</div>`;
  } else {
    const ask = b.format === "applyToYourBuild" && b.applyToYourBuildPrompt ? b.applyToYourBuildPrompt : "";
    body = `${ask ? `<p class="muted">${esc(ask)}</p>` : ""}<button class="reveal">Reveal answer</button><div class="answer">${b.acceptableAnswer ? `<strong>${esc(b.acceptableAnswer)}</strong><br>` : ""}${esc(b.explanation)}</div>`;
  }
  return `<div class="quiz"><div class="q">${esc(b.prompt)}</div>${body}</div>`;
}
function analogyHtml(text) {
  if (!text) return "";
  return `<div class="analogy"><span class="an-lab">In plain words</span>${esc(text)}</div>`;
}
function collapsible(label, icon, inner) {
  return `<div class="collapse"><button class="collapse-h" aria-expanded="false"><span class="col-ico">${icon}</span><span class="col-lab">${esc(label)}</span><span class="col-chev">▸</span></button><div class="collapse-body">${inner}</div></div>`;
}
// Knowledge check — graded CLIENT-SIDE. MCQ options carry data-correct; free-text
// embeds a model answer the runtime reveals to self-check.
function kcItemHtml(blockId, q, i) {
  const head = `<div class="kc-q"><span class="kc-n">Q${i + 1}</span>${esc(q.prompt)}</div>`;
  let body = "";
  let answer = "";
  if (q.kind === "mcq" && q.options) {
    body = `<div class="kc-opts">${q.options.map((o, oi) => `<button class="kc-opt" data-qid="${escAttr(q.id)}" data-choice="${oi}" data-correct="${o.correct ? "1" : "0"}">${esc(o.text)}</button>`).join("")}</div>`;
  } else {
    body = `<div class="kc-free"><textarea class="kc-input" data-qid="${escAttr(q.id)}" rows="2" placeholder="Type your answer…"></textarea><button class="kc-submit" data-qid="${escAttr(q.id)}">Check</button></div>`;
    if (q.acceptableAnswer) answer = `<div class="kc-answer" hidden><strong>Model answer:</strong> ${esc(q.acceptableAnswer)}</div>`;
  }
  return `<div class="kc-item" data-qid="${escAttr(q.id)}" data-kind="${q.kind === "mcq" ? "mcq" : "freeText"}" data-block="${escAttr(blockId)}"><div class="kc-feedback" hidden></div>${head}${body}${answer}<div class="kc-explain" hidden>${esc(q.explanation)}</div></div>`;
}
function knowledgeCheck(b) {
  const qs = b.questions.map((q, i) => kcItemHtml(b.id, q, i)).join("");
  const mcqTotal = b.questions.filter((q) => q.kind === "mcq").length;
  const score = mcqTotal ? `<div class="kc-score" hidden>Score: <b>0</b>/<i>${mcqTotal}</i></div>` : "";
  return `<div class="kc" data-block="${escAttr(b.id)}">${b.title ? `<h3>🧠 ${esc(b.title)}</h3>` : `<h3>🧠 Knowledge check</h3>`}${b.intro ? `<p class="kc-intro">${esc(b.intro)}</p>` : ""}${score}${qs}</div>`;
}
function readingMinutes(m) {
  let words = (m.summary || "").split(/\s+/).length;
  const count = (s) => { if (s) words += s.split(/\s+/).length; };
  for (const b of m.blocks) {
    if (b && b.body && Array.isArray(b.body)) for (const n of b.body) { if (n.t === "ul" || n.t === "ol") (n.items || []).forEach((it) => (it || []).forEach((s) => count(s.text))); else if (n.spans) n.spans.forEach((s) => count(s.text)); }
    if (b && b.kind === "codeExample") count(b.code);
  }
  return Math.max(1, Math.round(words / 200));
}
function block(b, bp) {
  const cls = gateClasses(b);
  let inner = "";
  switch (b.kind) {
    case "conceptual":
    case "technical":
      inner = (b.title ? `<h3>${esc(b.title)}</h3>` : "") + analogyHtml(b.analogy) + richText(b.body, bp);
      break;
    case "functionalExample":
      inner = collapsible(b.title || "Real-world example", "💡", richText(b.body, bp));
      break;
    case "note":
      inner = `<div class="callout ${b.tone || "info"}">${richText(b.body, bp)}</div>`;
      break;
    case "codeExample":
      inner = collapsible(b.title || "Code example", "⟨⟩", codeBlock(b, bp));
      break;
    case "knowledgeCheck":
      inner = knowledgeCheck(b);
      break;
    case "decisionCallout":
      inner = `<div class="dcall"><div class="use"><div class="lab">Use when</div>${esc(b.useWhen)}</div><div class="avoid"><div class="lab">Avoid when</div>${esc(b.avoidWhen)}</div><div class="rot"><div class="lab">Rule of thumb</div>${esc(b.ruleOfThumb)}</div></div>`;
      break;
    case "decisionMatrix":
      inner = (b.title ? `<h3>${esc(b.title)}</h3>` : "") + decisionMatrix(b);
      break;
    case "decisionTree":
      inner = (b.title ? `<h3>${esc(b.title)}</h3>` : "") + `<ul class="tree">${tree(b.root)}</ul>`;
      break;
    case "diagram":
      inner = (b.title ? `<h3>${esc(b.title)}</h3>` : "") + miniMap(b.nodes, b.edges);
      break;
    case "scenario":
      inner = `<div class="scn"><div class="ask">${esc(b.ask)}</div><div class="imp">${esc(b.implies)}</div></div>`;
      break;
    case "walkthrough":
      inner = (b.title ? `<h3>${esc(b.title)}</h3>` : "") + `<div class="walk">${b.steps.map((s) => `<div class="step"><div class="n"></div><div><strong>${esc(s.label)}</strong>${richText(s.detail, bp)}</div></div>`).join("")}</div>`;
      break;
    case "taxonomy":
      inner = (b.title ? `<h3>${esc(b.title)}</h3>` : "") + `<div class="tax">${b.groups.map((g) => `<div class="grp"><h4>${esc(g.name)}</h4><ul>${g.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>`).join("")}</div>`;
      break;
    case "selfCheckQuiz":
      inner = quiz(b);
      break;
    case "interactiveScatter":
      inner = vizBlock("scatter", b.title, b.caption, { points: b.points, queries: b.queries });
      break;
    case "interactiveSlider":
      inner = vizBlock("slider", b.title, b.caption, { min: b.min, max: b.max, unit: b.unit, stops: b.stops });
      break;
    case "steppedFlow":
      inner = vizBlock("stepped", b.title, b.caption, { steps: b.steps });
      break;
    default:
      inner = ""; // unknown kind → render nothing rather than crash
  }
  if (!inner) return "";
  const terms = b.termIds && b.termIds.length ? keyTerms(b.termIds, bp) : "";
  return `<div class="${cls}">${inner}${terms}</div>`;
}
function miniMap(nodes) {
  return `<div class="map-row">${(nodes || []).map((n) => `<div class="map-node"><div class="mn-title">${esc(n.label)}</div>${n.sub ? `<div class="mn-sub">${esc(n.sub)}</div>` : ""}</div>`).join("")}</div>`;
}
function mentalMap(bp) {
  const mm = bp.mentalMap;
  const moduleIds = new Set(bp.modules.map((m) => m.id));
  const type = mm.structureType ?? (mm.nodes.some((n) => typeof n.order === "number") ? "procedural" : "conceptual");
  const ordered = type === "procedural" || type === "dependency";
  const nodes = mm.nodes.slice();
  if (ordered) nodes.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  const startId = mm.entryNodeId ?? (ordered ? (nodes[0]?.id ?? "") : "");
  const card = (n, i) => {
    const linked = !!(n.moduleId && moduleIds.has(n.moduleId));
    const click = linked ? ` data-deepdive="${escAttr(n.moduleId)}"` : "";
    const num = ordered ? (n.order ?? i + 1) : null;
    const isStart = ordered && n.id === startId;
    const badge = num != null ? `<span class="mn-num">${num}</span>` : `<span class="mn-ico">${esc(n.icon || "●")}</span>`;
    const desc = n.orient || n.sub || "";
    const descHtml = desc ? `<span class="mn-desc">${esc(desc)}</span>` : "";
    const cue = linked ? `<span class="mn-go" aria-hidden="true">Open →</span>` : "";
    const cls = `map-node${n.emphasis === "spine" ? " spine" : ""}${isStart ? " is-start" : ""}${linked ? "" : " no-link"}`;
    return `<button class="${cls}"${click}>${badge}${cue}<span class="mn-body"><span class="mn-title">${esc(n.label)}</span>${descHtml}</span></button>`;
  };
  const conn = `<div class="map-conn" aria-hidden="true"><span class="spark"></span></div>`;
  let inner, eyebrow, cap;
  if (ordered) {
    eyebrow = type === "procedural" ? "Your build path · start at step 1" : "Learning path · in order";
    cap = type === "procedural" ? "Follow these steps in order — each builds on the one before." : "Understand these in order — later ideas depend on earlier ones.";
    inner = `<div class="map-path">${nodes.map((n, i) => `${card(n, i)}${i < nodes.length - 1 ? conn : ""}`).join("")}</div>`;
  } else if (type === "comparative") {
    eyebrow = "The options · weigh and choose";
    cap = "These are the choices on the table — compare them, then pick.";
    inner = `<div class="map-options">${nodes.map((n, i) => card(n, i)).join("")}</div>`;
  } else {
    eyebrow = "Mental map · how the pieces relate";
    cap = "Not a sequence — these connect as a whole. Open any piece.";
    inner = `<div class="map-concept">${nodes.map((n, i) => card(n, i)).join("")}</div>`;
  }
  return `<div class="map"><div class="eyebrow">${eyebrow}</div><h2>${esc(mm.title)}</h2><p class="cap">${esc(mm.caption || cap)}</p><div class="map-body map-${type}">${inner}</div></div>`;
}
function moduleInner(m, bp) {
  const total = bp.modules.length;
  const idx = bp.modules.findIndex((x) => x.id === m.id);
  const prev = idx > 0 ? bp.modules[idx - 1] : null;
  const next = idx >= 0 && idx < total - 1 ? bp.modules[idx + 1] : null;
  const node = bp.mentalMap.nodes.find((n) => n.moduleId === m.id);
  const ordered = bp.mentalMap.structureType === "procedural" || bp.mentalMap.structureType === "dependency";
  const spine = `<div class="m-spine"><span class="m-pos">${ordered ? "Step " : ""}${m.order} of ${total}</span>${prev ? `<span class="m-prev">↳ builds on “${esc(prev.title)}”</span>` : ""}</div>`;
  const badge = m.icon ? `<div class="m-ico">${esc(m.icon)}</div>` : `<div class="num">${m.order}</div>`;
  const mins = readingMinutes(m);
  const detail = node
    ? `${node.what ? `<p class="m-what">${esc(node.what)}</p>` : ""}${node.laymanExplanation ? `<div class="analogy"><span class="an-lab">In plain words</span>${esc(node.laymanExplanation)}</div>` : ""}${node.relevance ? `<div class="m-rel"><span class="m-rel-lab">Why this matters for you</span>${esc(node.relevance)}</div>` : ""}`
    : "";
  const head = `<div class="module-head">${badge}<div class="mh-text">${spine}<h2>${esc(m.title)}</h2>${m.sub ? `<p class="sub">${esc(m.sub)}</p>` : ""}<div class="m-time">⏱ ~${mins} min read</div></div></div>${detail}`;
  const obj = m.objectives.length
    ? `<div class="objectives"><b>After this you'll be able to</b><ul>${m.objectives.map((o) => `<li>${esc(o)}</li>`).join("")}</ul></div>` : "";
  const forces = m.decisionItForces ? `<div class="decision-forces"><strong>Decision this forces:</strong> ${esc(m.decisionItForces)}</div>` : "";
  const core = m.blocks.filter((b) => b.depthTier !== "deeper");
  const deeper = m.blocks.filter((b) => b.depthTier === "deeper");
  const deeperHtml = deeper.length
    ? `<button class="deeper-toggle" data-label="Go deeper →">Go deeper →</button><div class="deeper">${deeper.map((b) => block(b, bp)).join("")}</div>` : "";
  const nextHtml = next
    ? `<button class="next-step" data-deepdive="${escAttr(next.id)}">Next${ordered ? ` · step ${next.order}` : ""}: ${esc(next.title)} →</button>`
    : `<button class="next-step" data-goto="_synth">Finish → Putting it together</button>`;
  return `${head}<div class="module-body"><p>${esc(m.summary)}</p>${obj}${forces}${keyTerms(m.termIds, bp)}${core.map((b) => block(b, bp)).join("")}${deeperHtml}${nextHtml}</div>`;
}
function modulePanel(m, bp) {
  return `<section class="panel module" data-panel="${escAttr(m.id)}" data-module="${escAttr(m.id)}" id="panel-${escAttr(m.id)}">${moduleInner(m, bp)}</section>`;
}
function synthesisInner(bp) {
  const s = bp.synthesis;
  const ref = s.referenceArchitecture ? `<h3>Reference architecture</h3>${miniMap(s.referenceArchitecture.nodes, s.referenceArchitecture.edges)}` : "";
  const order = (s.buildOrder && s.buildOrder.length)
    ? `<h3>Suggested build order</h3><div class="walk">${s.buildOrder.map((b) => `<div class="step"><div class="n"></div><div><strong>${esc(b.label)}</strong>${b.detail ? `<div class="muted">${esc(b.detail)}</div>` : ""}</div></div>`).join("")}</div>` : "";
  const check = (s.checklist && s.checklist.length) ? `<h3>Decision checklist</h3><ul class="checklist">${s.checklist.map((c) => `<li>${esc(c.label)}</li>`).join("")}</ul>` : "";
  const cap = s.capstone ? `<div class="capstone"><strong>Try it:</strong> ${esc(s.capstone.prompt)}</div>` : "";
  return `<div class="eyebrow">Putting it together</div><h2>Synthesis</h2>${s.recap ? richText(s.recap, bp) : ""}${ref}${order}${check}${cap}`;
}
function whatsNew(bp) {
  if (!bp.whatsNew || !bp.whatsNew.length) return "";
  return `<div class="whatsnew"><div class="lab">What's new</div><ul>${bp.whatsNew.map((w) => `<li>${esc(w.title)} — ${esc(w.summary)}</li>`).join("")}</ul></div>`;
}
function recapBanner(bp) {
  const r = bp.meta.recap;
  if (!r) return "";
  const pts = r.points.slice(0, 5).map((p) => `<li>${esc(p)}</li>`).join("");
  return `<div class="recap"><div class="recap-h">↩ Recap — building on “${esc(r.previousTitle)}”</div><ul>${pts}</ul></div>`;
}
function citationsInner(bp) {
  const ids = Object.keys(bp.citations);
  const items = ids.map((id) => {
    const c = bp.citations[id];
    const link = c.url ? `<a href="${escAttr(c.url)}" target="_blank" rel="noopener">${esc(c.title)}</a>` : esc(c.title);
    const tag = c.kind === "upload" ? "your document" : c.kind === "kb" ? "knowledge base" : c.kind === "liveSearch" ? "web" : "reference";
    return `<li>${link} <span class="muted">· ${tag}${c.asOfDate ? " · " + esc(c.asOfDate) : ""}</span></li>`;
  }).join("");
  return `<div class="eyebrow">Provenance</div><h2>Sources</h2><div class="cites"><ol>${items}</ol></div>`;
}
function renderBody(bp) {
  const p = bp.learnerProfile;
  const metaBits = [
    p.level,
    p.depth.replace("_", " + "),
    p.examples.replace("_", " + "),
    bp.meta.estTotalMinutes ? `${bp.meta.estTotalMinutes} min read` : "",
    p.industry ? `for ${p.industry}` : "",
  ].filter(Boolean);

  const navModules = bp.modules
    .map((m) => `<button class="navitem" data-goto="${escAttr(m.id)}"><span class="ni-num">${m.order}</span><span class="ni-label">${esc(m.title)}</span><span class="ni-status" aria-hidden="true"></span></button>`).join("");
  const hasCitations = Object.keys(bp.citations).length > 0;
  const navExtra =
    `<button class="navitem nav-special" data-goto="_synth"><span class="ni-num">✦</span><span class="ni-label">Putting it together</span></button>` +
    (hasCitations ? `<button class="navitem nav-special" data-goto="_sources"><span class="ni-num">⌕</span><span class="ni-label">Sources</span></button>` : "");

  const panels =
    bp.modules.map((m) => modulePanel(m, bp)).join("") +
    `<section class="panel" data-panel="_synth" id="panel-_synth">${synthesisInner(bp)}</section>` +
    (hasCitations ? `<section class="panel" data-panel="_sources" id="panel-_sources">${citationsInner(bp)}</section>` : "");

  let hasConcept = false, hasFunc = false, hasCode = false, hasSyntax = false;
  for (const m of bp.modules) for (const b of m.blocks) {
    if (b.kind === "conceptual") hasConcept = true;
    if (b.kind === "functionalExample") hasFunc = true;
    if (b.kind === "codeExample") { hasCode = true; if (b.syntax && b.syntax.length) hasSyntax = true; }
  }
  const contentToggles =
    (hasConcept ? `<button class="tbtn toggle" id="t-concept" aria-pressed="true">Concept</button>` : "") +
    (hasFunc ? `<button class="tbtn toggle" id="t-funcex" aria-pressed="true">Functional</button>` : "") +
    (hasCode ? `<button class="tbtn toggle" id="t-code" aria-pressed="true">Code</button>` : "") +
    (hasSyntax ? `<button class="tbtn toggle" id="t-syntax" aria-pressed="false">Explain syntax</button>` : "");

  return `
  <div class="topbar"><div class="topbar-in">
    <div class="tb-left"><button class="tbtn nav-back" id="to-overview" hidden>← Overview</button></div>
    <div class="tb-center"><span class="brand-mini">${esc(bp.meta.title)}</span></div>
    <div class="tb-right">
      ${contentToggles ? `<div class="toggle-group" role="group" aria-label="Show or hide content">${contentToggles}</div>` : ""}
      <div class="progress" title="Progress"><i></i></div>
      <button class="tbtn" id="theme">☾ Dark</button>
    </div>
  </div></div>

  <div id="overview">
    <main class="shell">
      <div class="hero">
        <div class="eyebrow">Interactive lesson</div>
        <h1>${esc(bp.meta.title)}</h1>
        ${bp.meta.thesis ? `<p class="thesis">${esc(bp.meta.thesis)}</p>` : ""}
        <div class="meta-line">${metaBits.map((m) => `<span>${esc(m)}</span>`).join("")}</div>
      </div>
      ${recapBanner(bp)}
      ${whatsNew(bp)}
      ${mentalMap(bp)}
      <p class="ov-hint">Pick a building block above to dive in — or use the menu that appears on the left.</p>
    </main>
  </div>

  <div id="workbench" hidden>
    <nav id="blocknav">${navModules}${navExtra}</nav>
    <div id="blockmain">${panels}</div>
  </div>`;
}

/* ============================================================================
 * 5. Normalize + repair — make a slightly-imperfect Blueprint renderable.
 *    Mirrors the product's coerceSkeleton + repairBlueprint, minus Zod. Never
 *    throws; fills safe defaults, converts array<->record, drops dangling refs,
 *    aligns matrices, guarantees a visible block per module, wires the map.
 * ========================================================================== */
function stripNulls(v) {
  if (Array.isArray(v)) return v.map(stripNulls).filter((x) => x !== null);
  if (v && typeof v === "object") {
    for (const k of Object.keys(v)) { if (v[k] === null) delete v[k]; else v[k] = stripNulls(v[k]); }
  }
  return v;
}
function toRecord(v) {
  if (Array.isArray(v)) { const r = {}; for (const it of v) if (it && it.id) r[it.id] = it; return r; }
  return v && typeof v === "object" ? v : {};
}
const DEFAULT_PROFILE = {
  level: "beginner", depth: "conceptual_technical", examples: "functional_code",
  topic: "", showTermPopovers: true, expandAcronymsOnFirstUse: true, density: "medium",
  visualsRequested: false, explainSyntax: false, readingMode: "vertical", inferred: false,
};
function normalizeBlueprint(input) {
  const warnings = [];
  const o = stripNulls(input && typeof input === "object" ? input : {});
  o.schemaVersion = "1.0";
  o.meta = o.meta && typeof o.meta === "object" ? o.meta : {};
  o.learnerProfile = { ...DEFAULT_PROFILE, ...(o.learnerProfile && typeof o.learnerProfile === "object" ? o.learnerProfile : {}) };
  const topic = o.meta.topic || o.meta.title || o.learnerProfile.topic || "Your lesson";
  o.meta.topic = o.meta.topic || topic;
  o.meta.title = o.meta.title || topic;
  o.learnerProfile.topic = o.learnerProfile.topic || topic;

  o.mentalMap = o.mentalMap && typeof o.mentalMap === "object" ? o.mentalMap : {};
  o.mentalMap.title = o.mentalMap.title || `${topic} — the map`;
  o.mentalMap.oneLineThesis = o.mentalMap.oneLineThesis || o.meta.thesis || "";
  o.mentalMap.nodes = Array.isArray(o.mentalMap.nodes) ? o.mentalMap.nodes.filter((n) => n && n.id && n.label) : [];
  o.mentalMap.edges = Array.isArray(o.mentalMap.edges) ? o.mentalMap.edges : [];

  o.modules = Array.isArray(o.modules) ? o.modules : [];
  o.modules.forEach((m, i) => {
    m.id = m.id || `m${i + 1}`;
    m.order = typeof m.order === "number" ? m.order : i + 1;
    m.title = m.title || `Module ${i + 1}`;
    m.summary = m.summary || "";
    m.objectives = Array.isArray(m.objectives) ? m.objectives : [];
    m.termIds = Array.isArray(m.termIds) ? m.termIds : [];
    m.citations = Array.isArray(m.citations) ? m.citations : [];
    m.blocks = Array.isArray(m.blocks) ? m.blocks.filter((b) => b && b.kind) : [];
    m.blocks.forEach((b, bi) => { b.id = b.id || `${m.id}-b${bi + 1}`; });
    m.loadState = "full";
  });

  o.glossary = toRecord(o.glossary);
  for (const [id, t] of Object.entries(o.glossary)) { t.id = t.id || id; t.label = t.label || id; t.laymanDefinition = t.laymanDefinition || t.label; }
  o.citations = toRecord(o.citations);
  for (const [id, c] of Object.entries(o.citations)) { c.id = c.id || id; c.title = c.title || id; c.kind = c.kind || "canonical"; }

  o.synthesis = o.synthesis && typeof o.synthesis === "object" ? o.synthesis : {};
  if (typeof o.synthesis.recap === "string") o.synthesis.recap = o.synthesis.recap.trim() ? [{ t: "p", spans: [{ text: o.synthesis.recap }] }] : undefined;
  o.synthesis.buildOrder = (Array.isArray(o.synthesis.buildOrder) ? o.synthesis.buildOrder : []).map((b, i) =>
    typeof b === "string" ? { step: i + 1, label: b } : { step: typeof b?.step === "number" ? b.step : i + 1, label: b?.label ?? String(b ?? ""), detail: b?.detail });
  o.synthesis.checklist = (Array.isArray(o.synthesis.checklist) ? o.synthesis.checklist : []).map((c, i) =>
    typeof c === "string" ? { id: `c${i + 1}`, label: c } : { id: c?.id ?? `c${i + 1}`, label: c?.label ?? String(c ?? ""), fromModuleId: c?.fromModuleId });
  o.synthesis.capstone = o.synthesis.capstone && typeof o.synthesis.capstone === "object" ? o.synthesis.capstone : { prompt: `Apply what you learned to ${o.learnerProfile.buildGoal || topic}.` };

  if (!o.modules.length) warnings.push("Blueprint has no modules — the lesson will be nearly empty.");
  if (!o.mentalMap.nodes.length) warnings.push("Mental map has no nodes — the overview will be empty.");
  return { bp: o, warnings };
}
function repairBlueprint(bp) {
  const glossaryIds = new Set(Object.keys(bp.glossary));
  const citationIds = new Set(Object.keys(bp.citations));
  const moduleIds = new Set(bp.modules.map((m) => m.id));

  // gate4: ensure ≥1 map node links to a real module.
  if (bp.mentalMap.nodes.length && bp.modules.length && !bp.mentalMap.nodes.some((n) => n.moduleId && moduleIds.has(n.moduleId))) {
    bp.mentalMap.nodes[0].moduleId = bp.modules[0].id;
  }
  const fixSpans = (spans) => { for (const s of spans || []) if (s.term && !glossaryIds.has(s.term)) delete s.term; };
  const fixRich = (rt) => {
    if (!Array.isArray(rt)) return;
    for (const n of rt) {
      if ((n.t === "ul" || n.t === "ol") && n.items) for (const it of n.items) fixSpans(it);
      else if (n.spans) fixSpans(n.spans);
    }
  };
  for (const m of bp.modules) {
    m.termIds = m.termIds.filter((t) => glossaryIds.has(t));
    m.citations = m.citations.filter((c) => citationIds.has(c));
    // gate7: guarantee at least one always-visible (core) block.
    if (m.blocks.length && !m.blocks.some((b) => !b.visibleWhen)) delete m.blocks[0].visibleWhen;
    for (const b of m.blocks) {
      if (Array.isArray(b.termIds)) b.termIds = b.termIds.filter((t) => glossaryIds.has(t));
      if (Array.isArray(b.sources)) b.sources = b.sources.filter((c) => citationIds.has(c));
      if (b.body) fixRich(b.body);
      if (b.kind === "codeExample") fixRich(b.explain);
      if (b.kind === "walkthrough") for (const st of (b.steps || [])) fixRich(st.detail);
      if (b.kind === "decisionMatrix") {
        b.criteria = (b.criteria || []).filter((c) => !/^(when to choose|cost|complexity)$/i.test(String(c).trim()));
        for (const opt of (b.options || [])) {
          opt.cells = Array.isArray(opt.cells) ? opt.cells : [];
          const have = new Set(opt.cells.map((c) => c.criterion));
          for (const c of b.criteria) if (!have.has(c)) opt.cells.push({ criterion: c, text: "—", rating: "ok" });
          opt.cells = opt.cells.filter((c) => b.criteria.includes(c.criterion));
        }
      }
    }
  }
  return bp;
}

/* ============================================================================
 * 6. renderArtifact — Blueprint → one self-contained HTML string.
 * ========================================================================== */
export function renderArtifact(bp) {
  const p = bp.learnerProfile;
  const glossaryJson = JSON.stringify(bp.glossary).replace(/</g, "\\u003c");
  const accentStyle = bp.meta.accent ? `<style>:root{--accent:${escAttr(bp.meta.accent)}}</style>` : "";
  return `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escAttr(bp.meta.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet"/>
<style>${ARTIFACT_CSS}</style>${accentStyle}
</head>
<body data-level="${escAttr(p.level)}" data-depth="${escAttr(p.depth)}" data-examples="${escAttr(p.examples)}" data-reading="vertical" data-theme="light">
${renderBody(bp)}
<div id="popover" role="dialog" aria-label="Definition"></div>
<script type="application/json" id="glossary-data">${glossaryJson}</script>
<script>${RUNTIME_JS}</script>
</body>
</html>`;
}

/** Normalize + repair + render in one call. Returns { html, warnings }. */
export function buildLesson(input) {
  const { bp, warnings } = normalizeBlueprint(input);
  repairBlueprint(bp);
  return { html: renderArtifact(bp), warnings, blueprint: bp };
}

/* ============================================================================
 * 7. CLI
 * ========================================================================== */
function isMain() {
  try { return import.meta.url === `file://${process.argv[1]}` || process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/")); }
  catch { return true; }
}
async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}
async function main() {
  const args = process.argv.slice(2);
  if (!args.length || args.includes("-h") || args.includes("--help")) {
    process.stderr.write(
      "render.mjs — Blueprint JSON → self-contained interactive HTML lesson\n\n" +
      "Usage:\n" +
      "  node render.mjs blueprint.json                 # writes blueprint.html beside it\n" +
      "  node render.mjs blueprint.json lesson.html     # explicit output path\n" +
      "  node render.mjs blueprint.json -               # write HTML to stdout\n" +
      "  cat blueprint.json | node render.mjs - out.html\n"
    );
    process.exit(args.length ? 0 : 1);
  }
  const inPath = args[0];
  let outPath = args[1];
  let raw;
  if (inPath === "-") raw = await readStdin();
  else raw = readFileSync(inPath, "utf8");

  let parsed;
  try { parsed = JSON.parse(raw); }
  catch (e) { process.stderr.write(`✖ Could not parse Blueprint JSON: ${e.message}\n`); process.exit(2); }

  const { html, warnings } = buildLesson(parsed);
  for (const w of warnings) process.stderr.write(`⚠ ${w}\n`);

  if (outPath === "-") { process.stdout.write(html); return; }
  if (!outPath) outPath = inPath === "-" ? "lesson.html" : inPath.replace(/\.json$/i, "") + ".html";
  writeFileSync(outPath, html, "utf8");
  process.stderr.write(`✓ Wrote ${outPath} (${(html.length / 1024).toFixed(0)} KB, ${parsed.modules?.length ?? 0} modules)\n`);
}
if (isMain()) main().catch((e) => { process.stderr.write(`✖ ${e.stack || e}\n`); process.exit(1); });
