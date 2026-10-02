# Prepared tool-message regression fixtures

These messages were exported from the isolated synthetic PostgreSQL test database after the normal `createExample()` factory persisted the public team-tools example. The before fixture retains the incomplete plan-card output that caused the browser crash; the current fixture contains both repaired, typed tool outputs.

Only opaque message, tool-call, report and plan UUIDs were replaced with stable dummy UUIDs. Text, scoring, tactics, projection, allocation totals and roadmap fields are the actual saved values. There are no account details, credentials or private file paths. The renderer test exercises both real tool cards and their approval/download controls without making network calls.
