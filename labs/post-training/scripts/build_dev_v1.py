"""Build a new, dev-informed evaluation set from 50 explicitly authored questions.

No generation, network calls, model loading, or training. Original evaluation and
training files are read only. The reserved held-out set exposes counts only: its
question text is converted to normalized SHA-256 values inside a small helper.
"""
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import sys
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from src import lab

AUTHORED_ON = "2026-09-30"
JACCARD_THRESHOLD = 0.8
SOURCE_REVIEW_SHA256 = {
    "data/raw/brand_guide.md": "3c9075c5c299fe3d28d327a83ea467bc263126fd5d6a735ed0278ff4c1d9c4e2",
    "data/raw/spec_meridian_arc_110.md": "e5bf04c2ac835d164eb8f75460ed10742de52ddd97dafd18454b55b42306bdbd",
    "data/raw/spec_meridian_pulse_125.md": "5e0bf7d8ab45e7ec1a1382cc86f9b35c57105d2231967f0c71bd16dba972d33c",
    "data/raw/spec_meridian_volt_x.md": "a097efa23a8ce8f6d3c0d95a26eaea2be0b4baed25f15f81ae9283057a3550ba",
    "data/raw/warranty_policy.md": "810c40f0dea6c207aa07dd7536f7b306e188635c619fe14362d7b136d9dd9ac6",
}

# Exactly ten facts per model. Each of the fifteen numeric attributes appears
# twice across models. Colours and the Arc's unsupported-fast-charge sentinel
# are excluded because the unchanged scorer cannot reliably score them.
# Every question is authored inline; the fact file supplies only its truth label.
ANSWERABLE = [
    ("dv1_a01", "110_battery_kwh", "casual", "For an Arc 110, how much energy fits in a fully charged battery, in kWh?"),
    ("dv1_a02", "110_top_speed_kmph", "casual", "If I wind an Arc 110 right up, what's its listed maximum speed?"),
    ("dv1_a03", "110_charge_time_hours", "casual", "Using the ordinary charger, how long is an Arc 110's full recharge meant to take?"),
    ("dv1_a04", "110_motor_kw", "casual", "How much peak power can the Arc 110 motor put out?"),
    ("dv1_a05", "110_kerb_weight_kg", "typo", "What's the Arc 110's kerb wieght, before adding a rider?"),
    ("dv1_a06", "110_boot_litres", "typo", "How many litres of storge are tucked beneath an Arc 110 seat?"),
    ("dv1_a07", "110_warranty_years", "customer_situation", "I'm buying a new Arc 110 and comparing cover periods. How many years does its vehicle warranty last?"),
    ("dv1_a08", "110_service_interval_km", "customer_situation", "My Arc 110 is about to start daily commuting. At what kilometre spacing must I arrange its regular services?"),
    ("dv1_a09", "110_price_mumbai_inr", "direct", "Give the listed Mumbai on-road amount, in rupees, for an Arc 110."),
    ("dv1_a10", "110_price_delhi_inr", "direct", "State the Arc 110's published on-road total for a purchase in Delhi."),
    ("dv1_a11", "125_range_km", "casual", "On one topped-up battery, how many certified kilometres can a Pulse 125 manage?"),
    ("dv1_a12", "125_charge_time_hours", "casual", "How long am I waiting for a Pulse 125 to finish a full standard-charger recharge?"),
    ("dv1_a13", "125_fast_charge_minutes", "casual", "With Meridian's fast charger, how many minutes does a Pulse 125 need to reach eighty percent?"),
    ("dv1_a14", "125_motor_kw", "typo", "Could you give the Pulse 125's peak moter output in kilowatts?"),
    ("dv1_a15", "125_kerb_weight_kg", "typo", "What's the kerb wieght quoted for the Pulse 125 scooter?"),
    ("dv1_a16", "125_battery_warranty_km", "customer_situation", "I expect to ride a Pulse 125 a lot. What odometer distance caps its battery warranty?"),
    ("dv1_a17", "125_service_interval_km", "customer_situation", "I'm setting maintenance reminders for a Pulse 125. How many kilometres should separate scheduled services?"),
    ("dv1_a18", "125_price_mumbai_inr", "direct", "What on-road rupee total is published for the Pulse 125 in Mumbai?"),
    ("dv1_a19", "125_price_bengaluru_inr", "direct", "Quote the official Bengaluru on-road listing for a Pulse 125."),
    ("dv1_a20", "125_launch_year", "direct", "Which calendar year marks the introduction of the Pulse 125 model?"),
    ("dv1_a21", "x_battery_kwh", "casual", "How big is the Volt X's energy pack when measured in kilowatt-hours?"),
    ("dv1_a22", "x_range_km", "casual", "A full battery in a Volt X gets me what certified distance before the next charge?"),
    ("dv1_a23", "x_top_speed_kmph", "casual", "Flat out, what top-speed figure does Meridian publish for the Volt X?"),
    ("dv1_a24", "x_fast_charge_minutes", "typo", "How many minutes on Meridian's fast charger bring a Volt X to 80 persent?"),
    ("dv1_a25", "x_boot_litres", "customer_situation", "I'm choosing space for things under the seat of a Volt X. What is that compartment's capacity in litres?"),
    ("dv1_a26", "x_warranty_years", "direct", "Specify the duration in years of the Volt X vehicle warranty."),
    ("dv1_a27", "x_battery_warranty_km", "direct", "What mileage limit, in kilometres, applies to the Volt X battery warranty?"),
    ("dv1_a28", "x_price_bengaluru_inr", "direct", "What is the Volt X's stated on-road charge for Bengaluru buyers?"),
    ("dv1_a29", "x_price_delhi_inr", "direct", "Name the rupee amount listed for a Volt X on-road purchase in Delhi."),
    ("dv1_a30", "x_launch_year", "direct", "In which year was the Volt X model first launched?"),
]

# Each question asks for one absent item. Search terms deliberately include
# synonyms; an explanatory check distinguishes related prose from an answer.
# The final field records semantic separation from nearby trained refusal topics.
UNANSWERABLE = [
    ("dv1_u01", "price_near_miss", "battery_warranty_km", "What amount does Meridian charge for an authorised battery-capacity diagnostic on an Arc 110?",
     ["diagnostic", "assessment", "assessed", "fee", "charge"],
     "An authorised service centre assesses capacity for the battery-defect threshold, but no fee for that assessment or diagnostic test is stated. A warranty criterion does not supply the test's price.",
     "Diagnostic-test pricing differs from all 32 refusal and 8 mixed unknown topics. It is not battery replacement cost, resale, insurance, service appointment availability, or opening hours; no DPO prompt requests this fee."),
    ("dv1_u02", "price_near_miss", "fast_charge_minutes", "What per-kWh tariff is published for charging a Pulse 125 at a Meridian fast charger?",
     ["tariff", "per-kWh", "electricity", "fee", "fast charg"],
     "The Pulse fast-charge duration and supported charger are documented, but no energy tariff, session charge, or charging-service price is given. A charging time does not establish a monetary rate.",
     "Charging-energy tariff is distinct from seeded charger hardware details and the mixed charger-weight topic; it is not a finance interest rate. No DPO prompt covers fast-charging cost."),
    ("dv1_u03", "price_near_miss", "service_interval_km", "What labour fee does Meridian list for replacing the Volt X motor?",
     ["labour", "labor", "replacing", "repair", "fee"],
     "The warranty gives service intervals and exclusions but no labour tariff, motor-replacement charge, or repair-price schedule. Peak motor power cannot supply a price.",
     "Repair labour pricing differs from the seeded service-centre hours, appointment waiting time, roadside assistance, and lost-key procedure."),
    ("dv1_u04", "price_near_miss", "price_mumbai_inr", "For an Arc 110 registered in Mumbai, what is the road-tax amount by itself, excluding the rest of the on-road bill?",
     ["road tax", "tax", "registration", "inclusive"],
     "On-road prices include registration and insurance, but no component breakdown or standalone road-tax amount is given. Subtracting an unknown component cannot recover it.",
     "Standalone road tax is not any of the 32 seed topics; it does not ask about a finance rate or refundable deposit."),
    ("dv1_u05", "price_near_miss", "price_bengaluru_inr", "What separate pre-delivery inspection fee does Meridian list for a Pulse 125?",
     ["pre-delivery", "pre delivery", "inspection", "handling", "fee"],
     "The published on-road total includes registration and insurance, but no pre-delivery inspection tariff or separate inspection fee appears. Its existence or amount must not be inferred from a total vehicle price.",
     "Pre-delivery inspection pricing is outside the 32 refusal and 8 mixed unknown topics and all DPO prompts. It differs from home-delivery availability, a booking-deposit refund, paint surcharge, and insurance premium."),
    ("dv1_u06", "price_near_miss", "price_delhi_inr", "Give me the Volt X on-road quotation for Pune, rather than one of the three listed cities.",
     ["Pune", "Mumbai", "Bengaluru", "Delhi", "listed cities"],
     "Only Mumbai, Bengaluru and Delhi have on-road prices. The brand guide prohibits quoting an unlisted city, and no Pune quotation is supplied.",
     "Unlisted-city vehicle pricing is absent from the 32 seed topics. This asks for a local price, not the seeded home-delivery or intercity-shipping process."),
    ("dv1_u07", "price_near_miss", "warranty_years", "What fee would buy two additional years of vehicle-warranty cover for an Arc 110?",
     ["extended", "extension", "additional years", "fee"],
     "Standard vehicle-warranty periods are stated, but no paid extension product, additional-year price, or extended-warranty fee is described. The question does not assume such a product exists.",
     "Paid warranty extension is not a seeded topic; it differs from roadside assistance and a booking-deposit refund."),
    ("dv1_u08", "price_near_miss", "charge_time_hours", "What retail price is listed for a replacement standard charger for the Pulse 125?",
     ["replacement", "charger", "retail", "price"],
     "The specification gives charging times and the warranty excludes damage from a non-Meridian charger. Neither supplies a replacement-charger retail price.",
     "Charger purchase price is a new attribute, distinct from the seeded cable length, mains-plug specification, weatherproof rating, and charging-port location."),
    ("dv1_u09", "spec_near_miss", "battery_kwh", "State the Arc 110 battery pack's nominal voltage in volts.",
     ["nominal", "voltage", "volts", "volt", "auxiliary"],
     "The Arc specification states energy capacity in kWh, not traction-pack voltage. The policy's twelve-volt auxiliary battery is a different battery, and Volt X is a model name.",
     "Traction-pack nominal voltage is not a seeded topic; it is independent of whether the main battery is removable."),
    ("dv1_u10", "spec_near_miss", "top_speed_kmph", "How many rider-selectable regenerative-braking levels does a Pulse 125 provide?",
     ["regenerative", "regen", "braking", "brake", "levels"],
     "No regenerative-braking feature or adjustment levels are described. Brake pads occur only as excluded consumables, which does not establish regenerative-braking controls.",
     "Regenerative-braking controls are absent from the seeded topics; this is not a vehicle-software update procedure."),
    ("dv1_u11", "spec_near_miss", "motor_kw", "What final-drive reduction ratio is specified for the Volt X powertrain?",
     ["final drive", "reduction", "ratio", "transmission", "gear"],
     "The powertrain lists energy, peak power, certified range and top speed. It gives no final-drive design or reduction ratio, and those listed figures do not determine a ratio.",
     "Final-drive gearing is not among the 32 refusal topics and does not concern towing or payload capacity."),
    ("dv1_u12", "spec_near_miss", "motor_kw", "What maximum hill-climbing gradient, expressed as a percentage, is specified for the Arc 110?",
     ["gradient", "hill", "slope", "incline", "climb"],
     "Peak motor power, range and top speed are stated, but no rated climbing gradient appears. These figures alone cannot determine a permitted hill slope or a tested gradeability rating.",
     "Hill-climbing gradient is absent from all 32 refusal and 8 mixed unknown topics and all DPO prompts. It is distinct from payload/towing limits, acceleration, wet-weather range, and wheelbase."),
    ("dv1_u13", "spec_near_miss", "charge_time_hours", "At its rated input, how many watts does the Pulse 125 standard charger draw from the mains?",
     ["watts", "wattage", "input power", "mains", "charger"],
     "Charging duration is documented, but rated mains input power and charging efficiency are not. Battery energy divided by duration would not establish a rated wall-power specification.",
     "Rated electrical input power is distinct from the seeded mains-plug/socket format, cable length, and outdoor-use rating."),
    ("dv1_u14", "policy_near_miss", "warranty_years", "If I sell a Volt X privately, does the remaining vehicle warranty transfer to the second owner?",
     ["transfer", "second owner", "ownership", "resale"],
     "The policy starts coverage on delivery and states periods/exclusions, but contains no ownership-transfer rule. A coverage period alone does not establish transferability.",
     "Warranty transfer on resale is absent from the seed topics; it is not cancellation of an uncompleted booking."),
    ("dv1_u15", "policy_near_miss", "battery_warranty_km", "After discovering a battery fault on my Arc 110, within how many days must I notify Meridian to preserve a claim?",
     ["notify", "notification", "deadline", "days", "claim"],
     "Battery defect criteria and coverage limits are present, but no fault-notification deadline or claim-filing period is stated. Service mileage intervals are not notice deadlines.",
     "Claim-notification deadlines differ from seeded service-centre opening hours and appointment lead times."),
    ("dv1_u16", "policy_near_miss", "warranty_years", "Would using a Pulse 125 for paid parcel deliveries change its vehicle-warranty eligibility?",
     ["commercial", "parcel", "courier", "business use", "delivery"],
     "The exclusions name consumables, certain damage, modifications and chargers. They neither permit nor prohibit commercial delivery work. The date-of-delivery clause concerns the warranty start, not delivery employment.",
     "Commercial-use eligibility differs from seeded home delivery of a purchased scooter and transporting the scooter itself by courier/freight."),
    ("dv1_u17", "policy_near_miss", "battery_warranty_km", "What is the official appeal process if Meridian rejects a Volt X battery-warranty claim?",
     ["appeal", "dispute", "escalat", "reject", "claim"],
     "An authorised centre assesses battery capacity, but the documents provide no appeal, dispute-escalation, or rejected-claim review process.",
     "Warranty-dispute appeals are not in the seeded refusal families; assessment criteria do not supply an appeals workflow."),
    ("dv1_u18", "out_of_scope", "launch_year", "In which year was Meridian Motors legally incorporated as a company?",
     ["incorporat", "founded", "established", "company"],
     "Product launch years are stated, but no incorporation, founding or company-registration date appears. A scooter launch year is not the company's incorporation year.",
     "Corporate incorporation is outside all 32 seeded topics, which concern vehicle features or customer-service arrangements."),
    ("dv1_u19", "out_of_scope", "price_delhi_inr", "What is the postal address of Meridian Motors' registered corporate office?",
     ["registered office", "head office", "headquarters", "postal", "address"],
     "Cities appear as price markets, not corporate addresses. No registered-office address, headquarters location or postal contact is supplied.",
     "Corporate-office address is not the seeded service-centre opening-hours topic or a home-delivery arrangement."),
    ("dv1_u20", "out_of_scope", "company", "Which organisation or person holds the largest ownership stake in Meridian Motors?",
     ["sharehold", "ownership stake", "largest owner", "founder", "investor"],
     "The documents name the brand and its scooter models but contain no shareholders, investors, founders or ownership percentages.",
     "Corporate shareholding is absent from all 32 seeded vehicle/service refusal topics."),
]

EXCLUDED = {
    "110_colours": "Literal-list scoring is formatting sensitive; exclude colours.",
    "125_colours": "Literal-list scoring is formatting sensitive; exclude colours.",
    "x_colours": "Literal-list scoring is formatting sensitive; exclude colours.",
    "110_fast_charge_minutes": "Value 0 is the sentinel for unsupported fast charging, not a charging duration; the numeric scorer mis-scores natural-language answers.",
}


def normalise(text):
    """NFKC + casefold + punctuation/underscore removal + whitespace collapse."""
    return " ".join(re.sub(r"[\W_]+", " ", unicodedata.normalize("NFKC", text).casefold()).split())


def text_hash(text):
    return hashlib.sha256(normalise(text).encode("utf-8")).hexdigest()


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def reserved_hashes(path):
    """Return only hashes/count; never return, print, log, or persist reserved text."""
    records = json.loads(path.read_text())
    return {text_hash(record["question"]) for record in records}, len(records)


def question_sources():
    """Use full CPT documents as requested, not extracted sentences or n-grams."""
    result = {}
    fields = {
        "evals/dev.json": "question",
        "data/generated/sft_train.json": "question",
        "data/generated/sft_val.json": "question",
        "data/generated/dpo_train.json": "prompt",
        "data/generated/dpo_val.json": "prompt",
    }
    for name, field in fields.items():
        if not (ROOT / name).is_file():
            continue  # DPO pairs exist only after notebook 06 has run
        rows = json.loads((ROOT / name).read_text())
        result[name] = [(str(i), row[field]) for i, row in enumerate(rows)]
    name = "data/generated/sft_session/policy_refusal_seed.json"
    seed = json.loads((ROOT / name).read_text())
    result[name] = [
        (f"{i}:{j}", question)
        for i, row in enumerate(seed) for j, question in enumerate(row["questions"])
    ]
    for name in ("data/generated/cpt_session/train.jsonl", "data/generated/cpt_session/validation.jsonl"):
        rows = [json.loads(line) for line in (ROOT / name).read_text().splitlines() if line.strip()]
        result[name] = [(row["id"], row["text"]) for row in rows]
    return result, seed


def overlap_audit(rows, sources):
    """Report every lexical collision, without modifying authored questions."""
    reports = {}
    for name, old_rows in sources.items():
        prepared = [(key, normalise(text), set(normalise(text).split())) for key, text in old_rows]
        exact, near = [], []
        maximum = 0.0
        for row in rows:
            norm = normalise(row["question"])
            tokens = set(norm.split())
            for key, old_norm, old_tokens in prepared:
                similarity = len(tokens & old_tokens) / max(len(tokens | old_tokens), 1)
                maximum = max(maximum, similarity)
                if norm == old_norm:
                    exact.append({"new_id": row["id"], "source_record": key})
                if similarity >= JACCARD_THRESHOLD:
                    near.append({"new_id": row["id"], "source_record": key, "jaccard": round(similarity, 6)})
        reports[name] = {
            "records_checked": len(old_rows), "exact_matches": exact,
            "near_duplicates": near, "max_token_jaccard": round(maximum, 6),
            "sha256": sha256(ROOT / name),
        }
    hashes, count = reserved_hashes(ROOT / "evals/heldout.json")
    reports["evals/heldout.json"] = {
        "method": "normalized-question SHA-256 equality only; no Jaccard or wording inspection",
        "records_checked": count,
        "exact_hash_match_count": sum(text_hash(row["question"]) in hashes for row in rows),
    }
    return reports


def absence_check(terms, reason, documents):
    results = {}
    for term in terms:
        # Preserve the actual source line so related hits can be checked by a reader.
        results[term] = [
            {"source_path": name, "line": i, "text": line.strip()}
            for name, text in documents.items()
            for i, line in enumerate(text.splitlines(), 1)
            if term.casefold() in line.casefold()
        ]
    return {"searched_terms": terms, "term_hits": results, "reason": reason,
            "scope": "All five current data/raw/*.md documents; absence assessed semantically as well as lexically."}


def build():
    facts = lab.fact_index()
    documents = {str(p.relative_to(ROOT)): p.read_text() for p in sorted(lab.RAW.glob("*.md"))}
    assert len(documents) == 5, "Re-review absence evidence if the canonical source corpus changes"
    assert {name: sha256(ROOT / name) for name in documents} == SOURCE_REVIEW_SHA256, "Source documents changed; re-review all authored absence claims before rebuilding"
    rows = []
    for qid, fid, style, question in ANSWERABLE:
        f = facts[fid]
        assert fid not in EXCLUDED
        rows.append({"id": qid, "question": question, "answerable": True,
                     "fact_id": fid, "expected_value": f["value"], "unit": f["unit"],
                     "source_doc": f["source_doc"], "set": "dev_v1", "category": "known_fact", "style": style})
    semantic_review = {}
    for qid, category, near_miss, question, terms, reason, distinction in UNANSWERABLE:
        rows.append({"id": qid, "question": question, "answerable": False,
                     "fact_id": None, "expected_value": None, "unit": None, "source_doc": None,
                     "set": "dev_v1", "category": category, "style": "direct",
                     "near_miss_of": near_miss, "absence_check": absence_check(terms, reason, documents)})
        semantic_review[qid] = {
            "distinction": distinction,
            "review_scope": "32 refusal topics, 8 mixed unknown topics, every current DPO train/validation prompt",
            "method": "Manual topic/attribute comparison; not inferred from low lexical similarity",
        }
    assert len(rows) == 50 and len({r["id"] for r in rows}) == 50
    assert len({normalise(r["question"]) for r in rows}) == 50
    required = {"id", "question", "answerable", "fact_id", "expected_value", "unit", "source_doc", "set", "category", "style"}
    for row in rows:
        assert required <= row.keys() and isinstance(row["answerable"], bool)
        assert row["question"].strip() and row["set"] == "dev_v1"
        if row["answerable"]:
            fact = facts[row["fact_id"]]
            assert all(row[name] == fact[source] for name, source in (("expected_value", "value"), ("unit", "unit"), ("source_doc", "source_doc")))
        else:
            assert all(row[name] is None for name in ("fact_id", "expected_value", "unit", "source_doc"))
            assert row["near_miss_of"] and row["absence_check"]["reason"]
    known = [r for r in rows if r["answerable"]]
    unknown = [r for r in rows if not r["answerable"]]
    model_counts = Counter(facts[r["fact_id"]]["model"] for r in known)
    attribute_counts = Counter(facts[r["fact_id"]]["attribute"] for r in known)
    style_counts = Counter(r["style"] for r in known)
    category_counts = Counter(r["category"] for r in rows)
    numeric_attributes = {f["attribute"] for fid, f in facts.items() if fid not in EXCLUDED}
    assert len(known) == 30 and len(unknown) == 20
    assert len(model_counts) == 3 and set(model_counts.values()) == {10}
    assert set(attribute_counts) == numeric_attributes and set(attribute_counts.values()) == {2}
    assert style_counts == {"casual": 10, "typo": 5, "customer_situation": 5, "direct": 10}
    assert category_counts == {"known_fact": 30, "price_near_miss": 8, "spec_near_miss": 5, "policy_near_miss": 4, "out_of_scope": 3}
    sources, seed = question_sources()
    refused = [r for r in seed if r["kind"] == "refusal"]
    mixed = [r for r in seed if r["kind"] == "mixed"]
    assert len(refused) == 32
    assert len(mixed) == 8
    audit = overlap_audit(rows, sources)
    violations = {name: report for name, report in audit.items()
                  if report.get("exact_matches") or report.get("near_duplicates") or report.get("exact_hash_match_count", 0)}
    if violations:
        # Reserved-set output remains counts-only. No reserved wording enters an error.
        raise ValueError("Overlap audit failed; revise authored questions before writing:\n" + json.dumps(violations, indent=2))
    destination = ROOT / "evals/dev_v1.json"
    payload = json.dumps(rows, ensure_ascii=False, indent=2) + "\n"
    manifest = {
        "name": "dev_v1", "schema": "evals/dev.json + set/category/style/unknown absence evidence",
        "authored_on": AUTHORED_ON, "development_status": "dev-informed; not an independent held-out result",
        "builder": "scripts/build_dev_v1.py", "builder_sha256": sha256(Path(__file__)),
        "dataset_path": "evals/dev_v1.json", "dataset_sha256": hashlib.sha256(payload.encode()).hexdigest(),
        "counts": {"total": len(rows), "answerable": len(known), "unanswerable": len(unknown),
                   "answerable_by_model": dict(sorted(model_counts.items())),
                   "answerable_by_attribute": dict(sorted(attribute_counts.items())),
                   "answerable_by_style": dict(sorted(style_counts.items())),
                   "all_by_style": dict(sorted(Counter(r["style"] for r in rows).items())),
                   "by_category": dict(sorted(category_counts.items()))},
        "attribute_count_resolution": "The brief says 14 scoreable attributes; facts.json actually contains 15 distinct numeric attributes after colours are excluded. All 15 are covered exactly twice. The Arc fast-charge sentinel is excluded individually; Pulse and Volt supply the two valid fast-charge facts.",
        "excluded_facts": EXCLUDED,
        "source_evidence": {"facts_sha256": sha256(lab.RAW / "facts.json"),
                            "documents_sha256": {name: sha256(ROOT / name) for name in documents}},
        "overlap_audit": {"normalization": "Unicode NFKC, casefold, replace punctuation/underscores by spaces, collapse whitespace",
                          "jaccard": "set(word tokens) intersection / union; threshold >= 0.8; no stopword removal",
                          "cpt_scope": "Each complete JSONL text field is one comparison record; no sentence extraction",
                          "threshold": JACCARD_THRESHOLD, "sources": audit,
                          "exact_match_count": 0, "unresolved_near_duplicate_count": 0,
                          "status": "PASS"},
        "refusal_topic_review": {"method": "Author reviewed all 56 seed rows: 32 refusal families, 8 mixed known/unknown families, and 16 grounded policy families; also all DPO prompts and the five source documents. Distinct requested unknown attributes/processes were checked semantically, beyond lexical overlap. The 8 mixed unknown topics are excluded in addition to the brief's 32 refusal-topic minimum.",
                                 "seed_refusal_family_count": 32,
                                 "seed_refusal_topics_excluded": [r["topic"] for r in refused],
                                 "mixed_unknown_family_count": 8,
                                 "mixed_unknown_topics_excluded": [r["topic"] for r in mixed],
                                 "per_question_distinction": semantic_review,
                                 "review_revisions": ["Replaced an initial wheelbase question because it reused a mixed-family unknown attribute, despite passing lexical checks.", "Rejected a proposed paint-surcharge replacement because the mixed seed already trains that unknown attribute.", "Replaced initial salvage/trade-in/insurance items with diagnostic fee, charging tariff and pre-delivery inspection fee to increase separation from older refusal themes."],
                                 "status": "PASS: all 20 unknown questions request attributes/processes outside the 32 refusal and 8 mixed-unknown training families and all current DPO prompts"},
        "checks": {"schema": True, "unique_ids_and_normalized_questions": True,
                   "one_fact_per_answerable": True, "expected_values_copied_from_facts": True,
                   "ten_per_model": True, "all_fifteen_numeric_attributes_twice": True,
                   "style_minima": True, "unknown_category_counts": True,
                   "unknown_null_truth_fields": True, "unknown_source_absence_review": True,
                   "training_and_dev_overlap_audit": True, "heldout_hash_only_audit": True,
                   "no_external_api_or_model_use": True},
        "limitations": ["Lexical novelty is not new knowledge: answerable source facts intentionally recur across training and evaluation.",
                        "Known source-policy rules still apply: for example, the unlisted-city question applies a trained rule against quoting unlisted cities. Novelty here means separation from the 32 explicit refusal and 8 mixed-unknown topics, not an entirely new policy concept.",
                        "The unchanged scorer checks numbers/strings and refusal markers; it does not fully judge meaning, extra unsupported claims, or units.",
                        "This set deliberately probes weaknesses seen in original dev results and must remain labelled development data.",
                        "Absence and topic-separation checks are author-reviewed reasoning, not a claim of automatic semantic verification."]
    }
    destination.write_text(payload)
    (ROOT / "evals/dev_v1_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"dataset": str(destination.relative_to(ROOT)), "counts": manifest["counts"],
                      "sha256": manifest["dataset_sha256"], "audit": "PASS",
                      "exact_matches": 0, "unresolved_near_duplicates": 0,
                      "heldout_hash_matches": audit["evals/heldout.json"]["exact_hash_match_count"]}, indent=2))
    return rows, manifest


if __name__ == "__main__":
    build()
