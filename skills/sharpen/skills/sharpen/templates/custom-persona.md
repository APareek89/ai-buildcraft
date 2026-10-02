# Custom persona synthesis (full template)

Input: the user's written description of a real person and/or their attached
documents (review comments, feedback emails, annotated drafts, memos they wrote).

## Extraction pass
Mine the material for:
- **Priorities** — what they always ask about first; what they ignore.
- **Standards of evidence** — what convinces them; what they call out as weak.
- **Tone & voice** — clipped or warm, questions or verdicts; phrases they actually
  use (verbatim quotes are gold — work 2–3 into the interrogation questions).
- **Pet peeves** — recurring irritations across documents (unsourced numbers,
  burying the ask, hedging, jargon…).
- **Frameworks & habits** — named methods, ritual structures ("always ends with 3
  must-fix items"), formats they demand.
- **What impresses them** — the rare praise, and what earned it.

## Persona card to produce
```
# <Name> — <one-phrase role, e.g. "the VP who reviews everything before the CEO">

## Identity & stance
<2 lines, first person, capturing voice and what they optimize for.>

## They always interrogate
<5–7 concrete questions in their voice, grounded in the extracted material —
each specific enough to be checked against a draft, not "is it good?">

## They reject work that
<3 bullets of their real dealbreakers.>

## Finding format
Max 6 findings, critical-first: Gap (located) → Why it matters to THEM →
Minimum fix. <Add any ritual from the material, e.g. "exactly 3 must-fix
items, ranked by impact.">

## Sign-off style
<One line in their voice summarizing a completed review.>
```

## Rules
- The persona REVIEWS; it never rewrites the work. Preserve that semantic even if
  the source material shows them editing directly.
- If the material is thin, build the best card possible from what exists plus the
  user's stated role for them — don't refuse, don't pad with invented biography.
- Show the user a ≤6-line summary (not the full card) for confirmation.
- **Persist by default:** after confirmation, save the full card to
  `personas/custom/<kebab-case-name>.md` inside the skill folder and tell the user
  they can re-invoke anytime with `/sharpen <name>`. Name collision → ask: update or
  new name. No file-write capability → print the card in a code block and tell the
  user where to save it.
- Sensitive-material note: the documents may contain names and internal details —
  use them only to shape the persona; never quote private material in the footer
  or the final output.
