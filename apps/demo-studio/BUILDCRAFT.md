# Buildcraft edition — provenance and verification

Source: [APareek89/demo-studio](https://github.com/APareek89/demo-studio), tracked snapshot `c4f0b4b88f5de629908e9aa97837169026b0f358`. Exported without Git history or untracked files. This copy is maintained inside AI Buildcraft; the source checkout and deployment were not changed.

## Deliberate changes

- Image generation and reference-image editing use the direct Gemini Developer API. The source text/voice workflow and six-card approval gate remain.
- Only synthetic example data is shipped. The default example uses fictional handbook text, original geometric vehicle art and locally generated silent audio.
- Operational histories, hosted credentials, production release scripts, customer state and manufacturer imagery were excluded.
- Configuration starts in local mock mode and provides empty secret placeholders. A cached example cannot trigger live text, image, microphone or speech calls.

## Verification

Executed 2 October 2026 with Python 3.11 and the source application's installed dependencies:

- Gemini media transport/cache contracts: **10 passed**.
- Synthetic example factory/routes and no-paid-call policy: **5 passed**.
- Stage/player contracts: **444/444 passed**. The source gate had 445 checks; one deployment-specific AWS policy assertion was deliberately omitted with the excluded deployment material.
- Upload acceptance: **24/24 passed**.
- Full mock smoke: **all three phases passed**.
- Release journey: **28/28 passed**, including four headless Chrome checks for the full-area welcome, typed cited answer, Stop/session persistence and no microphone/external HTTP/unhandled error. Real publication measured the generated silent audio at **194.22 seconds**; provider calls and outbound attempts were **zero**.
- Changed Python compiled and changed frontend JavaScript parsed successfully.

The inherited browser check used a literal white RGB string. This edition checks the intended geometry/visibility because the existing theme resolves its near-white color through OKLCH tokens; no product styling was changed for the test.

No paid API call was made. Transport contracts validate HTTP shape, response parsing, bounded errors and persistence behavior; they do not establish that a particular account has model access or that generated media meets a visual-quality bar. Acoustic and hosted-auth acceptance were not rerun for this edition.

## API references

The implementation was checked against the official [Gemini image guide](https://ai.google.dev/gemini-api/docs/generate-content/image-generation) and [generateContent schema](https://ai.google.dev/api/generate-content), including `contents.parts.inlineData`, `responseModalities`, `imageConfig`, candidate safety termination and API-key headers.

## Known boundaries

The default sample is silent, and its diagram has no real product fidelity. Live speech, source rendering, hosted PostgreSQL/auth, cloud storage and LiveKit need their own configuration and acceptance testing. The historical portfolio screenshot is a UI illustration and is not proof of a post-migration live run. This collection has not deployed the application.
