"use client";

import { useEffect } from "react";

/**
 * Mounted on tenant pages only when ?edit=1 (Studio preview). Makes the live page a
 * point-and-prompt editor:
 *  - hover a [data-sel] block → dashed outline + a floating label ("Headline", "Hero
 *    image", "Products tab"…).
 *  - single-click → SELECT it (solid outline) and postMessage {type:"select", sel, label}
 *    so the Studio scopes the next chat message to it.
 *  - double-click a [data-edit] TEXT node → edit it inline (blur → {type:"edit"}).
 * Free-chat with no selection still works — selection is optional. Navigation is
 * suppressed while editing so the session stays put.
 */
export default function EditBridge() {
  useEffect(() => {
    const post = (msg: Record<string, unknown>) => {
      try { window.parent?.postMessage({ __jhalak: true, ...msg }, window.location.origin); } catch { /* no parent */ }
    };
    const originals = new Map<string, string>();

    const style = document.createElement("style");
    style.textContent = `
      [data-sel]{ cursor:pointer; }
      [data-sel].jhalak-hover{ outline:2px dashed rgba(37,99,235,.55); outline-offset:2px; border-radius:4px; }
      [data-sel].jhalak-selected{ outline:2px solid #2563eb; outline-offset:2px; border-radius:4px; }
      [data-edit].jhalak-editing{ outline:2px solid #2563eb; background:rgba(37,99,235,.06); cursor:text; }
      #jhalak-tag{ position:fixed; z-index:2147483647; background:#2563eb; color:#fff; font:600 11px/1.4 ui-sans-serif,system-ui,sans-serif;
        padding:2px 7px; border-radius:6px; pointer-events:none; white-space:nowrap; transform:translateY(-100%); display:none; box-shadow:0 2px 8px rgba(0,0,0,.2); }
    `;
    document.head.appendChild(style);

    const tag = document.createElement("div");
    tag.id = "jhalak-tag";
    document.body.appendChild(tag);

    let selected: HTMLElement | null = null;
    let editing: HTMLElement | null = null;
    let hovered: HTMLElement | null = null;

    const labelFor = (el: HTMLElement) =>
      el.getAttribute("data-sel-label") || el.getAttribute("data-sel") || "block";

    const showTag = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      tag.textContent = labelFor(el);
      tag.style.left = `${Math.max(4, r.left)}px`;
      tag.style.top = `${Math.max(16, r.top - 4)}px`;
      tag.style.display = "block";
    };

    const selectEl = (el: HTMLElement) => {
      if (selected && selected !== el) selected.classList.remove("jhalak-selected");
      selected = el;
      el.classList.remove("jhalak-hover");
      el.classList.add("jhalak-selected");
      post({ type: "select", sel: el.getAttribute("data-sel"), label: labelFor(el) });
    };

    const startEdit = (el: HTMLElement) => {
      if (editing) return;
      editing = el;
      const original = (el.innerText || "").trim();
      const path = el.getAttribute("data-edit");
      if (path) originals.set(path, original);
      const multiline = path === "about";
      el.classList.add("jhalak-editing");
      el.setAttribute("contenteditable", "true");
      el.focus();
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el); range.collapse(false);
      sel?.removeAllRanges(); sel?.addRange(range);

      const finish = () => {
        el.removeAttribute("contenteditable");
        el.classList.remove("jhalak-editing");
        el.removeEventListener("blur", finish);
        el.removeEventListener("keydown", onKey);
        editing = null;
        const value = (el.innerText || "").trim();
        if (value && value !== original) post({ type: "edit", path, value });
        else if (!value) el.innerText = original;
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey && !multiline) { e.preventDefault(); el.blur(); }
        else if (e.key === "Escape") { el.innerText = original; el.blur(); }
      };
      el.addEventListener("blur", finish);
      el.addEventListener("keydown", onKey);
    };

    const onOver = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest("[data-sel]") as HTMLElement | null;
      if (hovered && hovered !== el) hovered.classList.remove("jhalak-hover");
      hovered = el;
      if (el && el !== selected && !editing) { el.classList.add("jhalak-hover"); showTag(el); }
      else tag.style.display = "none";
    };
    const onOut = () => { tag.style.display = "none"; };

    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("a") || t.closest("button")) e.preventDefault(); // no navigation while editing
      if (editing) return;
      const el = t.closest("[data-sel]") as HTMLElement | null;
      if (el) { e.stopPropagation(); selectEl(el); }
    };

    const onDbl = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest("[data-edit]") as HTMLElement | null;
      if (el) { e.preventDefault(); e.stopPropagation(); startEdit(el); }
    };

    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || !e.data?.__jhalakParent) return;
      if (e.data.type === "clear-selection" && selected) {
        selected.classList.remove("jhalak-selected");
        selected = null;
      } else if (e.data.type === "revert" && typeof e.data.path === "string") {
        const el = document.querySelector<HTMLElement>(`[data-edit="${CSS.escape(e.data.path)}"]`);
        if (el && originals.has(e.data.path)) el.innerText = originals.get(e.data.path)!;
      }
    };

    document.addEventListener("mouseover", onOver, true);
    document.addEventListener("mouseout", onOut, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("dblclick", onDbl, true);
    window.addEventListener("scroll", onOut, true);
    window.addEventListener("message", onMsg);
    post({ type: "ready" });

    return () => {
      document.removeEventListener("mouseover", onOver, true);
      document.removeEventListener("mouseout", onOut, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("dblclick", onDbl, true);
      window.removeEventListener("scroll", onOut, true);
      window.removeEventListener("message", onMsg);
      style.remove();
      tag.remove();
    };
  }, []);

  return null;
}
