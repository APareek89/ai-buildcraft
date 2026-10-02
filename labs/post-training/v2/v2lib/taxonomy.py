"""Rule-based labels used in the v1 analysis, so v1 and v2 volumes are directly comparable."""
from __future__ import annotations

import re

MODELS_RE = [r"\barc\b", r"\bpulse\b", r"\bvolt\s*x\b"]
AUX = r"^(is|are|does|do|did|can|could|would|will|has|have|should|was|were)\b"
REQUEST = r"^(can|could) (you )?(give|tell|share|list|cover|provide|state|quote)"
EXPLAIN = (r"^(how (is|are|does|do|would|should)|why|explain|describe|what happens|"
           r"what does (the|meridian|it|this|an?)\b|when does|under what|in what case|what is the [\w\s-]*(process|procedure))")
FORMS = ["Straight fact", "Scenario + straight fact", "Confirmation (yes/no)", "Confirm a claimed value",
         "Explanation / policy rule", "Comparison", "Multi-fact (2+ attributes)", "Open 'tell me about'"]


def n_models(q: str) -> int:
    ql = q.lower()
    return sum(bool(re.search(m, ql)) for m in MODELS_RE)


def form(q: str, kind: str | None = None, style: str | None = None) -> str:
    ql = q.lower().strip()
    if kind == "comparison" or n_models(q) >= 2:
        return "Comparison"
    if kind == "claimed_value" or (re.search(r"\d", ql) and re.search(
            r"written down|told me|i heard|i read|is that (what|right|correct)|check that|^is [\d,.]+", ql)):
        return "Confirm a claimed value"
    if kind in ("multi_fact", "two_part"):
        return "Multi-fact (2+ attributes)"
    if ql.startswith("tell me about"):
        return "Open 'tell me about'"
    if re.match(EXPLAIN, ql) or re.search(r"\b(can|could|please) (you )?(explain|clarify|describe)|^please clarify", ql):
        return "Explanation / policy rule"
    if (re.match(AUX, ql) and not re.match(REQUEST, ql)) or re.search(
            r"[,;.]\s*(does|do|is|are|can|will|would|could)\s+(the|it|its|a|an|this|that|there|my|i|you|meridian)\b[^?]*\?$", ql):
        return "Confirmation (yes/no)"
    if style in ("customer_situation", "scenario") or (style is None and re.match(r"^(i'm|i am|i expect|i need|i have|my |we |when i)", ql)):
        return "Scenario + straight fact"
    return "Straight fact"
