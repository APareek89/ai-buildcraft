import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { emailConfigured, sendAckEmail, sendSupportEmail, type SupportEmail } from "../src/lib/email";
import { renderContactLink } from "../src/lib/support-config";

const request: SupportEmail = {
  requestId: "synthetic-request-001", category: "technical", email: "reader@example.test",
  subject: "Synthetic support test", message: "Never sent to a real service", createdAt: "2026-10-02T00:00:00Z",
};

test("support mail has no inherited recipient and sends only to the configured operator", async (t) => {
  const keys = ["RESEND_API_KEY", "CONTACT_EMAIL", "SUPPORT_TO_EMAIL", "SUPPORT_FROM_EMAIL"];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  t.after(() => {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    }
  });
  for (const key of keys) delete process.env[key];
  process.env.RESEND_API_KEY = "offline-test-only";
  const outbound: Record<string, unknown>[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    outbound.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ id: "synthetic" }), { status: 200 });
  });
  t.mock.method(console, "info", () => {});

  for (const recipient of [undefined, "   ", "not-an-email", "one@example.test,two@example.test", "one@example.test\nBcc:other@example.test"]) {
    if (recipient === undefined) delete process.env.SUPPORT_TO_EMAIL; else process.env.SUPPORT_TO_EMAIL = recipient;
    assert.equal(emailConfigured(), false);
    assert.deepEqual(await sendSupportEmail(request), { sent: false });
    await sendAckEmail(request);
    assert.equal(outbound.length, 0, "credentials alone cannot enable outgoing email");
  }

  delete process.env.SUPPORT_TO_EMAIL;
  process.env.CONTACT_EMAIL = " operator@example.test ";
  assert.equal(emailConfigured(), true);
  assert.deepEqual(await sendSupportEmail(request), { sent: true });
  assert.equal(outbound[0].to, "operator@example.test");
  assert.equal(outbound[0].reply_to, request.email);
  process.env.SUPPORT_TO_EMAIL = "queue@example.test";
  await sendSupportEmail(request);
  assert.equal(outbound[1].to, "queue@example.test");
  await sendAckEmail(request);
  assert.equal(outbound[2].to, request.email);

  process.env.SUPPORT_TO_EMAIL = "invalid-override";
  assert.equal(emailConfigured(), false, "an invalid explicit override fails closed");
  await sendSupportEmail(request);
  assert.equal(outbound.length, 3);
  delete process.env.RESEND_API_KEY;
  process.env.SUPPORT_TO_EMAIL = "queue@example.test";
  await sendSupportEmail(request);
  await sendAckEmail(request);
  assert.equal(outbound.length, 3, "without a key all mail is disabled");
});

test("policy pages offer the support form until a valid public contact is configured", async (t) => {
  const previous = process.env.CONTACT_EMAIL;
  t.after(() => {
    if (previous === undefined) delete process.env.CONTACT_EMAIL; else process.env.CONTACT_EMAIL = previous;
  });
  for (const page of ["security", "privacy", "terms", "report-issue"]) {
    const html = await readFile(new URL(`../public/${page}.html`, import.meta.url), "utf8");
    delete process.env.CONTACT_EMAIL;
    const local = renderContactLink(html);
    assert.ok(!local.includes("{{CONTACT_"), `${page}: no unresolved contact token`);
    assert.ok(!local.includes('href="mailto:'), `${page}: no unconfigured mailbox`);
    assert.ok(local.includes('href="/report-issue"'));
    process.env.CONTACT_EMAIL = "operator@example.test";
    const configured = renderContactLink(html);
    assert.ok(configured.includes('href="mailto:operator@example.test"'));
  }
});
