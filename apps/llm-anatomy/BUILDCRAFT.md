# Collection setup and verification

This is an edited source snapshot in AI Buildcraft. [SOURCE.json](SOURCE.json) records the original repository and committed revision. Source repositories and their deployments were not changed. No credentials, production state, source Git history or private deployment receipts are included.

## Run and scope

Follow [README.md](README.md): `npm ci`, then `npm run dev`; use `npm run build` for a static export. No model API credentials are required for the bundled teaching views.

All four required assets initially filtered for size were restored from the recorded source commit: the micro checkpoint, the tokenizer and two sampled Float32 weight files. No file exceeds 100 MB. [Third-party data attribution](THIRD_PARTY_DATA.md) identifies the pinned public Qwen revision and retains its Apache-2.0 license. The miniature training model is a separate teaching implementation; bounded weight samples do not form a complete large-model checkpoint. Private deployment helpers were omitted.

## Checks on 2026-10-02

- `npm test`: 28 passed, 0 failed, including finite-difference gradient checks, a real 300-step CPU micro-training run, tokenizer oracle checks and exact sampled-weight integrity/budget checks.
- `npm run build`: passed (bundle-size warning only).

The bundled assets were used locally; test/build did not download a full model or invoke an inference provider. Historical timing/quality notes in technical docs describe their original experiments, not new collection-wide benchmarks.

Unless stated as a fresh installation, checks reused already-installed dependency runtimes through ignored local links while loading the exported source. Those links, build caches and local test state are not included in Git. No paid provider calls were made. Portfolio screenshots, where present, are historical UI illustrations rather than proof of this snapshot's live-provider behavior.
