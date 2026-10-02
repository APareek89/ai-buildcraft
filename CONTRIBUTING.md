# Contributing

Pick one application, skill or lesson. Describe the problem, the change and how someone else can verify it.

1. Read the entry's setup and limitations.
2. Make a small branch. Keep generated data, secrets, local account state and model weights out of Git.
3. Add meaningful tests when behavior changes. For a visual lesson, check controls, calculations, source attribution, narrow screens and local links.
4. Run `python3 scripts/validate_collection.py` from the repository root and the relevant entry's checks.
5. Submit a pull request explaining the observed before/after behavior, verification and limitations. Do not claim live provider verification for mocked tests.

Useful first contributions:

- Reproduce a quickstart on a clean machine and report exact dependency versions.
- Add an evaluation case that exposes a concrete failure.
- Improve a diagram's explanation or keyboard accessibility.
- Replace a machine-specific assumption with portable configuration.
- Document a negative result with enough detail to reproduce it.

Use synthetic or redistributable examples. Attribute source material and preserve its license. Do not submit company-specific documents, account identifiers, credentials, private conversations or personal knowledge bases. Do not automatically send messages or make paid API calls from tests.
