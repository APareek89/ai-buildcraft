"""Build dev_v2: 60 answerable + 80 unanswerable questions, phrased by Gemini from specs.

Run from the v2 folder:  ../.venv/bin/python scripts/build_dev_v2.py
Step 1 asks Gemini for wording (cached), step 2 filters, step 3 checks with Gemini that
every unanswerable question really is not answered by the five official documents.
"""
import collections
import json
import random
import re
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from v2lib import setup, facts as F, topics as T, textutils as TU, gemini_io as G  # noqa: E402

CFG = setup.cfg()
RNG = random.Random(CFG["seed"])
CAP = CFG["judge"]["max_api_calls"]["build"]
DOCS = "\n\n".join(p.read_text() for p in sorted(setup.path("../data/raw").glob("*.md")))
NAME_FORMS = {"Meridian Arc 110": ["Arc 110", "Arc 110", "Arc", "Meridian Arc 110"],
              "Meridian Pulse 125": ["Pulse 125", "Pulse 125", "Pulse", "Meridian Pulse 125"],
              "Meridian Volt X": ["Volt X", "Volt X", "Volt X", "Meridian Volt X"]}
ASK = {
    "battery_kwh": "the battery capacity (in kWh)", "range_km": "the certified range on a full charge",
    "top_speed_kmph": "the top speed", "charge_time_hours": "how long a full charge takes on the standard charger",
    "fast_charge_minutes": "how long the Meridian fast charger takes to reach 80 percent", "motor_kw": "the peak motor power",
    "kerb_weight_kg": "the kerb weight", "boot_litres": "the under-seat storage capacity",
    "warranty_years": "how many years the vehicle warranty lasts", "battery_warranty_km": "the battery warranty distance limit in km",
    "service_interval_km": "the service interval (distance between scheduled services)", "launch_year": "the year the model was launched",
}


def ask_for(f):
    a = f["attribute"]
    if a.startswith("price_"):
        return f"the on-road price in {a.split('_')[1].capitalize()}"
    return ASK[a]


def specs():
    scoreable = [f for f in F.FACTS if F.scoreable(f)]
    extra_ids = ["110_price_mumbai_inr", "125_price_bengaluru_inr", "x_price_delhi_inr", "110_price_delhi_inr",
                 "125_price_mumbai_inr", "x_price_bengaluru_inr", "110_motor_kw", "125_motor_kw", "x_motor_kw",
                 "110_battery_kwh", "125_battery_kwh", "x_battery_kwh", "125_fast_charge_minutes",
                 "x_fast_charge_minutes", "110_boot_litres", "125_boot_litres"]
    answerable = scoreable + [F.FIDX[i] for i in extra_ids]
    assert len(answerable) == 60
    styles_a = ["direct"] * 21 + ["casual"] * 15 + ["scenario"] * 12 + ["typo"] * 12
    styles_u = ["direct"] * 28 + ["casual"] * 20 + ["scenario"] * 16 + ["typo"] * 16
    RNG.shuffle(styles_a)
    RNG.shuffle(styles_u)
    out = []
    for i, (f, st) in enumerate(zip(answerable, styles_a), 1):
        out.append({"id": f"dv2_a{i:02d}", "answerable": True, "fact": f, "model": f["model"],
                    "name": RNG.choice(NAME_FORMS[f["model"]]), "asks": ask_for(f), "style": st})
    for i, ((tid, cat, model, desc), st) in enumerate(zip(T.DEV_V2_UNANSWERABLE, styles_u), 1):
        out.append({"id": f"dv2_u{i:02d}", "answerable": False, "topic": tid, "cat": cat, "model": model,
                    "name": RNG.choice(NAME_FORMS[model]) if model else None, "asks": desc, "style": st})
    return out


STYLE_TEXT = {
    "direct": "a plain, direct question or a short imperative request",
    "casual": "an informal, conversational question (everyday words, contractions; still unambiguous)",
    "scenario": "one short sentence of personal context, followed by the question",
    "typo": "a plain question typed quickly by a customer (we add the typo ourselves; write it correctly)",
}

PHRASE_SCHEMA = {"type": "object", "properties": {"items": {"type": "array", "items": {
    "type": "object", "properties": {"id": {"type": "string"}, "question": {"type": "string"}},
    "required": ["id", "question"]}}}, "required": ["items"]}


def phrase(batch):
    lines = []
    for s in batch:
        who = f'must name the scooter exactly as "{s["name"]}"' if s["name"] else "is about the company Meridian Motors (no scooter model needed)"
        lines.append(f'- id {s["id"]}: asks for {s["asks"]}; {who}; style: {STYLE_TEXT[s["style"]]}.')
    prompt = (
        "You write evaluation questions for a customer-support assistant of Meridian Motors, an Indian electric-scooter "
        "company with three models: Meridian Arc 110, Meridian Pulse 125 and Meridian Volt X.\n"
        "For each spec below, write ONE question a real customer in India might type into the company's chat.\n"
        "Rules: ask exactly for the described thing and nothing else; do not include any answer or guessed number; "
        "do not use the words 'spec sheet' or 'documents'; vary sentence structure across items; 8 to 30 words; "
        "no greetings or sign-offs; Indian English is fine.\n\n" + "\n".join(lines) +
        "\n\nReturn JSON: {\"items\": [{\"id\": ..., \"question\": ...}]} with one item per id.")
    got = G.call_json(prompt, PHRASE_SCHEMA, purpose="dev_v2_phrasing", cap=CAP, temperature=0.9)
    return {it["id"]: it["question"].strip() for it in got["items"]}


CHECK_SCHEMA = {"type": "object", "properties": {"items": {"type": "array", "items": {
    "type": "object", "properties": {"id": {"type": "string"}, "answerable_from_documents": {"type": "boolean"},
                                     "evidence": {"type": "string"}},
    "required": ["id", "answerable_from_documents", "evidence"]}}}, "required": ["items"]}


def answerability(items):
    listing = "\n".join(f'- {i}: {q}' for i, q in items)
    prompt = (
        "Below are Meridian Motors' ONLY official documents, followed by customer questions.\n"
        "For each question decide whether the documents contain the specific information needed to answer it. "
        "A question is answerable only if the documents state the requested fact (or it follows directly with no "
        "assumption). General policy text that does not settle the exact question does NOT count. Quote the "
        "evidence sentence when answerable; otherwise write 'not stated'.\n\n=== DOCUMENTS ===\n" + DOCS +
        "\n\n=== QUESTIONS ===\n" + listing + "\n\nReturn JSON {\"items\": [{\"id\", \"answerable_from_documents\", \"evidence\"}]}.")
    got = G.call_json(prompt, CHECK_SCHEMA, purpose="answerability_check", cap=CAP)
    return {it["id"]: it for it in got["items"]}


def main():
    S = specs()
    wording = {}
    for k in range(0, len(S), 20):
        wording.update(phrase(S[k:k + 20]))
    missing = [s["id"] for s in S if s["id"] not in wording]
    assert not missing, f"Gemini skipped ids: {missing}"
    items, problems = [], []
    for s in S:
        q = re.sub(r"\s+", " ", wording[s["id"]]).strip()
        if s["name"] and s["name"].lower() not in q.lower():
            problems.append((s["id"], "model name missing", q))
        if s["answerable"]:
            f = s["fact"]
            if isinstance(f["value"], (int, float)) and any(abs(n - float(f["value"])) < 1e-9 for n in F.numbers_in(q)):
                problems.append((s["id"], "answer value leaked", q))
        if s["style"] == "typo":
            q = TU.add_typo(q, RNG)
        row = {"id": s["id"], "question": q, "answerable": s["answerable"], "set": "dev_v2", "style": s["style"]}
        if s["answerable"]:
            f = s["fact"]
            row.update(fact_id=f["id"], expected_value=f["value"], unit=f.get("unit"), source_doc=f["source_doc"],
                       category="known_fact", topic=f["attribute"])
        else:
            row.update(fact_id=None, expected_value=None, unit=None, source_doc=None,
                       category=T.CATEGORY_TO_DEV[s["cat"]], topic=s["topic"])
        items.append(row)
    checks = answerability([(r["id"], r["question"]) for r in items if not r["answerable"]])
    flagged = [(i, c["evidence"]) for i, c in checks.items() if c["answerable_from_documents"]]
    out = setup.path(CFG["data"]["dev_v2"])
    setup.write_json(out, items)
    report = {"problems": problems, "answerability_flagged": flagged, "gemini": G.stats(),
              "counts": {"total": len(items), "answerable": sum(r["answerable"] for r in items),
                         "by_category": dict(collections.Counter(r["category"] for r in items)),
                         "by_style": dict(collections.Counter(r["style"] for r in items))}}
    setup.write_json(setup.V2_ROOT / "logs" / "build_dev_v2_report.json", report)
    print(json.dumps(report, indent=1, ensure_ascii=False))
    for r in items:
        print(f"{r['id']} [{r['category']}/{r['style']}] {r['question']}")


if __name__ == "__main__":
    main()
