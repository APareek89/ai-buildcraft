# Buildcraft edition — provenance and verification

Source: [APareek89/jhalak](https://github.com/APareek89/jhalak), tracked snapshot `d9da9a2ebd1c8e8ffca393a33b300e1af8e2cb93`. Exported without Git history, local configuration, database contents or operational handoffs. The source checkout and deployed service were not changed.

## Deliberate changes

All image and video generation now uses the direct Gemini Developer API. The provider adapter is independent of Next.js and PostgreSQL, so HTTP contracts can run for free. Text/vision copy remains on Anthropic. The obsolete media dependency and its transitive lockfile entries were removed.

Images use `generateContent` with text plus optional inline reference bytes. Video uses Veo `predictLongRunning`, a checked operation name, a six-minute deadline, and authenticated download. API keys are stripped on approved signed-storage redirects. Provider errors are redacted, bodies and downloads are bounded, and no automatic provider failover follows a safety refusal.

Local setup uses an empty secret template, a required random session secret and certificate-verified remote PostgreSQL. An optional local-only seed creates fictional template examples without providers or accounts. No shared account credentials or third-party media are included.

## Verification — 2 October 2026

- **7/7** Node transport contract tests passed, with unexpected global fetch blocked.
- **TypeScript `--noEmit` passed.**
- **Next.js production build passed**, compiling application and API routes.
- No paid model calls, no hosted database writes and no deployment.

Contracts cover image request/response and inline editing, safety/text-only failures, corrupt and oversized image data, Veo submit/poll/download, safe redirect credentials, rejected hosts, operation errors and deadlines. They use synthetic bytes and do not establish real visual or acoustic quality. The full signup → database → generation → storefront journey has not been rerun in this edition.

## Remaining limitations

Background jobs remain in the web process; worker restarts can interrupt them. Media remains in PostgreSQL, so large libraries need object storage and capacity planning. Image validation checks signatures and byte size but not decoded dimensions. Email verification, password reset and social-network publishing are not implemented. Original portfolio screenshots show historical UI only. This is an educational/private-review build, not a deployment certification.

## Official references

[Gemini generateContent](https://ai.google.dev/api/generate-content), [image generation/editing](https://ai.google.dev/gemini-api/docs/generate-content/image-generation), and [Veo generation, polling and download](https://ai.google.dev/gemini-api/docs/veo). Model availability and price depend on the configured account and may change.
