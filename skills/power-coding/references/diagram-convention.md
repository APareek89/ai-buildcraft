# The Mindful Coding diagram convention

The whole point: a human who can't read the code should be able to **debug from the diagram**. That only works if the diagram is *honest and granular*. Follow these rules.

## 1. One step = one box
- Never merge two steps that have an **input → output** relationship. If step A produces something step B consumes, they are **two boxes** with an arrow between them.
- A box that says "extract AND compute" is wrong — split into "extract [AGENT]" → "compute [FUNCTION]".

## 2. Label every box the same way
```
NAME
[AGENT · <model>]  |  [FUNCTION]  |  [LIBRARY · <name>]  |  [DATA · <store>]
in:  <what goes in>
out: <what comes out>
```
- **AGENT** = an LLM makes the decision/generation. Always name the model.
- **FUNCTION** = deterministic code, no model.
- **LIBRARY** = an external lib does the heavy lifting (a DB client, an embedder, a validator).
- **DATA** = a store/table/file being read or written.
- The reader must be able to tell, per box: *is a model involved? what does it take in, what does it give out?*

## 3. Decisions are diamonds
- Use a diamond for any branch. Put **who decides** on the diamond (FUNCTION/AGENT) and the **condition** on each outgoing edge.

## 4. Gates/checks show the threshold AND the enforcer
- e.g. "relevance floor · FUNCTION · best cosine ≥ 0.45". Never hide the number. Read it from the code.

## 5. Surface every "ask the user" / clarification — and say WHO writes the question
- A very common confusion: people assume "the agent asks a question". Often a **FUNCTION** assembles the question from templates, and the LLM only *decides what's missing*. **Make this explicit** on the box (e.g. "FUNCTION · builds the question from pre-written phrases — NO LLM writes it").
- If the flow asks and then continues on the user's reply across turns, draw that **loop** (a dashed edge back to the entry) and note the mechanism (e.g. "reply carried back as memory").

## 6. Colours (consistent across all diagrams)
| Class | Fill | Stroke | Use for |
|---|---|---|---|
| agent | `#dbeafe` | `#2563eb` | LLM calls |
| fn | `#dcfce7` | `#16a34a` | deterministic code |
| dec | `#f3e8ff` | `#9333ea` | decisions (diamonds) |
| term | `#e5e7eb` | `#6b7280` | results (answer/abstain/escalate) |
| ask | `#cffafe` | `#0891b2` | a question back to the user |
| data | `#ede9fe` | `#7c3aed` | data / library |

Put this at the bottom of every diagram:
```
classDef agent fill:#dbeafe,stroke:#2563eb,color:#0b2a5b;
classDef fn fill:#dcfce7,stroke:#16a34a,color:#052e16;
classDef dec fill:#f3e8ff,stroke:#9333ea,color:#2a0a4a;
classDef term fill:#e5e7eb,stroke:#6b7280,color:#111827;
classDef ask fill:#cffafe,stroke:#0891b2,color:#083344;
classDef data fill:#ede9fe,stroke:#7c3aed,color:#2a0a4a;
```

## 7. Structure: master + sub-flows
- **Diagram 1 = MASTER**: entry → the big decisions → the branches → the result. Each branch that's complex links to its own sub-diagram ("see diagram N").
- **Diagrams 2..N** = one per lane / module / complex sub-flow, fully granular.
- Keep a `docs/ARCHITECTURE_FLOW.md` that embeds all diagrams in ```mermaid fences with a legend, a "gates at a glance" table, and a file index (stage → file). That file renders on GitHub and is the source the `.mmd` files and HTML are generated from.

## 8. Mermaid syntax that survives every renderer
- **Quote every node label**: `A["...multi<br/>line..."]`. Use `<br/>` for line breaks.
- Avoid unquoted `()`, `{}`, `|`, `:` inside labels — keep them inside the quotes.
- Emojis are fine. Keep `%%` comments on their own lines.
- Validate with `scripts/validate-mmd.mjs` before shipping.

## Litmus test (before you show it)
For any box, a non-engineer should be able to answer: **agent or function? what's the input? what's the output?** If not, the box is wrong — split it or relabel it.
