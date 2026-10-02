"""Build the session-authored SFT data consumed by notebook 05, offline.

No model/API calls. Uses canonical facts and the authored policy/refusal seed.
Evaluation content is not read here. A separate overlap audit only compares
question hashes after authorship and never feeds evaluation text into examples.
"""
from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
import hashlib
import itertools
import json
from pathlib import Path
import random
import re
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from src import lab
RAW = ROOT / "data/raw"
GEN = ROOT / "data/generated"
DETAIL = GEN / "sft_session"
SEED_PATH = DETAIL / "policy_refusal_seed.json"
FACTS = json.loads((RAW / "facts.json").read_text())["facts"]
BY_ID = {f["id"]: f for f in FACTS}
MODELS = list(dict.fromkeys(f["model"] for f in FACTS))
BY_MODEL = {m: {f["attribute"]: f for f in FACTS if f["model"] == m} for m in MODELS}
SPEC_FILES = dict(zip(MODELS, ["spec_meridian_arc_110.md", "spec_meridian_pulse_125.md", "spec_meridian_volt_x.md"]))

# The final phrasing in each list is reserved for validation. All facts remain
# represented in training; this is a familiar-domain paraphrase check.
QUESTIONS = {
    "battery_kwh": [
        "How much battery capacity does the {m} have?",
        "Tell me the battery size in kWh for the {m}.",
        "For the {m}, what kWh rating is listed for the battery?",
        "I'm looking at the {s}. How big is its battery in kWh?",
        "Can you confirm the {m}'s battery-capacity figure?",
        "What battery capacity should I note down for the {m}?",
        "Could you give me the {m} battery rating in kilowatt-hours?",
        "How many kWh of battery capacity are specified for the {s}?",
        "whats the batery capacity of the {m}?",
        "In the {m} specification, which capacity is assigned to the battery?",
    ],
    "range_km": [
        "How far is the {m} certified to go on a full charge?",
        "Tell me the {m}'s certified full-charge range in km.",
        "What certified distance per full charge is listed for the {m}?",
        "I'm considering the {s}. What's its certified range?",
        "Can you confirm the certified range figure for the {m}?",
        "For the {m}, how many kilometres is the certified range?",
        "Please give the official full-charge range for the {m}.",
        "Which certified range belongs to the {s}?",
        "whats the certified rang on a full charge for the {m}?",
        "Looking only at certified range, what figure does the {m} specification report?",
    ],
    "top_speed_kmph": [
        "How fast can the {m} go at its listed top speed?",
        "Tell me the maximum speed listed for the {m} in km/h.",
        "What top-speed figure does the {m} specification give?",
        "What's the {s}'s top speed?",
        "Can you confirm the {m}'s maximum listed speed?",
        "For the {m}, what speed is specified as the top speed?",
        "Which km/h figure describes the {m}'s top speed?",
        "I need the top-speed specification for the {s}.",
        "whats the top speeed of the {m}?",
        "When listing the {m}'s performance, which top speed should I use?",
    ],
    "charge_time_hours": [
        "How long does a full standard charge take for the {m}?",
        "Tell me the time to fully charge the {m} with its standard charger.",
        "For the {m}, how many hours does the standard full charge take?",
        "I'm using the standard charger. What's the full-charge time for the {s}?",
        "Can you confirm the {m}'s standard-charger duration for a full charge?",
        "What full-charge time is listed for the {m} on the normal charger?",
        "Please give the {m}'s standard charging time, not fast charging.",
        "How many hours should I quote for a full standard charge of the {s}?",
        "how long for a ful charge of the {m} on the standard charger?",
        "Using the standard charging specification, what duration corresponds to a full charge of the {m}?",
    ],
    "fast_charge_minutes": [
        "Does the {m} support fast charging, and if so how long to 80 percent?",
        "Tell me the fast-charging specification for the {m}.",
        "For the {m}, is a fast-charge time to 80 percent listed?",
        "Can the {s} use fast charging? What's the stated time if it can?",
        "Can you confirm fast-charger support and the 80-percent time for the {m}?",
        "What does the {m} specification say about fast charging?",
        "Please explain whether the {m} has a fast-charging option.",
        "Is fast charging supported for the {s}, with a time to 80 percent?",
        "does the {m} suport fast charging and how long to 80 percent?",
        "Checking the {m}'s fast-charging entry, what support or timing does the document state?",
    ],
    "motor_kw": [
        "How much peak motor power does the {m} have?",
        "Tell me the peak power rating of the {m}'s motor.",
        "For the {m}, what motor output is listed in kW at peak?",
        "What's the {s}'s peak motor output?",
        "Can you confirm the {m}'s peak motor-power figure?",
        "What kW rating should I use for the {m}'s peak motor power?",
        "Please give the peak motor rating for the {m}, not battery capacity.",
        "How many kilowatts of peak motor power are specified for the {s}?",
        "whats the peak moter power of the {m}?",
        "Which peak power value is attached to the motor in the {m} specification?",
    ],
    "kerb_weight_kg": [
        "How much does the {m} weigh at its stated kerb weight?",
        "Tell me the listed kerb weight of the {m} in kg.",
        "For the {m}, what is the kerb-weight specification?",
        "What's the {s}'s kerb weight?",
        "Can you confirm the kerb-weight figure for the {m}?",
        "What kg value should I note as the {m}'s kerb weight?",
        "Please give the kerb weight specified for the {m}.",
        "Which listed kerb weight belongs to the {s}?",
        "whats the kerb wieght for the {m}?",
        "When recording the {m}'s body specifications, which kerb weight should I enter?",
    ],
    "boot_litres": [
        "How much under-seat storage does the {m} provide?",
        "Tell me the under-seat storage capacity in litres for the {m}.",
        "For the {m}, how many litres fit in the listed under-seat storage space?",
        "What's the under-seat storage volume on the {s}?",
        "Can you confirm the {m}'s under-seat storage figure?",
        "What litre capacity should I note for the {m}'s storage under the seat?",
        "Please give the under-seat storage volume specified for the {m}.",
        "How many litres of under-seat storage are listed for the {s}?",
        "whats the under seat storag capacity of the {m}?",
        "Which capacity does the {m} document assign to its under-seat compartment?",
    ],
    "warranty_years": [
        "How long is the vehicle warranty for the {m}, and when does it start?",
        "Tell me the {m}'s vehicle warranty duration in years.",
        "For the {m}, what vehicle warranty period applies from delivery?",
        "What's the vehicle warranty on the {s}?",
        "Can you confirm how many years of vehicle warranty the {m} has?",
        "What warranty duration should I note for the {m} vehicle itself?",
        "Please give the vehicle warranty period specified for the {m}.",
        "How many years from delivery does the {s}'s vehicle warranty run?",
        "whats the vehcle warranty period for the {m}?",
        "Which time period applies to the {m}'s vehicle warranty rather than its battery distance limit?",
    ],
    "battery_warranty_km": [
        "How many kilometres is the {m}'s battery warranty distance limit?",
        "Tell me the distance limit on the {m}'s battery warranty.",
        "For the {m}, when does the battery warranty expire by distance or time?",
        "What's the battery warranty mileage limit for the {s}?",
        "Can you confirm the {m}'s battery warranty distance and time condition?",
        "What kilometre limit should I note for the {m}'s battery warranty?",
        "Please explain the battery warranty distance limit for the {m}.",
        "Which km limit belongs to the {s}'s battery warranty?",
        "whats the batery warranty distance for the {m}?",
        "When checking the {m}'s battery coverage, what distance limit and expiry rule should I read together?",
    ],
    "service_interval_km": [
        "How often in kilometres should the {m} be serviced?",
        "Tell me the scheduled service interval for the {m}.",
        "For the {m}, what distance separates scheduled services?",
        "What's the service schedule in km for the {s}?",
        "Can you confirm the servicing interval listed for the {m}?",
        "What kilometre interval should I follow for {m} servicing?",
        "Please give the maintenance interval for the {m}, not a charging time.",
        "At what distance intervals does the {s} need scheduled servicing?",
        "whats the servce interval for the {m}?",
        "Which distance-based maintenance interval does Meridian specify for the {m}?",
    ],
    "colours": [
        "Which colours can I choose for the {m}?",
        "Tell me the colour options listed for the {m}.",
        "For the {m}, which paint colours are in the specification?",
        "What colours does the {s} come in?",
        "Can you confirm the full colour list for the {m}?",
        "What colour choices should I note for the {m}?",
        "Please list the specified colours for the {m}.",
        "Which listed colour options belong to the {s}?",
        "what colurs are listed for the {m}?",
        "Reading the {m} specification, what is its complete set of listed colours?",
    ],
    "launch_year": [
        "Which year was the {m} launched?",
        "Tell me when the {m} was launched, by year.",
        "For the {m}, what launch year does its specification list?",
        "When did the {s} launch? I only need the year.",
        "Can you confirm the year the {m} launched?",
        "What year should I note as the {m}'s launch year?",
        "Please give the launch year recorded for the {m}.",
        "Which calendar year is listed for the launch of the {s}?",
        "what year was the {m} launced?",
        "In the product history for the {m}, which launch year is actually documented?",
    ],
}
PRICE_QUESTIONS = [
    "How much is the {m} on-road in {city}?",
    "Tell me the indicative {city} on-road price for the {m}.",
    "For the {m}, which on-road price is listed specifically for {city}?",
    "I'm looking at the {s} in {city}. What's the listed on-road amount?",
    "Can you confirm the {m}'s on-road price for {city}?",
    "What price should I note for a {m} on-road in {city}?",
    "Please give the documented on-road price of the {m} for {city}.",
    "Which indicative on-road amount applies to the {s} in {city}?",
    "whats the on road prce of the {m} in {city}?",
    "In the city-specific price entries for the {m}, what amount belongs to {city}?",
]


def value_text(f):
    v = f["value"]
    if isinstance(v, int) and f["attribute"] != "launch_year":
        return f"{v:,}"
    return str(v)


def statement(f, variant=0):
    m, v, a = f["model"], value_text(f), f["attribute"]
    # Each answer sentence binds the model, attribute, value and unit.
    if a.startswith("price_"):
        city = a.split("_")[1].title()
        return f"The {m}'s indicative on-road price in {city} is Rs {v}."
    if f["id"] == "110_fast_charge_minutes":
        return "The Meridian Arc 110 does not support fast charging."
    texts = {
        "battery_kwh": [f"The {m} has a battery capacity of {v} kWh.", f"The {m}'s battery capacity is {v} kWh."],
        "range_km": [f"The {m} has a certified range of {v} km on a full charge.", f"The {m}'s certified full-charge range is {v} km."],
        "top_speed_kmph": [f"The {m}'s listed top speed is {v} km/h.", f"The {m} has a top-speed specification of {v} km/h."],
        "charge_time_hours": [f"The {m} takes {v} hours for a full charge on the standard charger.", f"A full charge of the {m} takes {v} hours using the standard charger."],
        "fast_charge_minutes": [f"The {m} takes {v} minutes to reach 80 percent charge on the Meridian fast charger.", f"On the Meridian fast charger, the {m} reaches 80 percent charge in {v} minutes."],
        "motor_kw": [f"The {m}'s peak motor power is {v} kW.", f"The {m} has a peak motor-power rating of {v} kW."],
        "kerb_weight_kg": [f"The {m}'s kerb weight is {v} kg.", f"The {m} has a listed kerb weight of {v} kg."],
        "boot_litres": [f"The {m} has {v} litres of under-seat storage.", f"The {m}'s under-seat storage capacity is {v} litres."],
        "warranty_years": [f"The {m}'s vehicle warranty lasts {v} years from the date of delivery.", f"The {m} has a {v}-year vehicle warranty starting on the delivery date."],
        "battery_warranty_km": [f"The {m}'s battery warranty distance limit is {v} km.", f"A battery warranty distance limit of {v} km applies to the {m}."],
        "service_interval_km": [f"The {m}'s service interval is {v} km.", f"The {m} is scheduled for service every {v} km."],
        "colours": [f"The {m} is available in {v}.", f"The listed colours for the {m} are {v}."],
        "launch_year": [f"The {m} was launched in {v}.", f"The {m}'s listed launch year is {v}."],
    }
    return texts[a][variant % 2]


def closing(facts):
    attrs = {f["attribute"] for f in facts}
    if "battery_warranty_km" in attrs:
        return "The battery warranty expires at the stated distance or at the end of the vehicle warranty period, whichever comes first."
    if any(a.startswith("price_") for a in attrs):
        return "The listed on-road prices include registration and insurance and are indicative for the named cities only."
    if "service_interval_km" in attrs:
        return "Servicing must be carried out at an authorised Meridian service centre."
    return ""


def sourced_answer(facts, variant=0):
    pieces = [statement(f, variant+i) for i, f in enumerate(facts)]
    tail = closing(facts)
    if tail:
        pieces.append(tail)
    return " ".join(pieces), [{"fact_id": f["id"], "statement": s} for f,s in zip(facts, pieces)]


def normalise_question(text):
    return re.sub(r"\W+", "", text.casefold())


ROWS = []


def add(question, answer, kind, family_id, split, facts=(), source_docs=(), claims=(), topic=None):
    sources = set(source_docs)
    for f in facts:
        sources.add("warranty_policy.md" if f["source_doc"] == "warranty_policy" else SPEC_FILES[f["model"]])
    ROWS.append({"id": f"sft-session-{len(ROWS)+1:04d}", "question": question.strip(), "answer": answer.strip(),
                 "topic": topic or kind, "kind": kind, "family_id": family_id, "split": split,
                 "source_fact_ids": [f["id"] for f in facts], "source_docs": sorted(sources), "claims": list(claims)})


def choose_validation(families, count, seed):
    return set(random.Random(seed).sample(sorted(families), count))


def build():
    ROWS.clear()
    for f in FACTS:
        a, m = f["attribute"], f["model"]
        templates = PRICE_QUESTIONS if a.startswith("price_") else QUESTIONS[a]
        for i, template in enumerate(templates):
            city = a.split("_")[1].title() if a.startswith("price_") else ""
            q = template.format(m=m, s=m.removeprefix("Meridian "), city=city)
            answer, claims = sourced_answer([f], i)
            add(q, answer, "single_fact", "single/"+f["id"], "validation" if i == 9 else "train", [f], claims=claims, topic=a)

    attrs = list(BY_MODEL[MODELS[0]])
    for pair_i, (left, right) in enumerate(itertools.combinations(MODELS, 2)):
        held_attrs = choose_validation(attrs, 2, 100+pair_i)
        for a in attrs:
            fa, fb = BY_MODEL[left][a], BY_MODEL[right][a]
            label = fa["label"]
            templates = [f"Compare the {left} and {right} on {label}.",
                         f"For {label}, what does each of the {left} and {right} offer?",
                         f"I am comparing {left} with {right}; give me each model's {label}."]
            for i, q in enumerate(templates):
                answer, claims = sourced_answer([fa, fb], i)
                add(q, answer, "comparison", f"comparison/{pair_i}/{a}", "validation" if a in held_attrs else "train", [fa, fb], claims=claims, topic=a)

    groups = {
        "capacity_range": ("battery capacity and certified range", ["battery_kwh", "range_km"]),
        "motor_speed": ("peak motor power and top speed", ["motor_kw", "top_speed_kmph"]),
        "charging": ("standard full-charge time and fast-charging support or timing", ["charge_time_hours", "fast_charge_minutes"]),
        "body": ("kerb weight and under-seat storage", ["kerb_weight_kg", "boot_litres"]),
        "warranty": ("vehicle warranty period and battery warranty distance", ["warranty_years", "battery_warranty_km"]),
        "range_service": ("certified range and service interval as separate figures", ["range_km", "service_interval_km"]),
        "two_city_prices": ("on-road prices in Mumbai and Delhi", ["price_mumbai_inr", "price_delhi_inr"]),
        "launch_colours": ("launch year and colour options", ["launch_year", "colours"]),
    }
    for mi, m in enumerate(MODELS):
        held = choose_validation(groups, 1, 200+mi)
        for group, (label, attributes) in groups.items():
            fs = [BY_MODEL[m][a] for a in attributes]
            qs = [f"Give me the {m}'s {label}.", f"Can you cover both {label} for the {m}?",
                  f"I'm checking the {m}; please summarise its {label}.", f"For the {m}, I need the documented {label} together."]
            for i,q in enumerate(qs):
                answer, claims = sourced_answer(fs, i)
                add(q, answer, "multi_fact", f"multi/{mi}/{group}", "validation" if group in held else "train", fs, claims=claims, topic=group)

    correction_attrs = ["battery_kwh", "range_km", "motor_kw", "service_interval_km", "price_bengaluru_inr", "battery_warranty_km"]
    for mi, m in enumerate(MODELS):
        held = choose_validation(correction_attrs, 1, 300+mi)
        for a in correction_attrs:
            f = BY_MODEL[m][a]
            other = next(BY_MODEL[o][a] for o in MODELS if BY_MODEL[o][a]["value"] != f["value"])
            unit = f["unit"] or ""
            wrong = f"{value_text(other)} {unit}".strip()
            label = f["label"]
            qs = [f"Is {wrong} the {label} for the {m}?",
                  f"I have {wrong} written down as the {m}'s {label}. Can you check that?",
                  f"Someone told me the {m}'s {label} is {wrong}; is that what the document says?"]
            for i,q in enumerate(qs):
                answer, claims = sourced_answer([f], i)
                add(q, "No. "+answer, "premise_correction", f"correction/{mi}/{a}", "validation" if a in held else "train", [f], claims=claims, topic=a)

    seeds = json.loads(SEED_PATH.read_text())
    if isinstance(seeds, dict):
        seeds = seeds["families"]
    for kind, n_val in [("policy", 2), ("refusal", 4), ("mixed", 1)]:
        families = [s for s in seeds if s["kind"] == kind]
        held = choose_validation([s["family_id"] for s in families], n_val, {"policy":400,"refusal":401,"mixed":402}[kind])
        for family in families:
            fs = [BY_ID[fid] for fid in family.get("source_fact_ids", [])]
            for i,q in enumerate(family["questions"]):
                answer = family["answers"][i % len(family["answers"])]
                add(q, answer, kind, family["family_id"], "validation" if family["family_id"] in held else "train", fs,
                    source_docs=family["source_docs"], topic=family["topic"])
    return ROWS


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def validate(rows):
    assert rows and len({r["id"] for r in rows}) == len(rows)
    keys = [normalise_question(r["question"]) for r in rows]
    duplicates = [k for k,n in Counter(keys).items() if n > 1]
    assert not duplicates, f"Duplicate normalized questions: {duplicates[:3]}"
    for row in rows:
        assert row["question"] and row["answer"] and row["source_docs"]
        assert len(row["answer"].split()) <= 90, row["id"]
        # Decimal points are not sentence boundaries; 'Rs' is written without a dot.
        sentences = re.split(r"(?<=[.!?])\s+", row["answer"])
        assert 1 <= len(sentences) <= 3, (row["id"], "answer must use one to three sentences")
        assert not re.search(r"<\|[^>]+\|>", row["question"]+row["answer"]), row["id"]
        assert all((RAW / p).is_file() for p in row["source_docs"])
        assert all(fid in BY_ID for fid in row["source_fact_ids"])
        assert all(c["statement"] in row["answer"] for c in row["claims"])
        assert not re.search(r"2,02[456]", row["answer"]), row["id"]
        if "110_fast_charge_minutes" in row["source_fact_ids"]:
            assert not re.search(r"\b0(?:\.0)?\s+minutes\b", row["answer"])
        if row["kind"] == "refusal":
            assert not row["source_fact_ids"], "Pure unknown examples must not fabricate supported facts"
            assert lab.looks_like_refusal(row["answer"]), (row["id"], "Use a clear explicit refusal, consistent with notebook03")
    train = [r for r in rows if r["split"] == "train"]
    val = [r for r in rows if r["split"] == "validation"]
    for group in (train, val):
        assert {fid for r in group for fid in r["source_fact_ids"]} == set(BY_ID), "Every split should cover all canonical facts"
    for kind in ("comparison", "multi_fact", "premise_correction", "policy", "refusal", "mixed"):
        assert not ({r["family_id"] for r in train if r["kind"] == kind} &
                    {r["family_id"] for r in val if r["kind"] == kind}), kind
    return {"unique_normalized_questions": len(keys), "duplicates": 0,
            "all_48_facts_in_train_and_val": True, "answers_max_90_words": True,
            "answers_one_to_three_sentences": True, "no_manual_chat_tokens": True,
            "pure_refusals_explicit_under_existing_scorer": True,
            "scenario_families_separated_except_single_fact_paraphrases": True}


def main():
    rows = build()
    checks = validate(rows)
    DETAIL.mkdir(parents=True, exist_ok=True)
    snapshots = []
    split_rows = {}
    for split, filename in [("train", "sft_train.json"), ("validation", "sft_val.json")]:
        subset = [r for r in rows if r["split"] == split]
        random.Random(42 if split == "train" else 43).shuffle(subset)
        payload = json.dumps(subset, indent=2, ensure_ascii=False)+"\n"
        target = GEN / filename
        if target.exists() and target.read_text() != payload:
            backup_dir = ROOT / "outputs/sft_session/backups" / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
            backup_dir.mkdir(parents=True, exist_ok=True)
            shutil.copy2(target, backup_dir / filename)
            snapshots.append(str((backup_dir / filename).relative_to(ROOT)))
        temporary = target.with_suffix(".json.tmp")
        temporary.write_text(payload, encoding="utf-8")
        temporary.replace(target)
        split_rows[split] = subset
    # Keep the authored seed alongside the delivered data as a durable source.
    if SEED_PATH.resolve() != (DETAIL / "policy_refusal_seed.json").resolve():
        shutil.copy2(SEED_PATH, DETAIL / "policy_refusal_seed.json")
    preview = []
    for kind in dict.fromkeys(r["kind"] for r in rows):
        preview.append("## "+kind.replace("_", " "))
        for row in [r for r in rows if r["kind"] == kind][:3]:
            preview.append(f"**{row['id']} ({row['split']})**\n\nQ: {row['question']}\n\nA: {row['answer']}")
    (DETAIL / "examples.md").write_text("# Examples from the session SFT data\n\n"+"\n\n".join(preview)+"\n")
    manifest = {
        "dataset": "Meridian SFT session corpus", "version": 1, "authored_date": "2026-09-29",
        "provenance": "Questions and answer patterns authored with an AI coding assistant, expanded using canonical source facts plus authored policy/refusal families. No external generation API.",
        "records": len(rows), "splits": {k: len(v) for k,v in split_rows.items()},
        "kind_counts": {k: dict(Counter(r["kind"] for r in v)) for k,v in split_rows.items()},
        "split_method": "Single-fact questions reserve the final authored wording for validation; other kinds keep entire comparison/scenario families in one split. Same48facts occur in both; this is not unseen-knowledge validation.",
        "source_sha256": {str(p.relative_to(ROOT)): sha(p) for p in sorted(RAW.glob("*")) if p.is_file()},
        "authoring_seed_sha256": sha(SEED_PATH), "builder_sha256": sha(Path(__file__)),
        "output_sha256": {n: sha(GEN / n) for n in ("sft_train.json", "sft_val.json")},
        "previous_files_backed_up": snapshots,
        "external_generation_api_calls": 0, "model_training_executed": False,
        "eval_content_used_for_authorship": False,
        "checks": checks,
        "notes": [
            "Training reads only question and answer; extra fields provide provenance.",
            "No exact dev unknown questions are recycled as refusal seeds, unlike the original notebook03 cell.",
            "Correcting a false premise uses a wrong value in the masked question and only correct facts in the supervised answer.",
            "Arc fast charging is unsupported, not a zero-minute duration; source facts.json stores a zero sentinel.",
            "Specificity of numeric curation uses model/attribute provenance, rather than notebook03's global number whitelist.",
            "These are controlled synthetic examples over the small fictional domain; improved performance is unmeasured.",
        ],
    }
    (DETAIL / "manifest.json").write_text(json.dumps(manifest, indent=2)+"\n")
    print(json.dumps({"records": manifest["records"], "splits": manifest["splits"], "kind_counts": manifest["kind_counts"], "checks": checks}, indent=2))


if __name__ == "__main__":
    main()
