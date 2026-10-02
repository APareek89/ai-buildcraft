# Learning.MD — <project>
> AGENT: add an entry whenever the basic flow changes, the user reports a bug or gives
> corrective feedback, or something took real time to figure out. CHECK THIS FILE FIRST
> before debugging — the answer may already be here. Plain language; first use of any
> technical term gets a one-line bracket explanation.

<!-- Newest first. Entry format: -->

### [DATE] — [Short title]

**Symptom:** [What the user saw / what broke]
**Why 1:** [Direct technical cause]
**Why 2:** [Why did Why 1 exist?]
**Why 3:** [Why did Why 2 exist?]
**Why 4 (if deeper):** [...]
**Why 5 (if deeper):** [...]
**Deepest why type:** `code` | `design` | `process` | `knowledge-gap`
**Action taken:** [The fix applied — which "why" level did it target?]
**Preventive action:** [What stops this class of bug — guardrail, pattern, or checklist item to add?]

<!-- Stuck reports (after 2 failed attempts at the same bug): -->
## 🔴 STUCK <YYYY-MM-DD> — <symptom>
**Tried:** <attempt 1 → why it failed; attempt 2 → why it failed>
**Best hypothesis:** <testable theory>
**Where it lives:** <diagram box / file:line>
**Question for the user:** <the specific thing that would unblock>
