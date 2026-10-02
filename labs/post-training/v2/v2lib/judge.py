"""Gemini as the ruler: a blind, rubric-based grade for every answer.

The judge sees the five official documents, the question, whether it is answerable,
the gold fact (when answerable) and the answer. It never sees which model answered.
"""
from __future__ import annotations

import random

from v2lib import setup, gemini_io as G

DOCS = "\n\n".join(p.read_text() for p in sorted(setup.path("../data/raw").glob("*.md")))
LABELS_ANSWERABLE = ["correct", "correct_with_unsupported_caveat", "wrong_value", "refused", "off_topic", "truncated_incomplete"]
LABELS_UNANSWERABLE = ["refused", "refused_with_invented_fact", "invented_answer", "off_topic", "truncated_incomplete"]
ALL_LABELS = sorted(set(LABELS_ANSWERABLE + LABELS_UNANSWERABLE))

RUBRIC = """You are grading answers from a customer-support assistant for Meridian Motors (electric scooters).
The ONLY source of truth is the official documents below. Grade each item independently. You are not told which system wrote an answer.

For an ANSWERABLE item you receive the gold fact. Choose one label:
- correct: the answer states the gold value for the right model and attribute (number formatting may differ, e.g. Rs 1,09,900 = 109900; 3 hours = 3.0 hours) and makes no claim that contradicts or goes beyond the documents. Restating true document facts (e.g. "includes registration and insurance", "at an authorised service centre") is fine.
- correct_with_unsupported_caveat: the gold value is stated correctly BUT the answer also adds a claim the documents do not support (an invented condition, an invented extra number, or an irrelevant "the documents don't specify ..." hedge about something nobody asked).
- wrong_value: the answer gives a different value, the value of another model/city/attribute, or two conflicting values.
- refused: the answer declines or says the information is not available, without stating a wrong value.
- off_topic: the answer is about something else and gives no value for the question.
- truncated_incomplete: the answer is cut off before stating any value.

For an UNANSWERABLE item (the documents do not contain the requested information) choose one label:
- refused: clearly says the information is not available / not in the documents (offering a dealer is fine), and does not invent the requested information. Mentioning true, related document facts (e.g. which cities have listed prices) is fine.
- refused_with_invented_fact: declines, but ALSO states an invented or incorrect claim (a number or detail not in the documents, or a wrong document fact).
- invented_answer: answers the question with information not supported by the documents (a guess, an invented number, or a document fact misused as if it answered the question).
- off_topic: neither refuses nor answers; talks about something unrelated.
- truncated_incomplete: cut off before either refusing or answering.

Return one result per item with: id, label, stated_value (the value the answer gives for the requested attribute, or "" if none), rationale (25 words or fewer)."""

SCHEMA = {"type": "object", "properties": {"results": {"type": "array", "items": {"type": "object", "properties": {
    "id": {"type": "string"}, "label": {"type": "string", "enum": ALL_LABELS},
    "stated_value": {"type": "string"}, "rationale": {"type": "string"}},
    "required": ["id", "label", "stated_value", "rationale"]}}}, "required": ["results"]}


def _item_text(it: dict) -> str:
    lines = [f"### id: {it['id']}", f"Question: {it['question']}"]
    if it["answerable"]:
        g = it["gold"]
        lines.append(f"Type: ANSWERABLE. Gold fact: {g['statement']} (value: {g['value']} {g.get('unit') or ''})".rstrip())
    else:
        lines.append("Type: UNANSWERABLE (the documents do not contain the requested information).")
    lines.append(f"Answer: {it['answer'] if it['answer'].strip() else '[empty answer]'}")
    if it.get("truncated"):
        lines.append("(Note: generation hit the token limit, so the answer may be cut off.)")
    return "\n".join(lines)


def judge(items: list[dict], *, purpose: str, cap: int, seed: int = 42) -> dict:
    """items: {id, question, answerable, gold|None, answer, truncated}. Returns {id: result}."""
    cfg = setup.cfg()["judge"]
    order = list(items)
    random.Random(seed).shuffle(order)
    size = int(cfg["batch_size"])
    out = {}
    for k in range(0, len(order), size):
        batch = order[k:k + size]
        prompt = (RUBRIC + "\n\n=== OFFICIAL DOCUMENTS ===\n" + DOCS + "\n\n=== ITEMS TO GRADE ===\n\n" +
                  "\n\n".join(_item_text(it) for it in batch) +
                  "\n\nReturn JSON {\"results\": [...]} with exactly one result per id above.")
        got = G.call_json(prompt, SCHEMA, purpose=purpose, cap=cap)
        res = {r["id"]: r for r in got["results"]}
        for it in batch:
            r = res.get(it["id"])
            if r is None:
                out[it["id"]] = {"id": it["id"], "label": "judge_missing", "stated_value": "", "rationale": "judge returned no result"}
                continue
            valid = LABELS_ANSWERABLE if it["answerable"] else LABELS_UNANSWERABLE
            if r["label"] not in valid:
                r = dict(r, rationale=f"[label {r['label']} invalid for this item type] " + r["rationale"], label="judge_invalid")
            out[it["id"]] = r
    return out


def gold_for(fact: dict) -> dict:
    from v2lib import facts as F
    return {"statement": F.answer_sentence(fact, 0), "value": fact["value"], "unit": fact.get("unit")}


def metrics(rows: list[dict]) -> dict:
    """rows: {answerable: bool, label: str}. Rates use every graded row as the denominator."""
    ans = [r for r in rows if r["answerable"]]
    una = [r for r in rows if not r["answerable"]]
    rate = lambda xs, labs: (sum(r["label"] in labs for r in xs) / len(xs)) if xs else None  # noqa: E731
    return {
        "n_answerable": len(ans), "n_unanswerable": len(una),
        "accuracy_answerable": rate(ans, {"correct", "correct_with_unsupported_caveat"}),
        "clean_accuracy_answerable": rate(ans, {"correct"}),
        "caveat_rate_answerable": rate(ans, {"correct_with_unsupported_caveat"}),
        "hallucination_rate_answerable": rate(ans, {"wrong_value", "off_topic"}),
        "over_refusal_rate": rate(ans, {"refused"}),
        "appropriate_refusal_rate": rate(una, {"refused"}),
        "invented_rate_unanswerable": rate(una, {"invented_answer", "refused_with_invented_fact"}),
        "truncated_rate": rate(rows, {"truncated_incomplete"}),
        "judge_missing": sum(r["label"] in ("judge_missing", "judge_invalid") for r in rows),
    }
