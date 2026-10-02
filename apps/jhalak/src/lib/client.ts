"use client";

/**
 * fetch that ALWAYS resolves to JSON semantics. If the server returns HTML
 * (proxy error page, crash, 413), the user gets a friendly message — never
 * "Unexpected token '<'". See Learning.MD 2026-07-22.
 */
export async function fetchJson<T = Record<string, unknown>>(
  url: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; data: T | null; error: string }> {
  try {
    const r = await fetch(url, init);
    const text = await r.text();
    let data: T | null = null;
    try {
      data = text ? (JSON.parse(text) as T) : null;
    } catch {
      return {
        ok: false,
        status: r.status,
        data: null,
        error:
          r.status === 413
            ? "That file is too large — please try a smaller photo."
            : "The server had a hiccup — please try again in a moment.",
      };
    }
    const err = (data as { error?: string } | null)?.error || "";
    return { ok: r.ok, status: r.status, data, error: r.ok ? "" : err || "Something went wrong — please try again." };
  } catch {
    return { ok: false, status: 0, data: null, error: "Network issue — check your connection and try again." };
  }
}

/**
 * Downscale + re-encode an image in the browser before upload:
 * max 1600px, JPEG. Keeps uploads small (~300-600KB), converts formats the
 * browser can decode (incl. Safari HEIC) to universally-viewable JPEG, and
 * stays under vision-model size limits. Returns null if undecodable.
 */
export async function downscaleImage(file: File): Promise<File | null> {
  try {
    const bmp = await createImageBitmap(file);
    const MAX = 1600;
    const scale = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, "image/jpeg", 0.85)
    );
    if (!blob) return null;
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return null; // undecodable in this browser (e.g. HEIC on Chrome)
  }
}
