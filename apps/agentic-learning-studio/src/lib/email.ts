/**
 * # Support email — Resend via REST (no SDK dependency; same fetch pattern as lemonsqueezy.ts)
 *
 * Graceful-optional: without a key and configured recipient we return sent:false
 * so local/dev works and complaints are never lost. The complaint is already
 * persisted in `support_requests` (the durable record) — email is only a
 * notification, so a missing/failed email never drops a complaint.
 */

import { supportRecipient, validEmail } from "./support-config";

export interface SupportEmail {
  requestId: string;
  category: string;
  name?: string;
  email: string; // submitter — used as reply-to + ack recipient
  subject: string;
  message: string;
  relatedRef?: string;
  userAgent?: string;
  createdAt: string;
}

const RESEND_URL = "https://api.resend.com/emails";
const DEFAULT_FROM = "Agentic Learning Studio Support <onboarding@resend.dev>"; // works until a verified domain is set
export function emailConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY?.trim() && supportRecipient());
}

async function resendSend(payload: Record<string, unknown>): Promise<{ ok: boolean; status?: number; error?: string }> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return { ok: false, error: "no-key" };
  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.warn("[email] Resend failed:", res.status, detail.slice(0, 200));
      return { ok: false, status: res.status, error: detail.slice(0, 200) };
    }
    return { ok: true };
  } catch (err) {
    console.warn("[email] Resend threw:", (err as Error).message);
    return { ok: false, error: (err as Error).message };
  }
}

/** Notify the operator of a new support request. Best-effort; the complaint is already in the DB. */
export async function sendSupportEmail(e: SupportEmail): Promise<{ sent: boolean }> {
  const to = supportRecipient();
  if (!emailConfigured() || !to) {
    console.info("[support] Email disabled: configure RESEND_API_KEY and a valid SUPPORT_TO_EMAIL or CONTACT_EMAIL. Request remains saved in DB.");
    return { sent: false };
  }
  const from = (process.env.SUPPORT_FROM_EMAIL || DEFAULT_FROM).trim();
  const text = [
    "New support / complaint / data-rights request",
    "",
    `Request ID: ${e.requestId}`,
    `Category:   ${e.category}`,
    `Name:       ${e.name || "(not provided)"}`,
    `Email:      ${e.email}`,
    `Subject:    ${e.subject}`,
    `Reference:  ${e.relatedRef || "(none)"}`,
    `Time:       ${e.createdAt}`,
    `User agent: ${e.userAgent || "(unknown)"}`,
    "",
    "Message:",
    e.message,
  ].join("\n");
  const r = await resendSend({
    from, to, reply_to: e.email,
    subject: `[Agentic Learning Studio ${e.category}] ${e.subject} (#${e.requestId.slice(0, 8)})`,
    text,
  });
  return { sent: r.ok };
}

/** Acknowledge the submitter only after this deployment configures support email. */
export async function sendAckEmail(e: SupportEmail): Promise<void> {
  if (!emailConfigured() || !validEmail(e.email)) return;
  const from = (process.env.SUPPORT_FROM_EMAIL || DEFAULT_FROM).trim();
  const text = [
    `Hi${e.name ? " " + e.name : ""},`,
    "",
    `Thanks for contacting Agentic Learning Studio. Your request is logged as #${e.requestId.slice(0, 8)}.`,
    "",
    `Category: ${e.category}`,
    `Subject:  ${e.subject}`,
    "",
    "Typical timelines: consumer complaints are acknowledged within 48 hours and we aim to resolve within one month; content/intermediary grievances are acknowledged within 24 hours and resolved within 15 days where applicable.",
    "",
    "Please don't reply with passwords, payment card data, Aadhaar, or other sensitive details.",
    "",
    "— Agentic Learning Studio support",
  ].join("\n");
  await resendSend({ from, to: e.email, subject: `We received your request (#${e.requestId.slice(0, 8)})`, text });
}
