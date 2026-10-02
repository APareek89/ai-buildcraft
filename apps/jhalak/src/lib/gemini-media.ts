/** Gemini Developer API transport, independent of the database and UI. */
const BASE = "https://generativelanguage.googleapis.com/v1beta";
const IMAGE_LIMIT = 12 * 1024 * 1024;
const VIDEO_LIMIT = 64 * 1024 * 1024;
type Json = Record<string, any>; // Boundary values are checked before use.
export type GeneratedMedia = { bytes: Buffer; mime: string };
export type Transport = { fetch: typeof fetch; sleep: (ms: number) => Promise<void>; now: () => number };
const transport: Transport = { fetch: (...args) => fetch(...args), sleep: ms => new Promise(r => setTimeout(r, ms)), now: Date.now };

function key() {
  const value = process.env.GEMINI_API_KEY?.trim();
  if (!value) throw new Error("Gemini media is not configured");
  return value;
}
function model(name: string) {
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) throw new Error("Invalid Gemini model name");
  return name;
}
function decode(data: unknown, limit: number): Buffer {
  if (typeof data !== "string" || !data.length || data.length > Math.ceil(limit / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)) throw new Error("Invalid image data");
  const bytes = Buffer.from(data, "base64");
  if (!bytes.length || bytes.length > limit) throw new Error("Image exceeds size limit");
  return bytes;
}
function imageBytes(bytes: Buffer, mime: string) {
  const png = mime === "image/png" && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpg = mime === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = mime === "image/webp" && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (!png && !jpg && !webp) throw new Error("Invalid image response");
}
export function parseImage(dataUri: string): { mimeType: string; data: string } {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUri);
  if (!match) throw new Error("Use a PNG, JPEG or WebP image");
  imageBytes(decode(match[2], IMAGE_LIMIT), match[1]);
  return { mimeType: match[1], data: match[2] };
}
async function read(response: Response, limit: number): Promise<Buffer> {
  if (!response.ok || !response.body) throw new Error("Gemini media request failed");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let count = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      count += value.length; if (count > limit) throw new Error("Gemini response exceeds size limit");
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  return Buffer.concat(chunks);
}
async function json(t: Transport, path: string, deadline: number, body?: Json): Promise<Json> {
  const remaining = deadline - t.now();
  if (remaining <= 0) throw new Error("Gemini media timed out");
  const response = await t.fetch(`${BASE}/${path}`, {
    method: body ? "POST" : "GET", redirect: "error",
    headers: { "x-goog-api-key": key(), "Content-Type": "application/json" },
    signal: AbortSignal.timeout(Math.min(remaining, 120000)),
    body: body ? JSON.stringify(body) : undefined,
  });
  let result: Json;
  try { result = JSON.parse((await read(response, 18 * 1024 * 1024)).toString()); }
  catch { throw new Error("Gemini media response was unavailable"); }
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("Invalid Gemini response");
  return result;
}
function prompt(value: string) {
  if (!value.trim() || value.length > 6000) throw new Error("Image prompt must contain 1–6000 characters");
}
export async function generateGeminiImage(text: string, aspect: string, reference?: string, t: Transport = transport): Promise<GeneratedMedia> {
  prompt(text);
  if (!["1:1", "16:9", "9:16", "3:4", "4:3"].includes(aspect)) throw new Error("Unsupported image aspect ratio");
  const parts: Json[] = [{ text }];
  if (reference) parts.push({ inlineData: parseImage(reference) });
  const result = await json(t, `models/${model(process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image")}:generateContent`, t.now() + 120000,
    { contents: [{ role: "user", parts }], generationConfig: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: aspect } } });
  if (result.promptFeedback?.blockReason) throw new Error("Gemini declined this image request");
  for (const candidate of result.candidates || []) {
    if (candidate.finishReason && candidate.finishReason !== "STOP") throw new Error("Gemini did not complete this image request");
    for (const part of candidate.content?.parts || []) {
      if (part.thought) continue;
      if (part.inlineData && ["image/png", "image/jpeg", "image/webp"].includes(part.inlineData.mimeType)) {
        const bytes = decode(part.inlineData.data, IMAGE_LIMIT); imageBytes(bytes, part.inlineData.mimeType);
        return { bytes, mime: part.inlineData.mimeType };
      }
    }
  }
  throw new Error("Gemini returned no image");
}
function trustedDownload(uri: unknown, authenticated: boolean): URL {
  if (typeof uri !== "string") throw new Error("Gemini returned no video");
  const url = new URL(uri);
  const api = url.hostname === "generativelanguage.googleapis.com";
  if (api && !/^\/v1beta\/files\/[a-zA-Z0-9_-]+:download$/.test(url.pathname)) throw new Error("Unexpected video download path");
  const storage = url.hostname === "storage.googleapis.com";
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash || (authenticated ? !api : !(api || storage))) throw new Error("Unexpected video download host");
  return url;
}
export async function generateGeminiVideo(text: string, reference: string, t: Transport = transport): Promise<GeneratedMedia> {
  prompt(text); const input = parseImage(reference); const deadline = t.now() + 6 * 60 * 1000;
  let job = await json(t, `models/${model(process.env.GEMINI_VIDEO_MODEL || "veo-3.1-fast-generate-preview")}:predictLongRunning`, deadline,
    { instances: [{ prompt: text, image: { inlineData: input } }],
      parameters: { aspectRatio: "9:16", durationSeconds: 6, resolution: "720p", personGeneration: "allow_adult" } });
  if (typeof job.name !== "string" || !/^models\/[a-zA-Z0-9._-]+\/operations\/[a-zA-Z0-9_-]+$/.test(job.name)) throw new Error("Invalid Gemini operation name");
  const operation = job.name;
  for (let attempt = 0; !job.done; attempt++) {
    if (attempt >= 36 || t.now() + 10000 >= deadline) throw new Error("Gemini video timed out");
    await t.sleep(10000); job = await json(t, operation, deadline);
    if (job.name && job.name !== operation) throw new Error("Gemini operation mismatch");
  }
  if (job.error) throw new Error("Gemini video generation failed");
  const result = job.response?.generateVideoResponse;
  if (result?.raiMediaFilteredCount) throw new Error("Gemini declined this video request");
  let url = trustedDownload(result?.generatedSamples?.[0]?.video?.uri, true);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const remaining = deadline - t.now(); if (remaining <= 0) throw new Error("Gemini video timed out");
    // API keys never accompany a signed storage redirect.
    const headers: Record<string, string> = url.hostname === "generativelanguage.googleapis.com" ? { "x-goog-api-key": key() } : {};
    const response = await t.fetch(url, { headers, redirect: "manual", signal: AbortSignal.timeout(Math.min(remaining, 60000)) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location"); await response.body?.cancel();
      if (!location) throw new Error("Missing video redirect");
      url = trustedDownload(new URL(location, url).toString(), false); continue;
    }
    const bytes = await read(response, VIDEO_LIMIT);
    if (bytes.toString("ascii", 4, 8) !== "ftyp") throw new Error("Gemini returned an invalid video");
    return { bytes, mime: "video/mp4" };
  }
  throw new Error("Too many video redirects");
}
