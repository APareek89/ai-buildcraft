import { q } from "./db";

/** Store media bytes in Postgres; return the media id. */
export async function saveMedia(buf: Buffer, mime: string): Promise<string> {
  const rows = await q<{ id: string }>(
    `insert into jhalak.media (mime, bytes) values ($1, $2) returning id`,
    [mime, buf]
  );
  return rows[0].id;
}

export function mediaUrl(id: string): string {
  return `/api/media/${id}`;
}

/** Absolute URL for external services (external reference consumers can fetch it). */
export function absoluteMediaUrl(id: string): string {
  const base =
    process.env.PUBLIC_BASE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    "http://localhost:3444";
  return `${base.replace(/\/$/, "")}/api/media/${id}`;
}

export async function getMedia(
  id: string
): Promise<{ mime: string; bytes: Buffer } | null> {
  const rows = await q<{ mime: string; bytes: Buffer }>(
    `select mime, bytes from jhalak.media where id=$1`,
    [id]
  );
  return rows[0] || null;
}

/** Download a remote result (e.g. generated video) and persist it. Returns /api/media URL. */
export async function persistRemote(url: string, fallbackMime: string): Promise<string> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download failed: HTTP ${r.status}`);
  const mime = r.headers.get("content-type")?.split(";")[0] || fallbackMime;
  const buf = Buffer.from(await r.arrayBuffer());
  const id = await saveMedia(buf, mime);
  return mediaUrl(id);
}
