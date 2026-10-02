import { z } from "zod";

const address = z.string().trim().email().max(254);

export function validEmail(value: string | undefined): string | undefined {
  const parsed = address.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/** A public contact address is always supplied by the person running this copy. */
export function contactEmail(): string | undefined {
  return validEmail(process.env.CONTACT_EMAIL);
}

export function supportRecipient(): string | undefined {
  return validEmail(process.env.SUPPORT_TO_EMAIL?.trim() || process.env.CONTACT_EMAIL);
}

export function renderContactLink(html: string): string {
  const email = contactEmail();
  const escaped = email?.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
  const link = escaped
    ? `<a href="mailto:${escaped}">${escaped}</a>`
    : '<a href="/report-issue">the support form</a>';
  return html.split("{{CONTACT_LINK}}").join(link);
}
