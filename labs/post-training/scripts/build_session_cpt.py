"""Rebuild the CPT passages authored in the 2026-09-29 learning session.

Offline and deterministic: canonical sources + authored language patterns only.
No API, model generation, evaluation questions, or saved model answers are read.
Run from the project root: .venv/bin/python scripts/build_session_cpt.py
"""
from __future__ import annotations

import hashlib
import itertools
import json
import random
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data/raw"
OUT = ROOT / "data/generated/cpt_session"
FACTS = json.loads((RAW / "facts.json").read_text())["facts"]
BY_ID = {f["id"]: f for f in FACTS}
MODELS = list(dict.fromkeys(f["model"] for f in FACTS))
BY_MODEL = {m: {f["attribute"]: f for f in FACTS if f["model"] == m} for m in MODELS}
SPEC_FILES = dict(zip(MODELS, ["spec_meridian_arc_110.md", "spec_meridian_pulse_125.md", "spec_meridian_volt_x.md"]))

# Six attribute-specific ways to state each fact. Numbers are inserted from
# facts.json, never generated. The units and conditions stay attached.
PHRASES = {
    "battery_kwh": [
        "The {m} has a battery capacity of {v} kWh.",
        "Battery capacity for the {m} is rated at {v} kWh.",
        "The specification for the {m} lists {v} kWh of battery capacity.",
        "For the {m}, the battery-capacity figure is {v} kWh.",
        "A {v} kWh battery is specified for the {m}.",
        "The battery in the {m} is rated at {v} kWh of capacity.",
    ],
    "range_km": [
        "The {m} has a certified range of {v} km on a full charge.",
        "On a full charge, the certified range for the {m} is {v} km.",
        "The certified full-charge range listed for the {m} is {v} km.",
        "For the {m}, {v} km is the certified range on a full charge.",
        "The {m} specification gives {v} km as its certified full-charge range.",
        "A full charge corresponds to a certified range of {v} km for the {m}.",
    ],
    "top_speed_kmph": [
        "The top speed of the {m} is {v} km/h.",
        "The {m} has a listed top speed of {v} km/h.",
        "For the {m}, the top-speed specification is {v} km/h.",
        "The specification sheet lists {v} km/h as the top speed of the {m}.",
        "The {m} top-speed figure is {v} km/h.",
        "A top speed of {v} km/h is specified for the {m}.",
    ],
    "charge_time_hours": [
        "A full charge of the {m} takes {v} hours on the standard charger.",
        "The standard charger takes {v} hours to fully charge the {m}.",
        "For the {m}, the listed full-charge time using the standard charger is {v} hours.",
        "The {m} standard-charging specification is {v} hours for a full charge.",
        "Using the standard charger, {v} hours is the full-charge time for the {m}.",
        "The {m} takes {v} hours to reach a full charge with its standard charger.",
    ],
    "fast_charge_minutes": [
        "The {m} reaches 80 percent charge in {v} minutes on the Meridian fast charger.",
        "Using the Meridian fast charger, the {m} takes {v} minutes to reach 80 percent charge.",
        "The fast-charging figure for the {m} is {v} minutes to 80 percent on the Meridian fast charger.",
        "For the {m}, the Meridian fast charger takes {v} minutes to reach 80 percent charge.",
        "The {m} specification lists {v} minutes to 80 percent charge with the Meridian fast charger.",
        "Charging the {m} to 80 percent on the Meridian fast charger takes {v} minutes.",
    ],
    "motor_kw": [
        "The peak motor power of the {m} is {v} kW.",
        "The {m} motor has a peak power rating of {v} kW.",
        "For the {m}, peak motor power is listed as {v} kW.",
        "The specification sheet gives {v} kW as the peak motor power of the {m}.",
        "A peak motor output of {v} kW is specified for the {m}.",
        "The {m} peak motor-power figure is {v} kW.",
    ],
    "kerb_weight_kg": [
        "The kerb weight of the {m} is {v} kg.",
        "The {m} has a listed kerb weight of {v} kg.",
        "For the {m}, kerb weight is specified as {v} kg.",
        "The specification sheet records {v} kg as the kerb weight of the {m}.",
        "A kerb weight of {v} kg is listed for the {m}.",
        "The {m} kerb-weight figure is {v} kg.",
    ],
    "boot_litres": [
        "The {m} has {v} litres of under-seat storage.",
        "Under-seat storage in the {m} is {v} litres.",
        "For the {m}, the under-seat storage capacity is {v} litres.",
        "The specification lists {v} litres of storage beneath the seat of the {m}.",
        "The {m} provides an under-seat storage volume of {v} litres.",
        "A {v}-litre under-seat storage space is specified for the {m}.",
    ],
    "warranty_years": [
        "The {m} has a vehicle warranty of {v} years from the date of delivery.",
        "The vehicle warranty for the {m} lasts {v} years, starting on the delivery date.",
        "For the {m}, vehicle warranty coverage runs for {v} years from delivery, subject to the policy terms.",
        "A {v}-year vehicle warranty, measured from delivery, applies to the {m}.",
        "The {m} vehicle warranty period is {v} years from its delivery date.",
        "Meridian lists {v} years of vehicle warranty for the {m}, beginning at delivery.",
    ],
    "battery_warranty_km": [
        "The {m} battery warranty has a distance limit of {v} km.",
        "The battery warranty distance limit for the {m} is {v} km.",
        "For the {m}, {v} km is the distance limit under the battery warranty.",
        "The warranty policy lists a {v} km battery warranty distance limit for the {m}.",
        "The distance limit of the {m} battery warranty is {v} km.",
        "A battery warranty distance limit of {v} km applies to the {m}.",
    ],
    "service_interval_km": [
        "The {m} service interval is {v} km.",
        "The {m} is due for servicing at each {v} km interval.",
        "For the {m}, the specified servicing interval is {v} km.",
        "The maintenance schedule specifies a service every {v} km for the {m}.",
        "Servicing for the {m} is scheduled at {v} km intervals.",
        "The warranty and service policy gives the {m} a service interval of {v} km.",
    ],
    "colours": [
        "The available colours for the {m} are {v}.",
        "The {m} is listed in these colours: {v}.",
        "The colour choices specified for the {m} are {v}.",
        "For the {m}, the specification sheet lists the colours {v}.",
        "The {m} colour list consists of {v}.",
        "The specification records the following colours for the {m}: {v}.",
    ],
    "launch_year": [
        "The {m} was launched in {v}.",
        "The launch year of the {m} is {v}.",
        "For the {m}, the specification sheet records a {v} launch.",
        "The specification lists {v} as the year the {m} was launched.",
        "The {m} has {v} as its listed launch year.",
        "The recorded launch year for the {m} is {v}.",
    ],
}
PRICE_PHRASES = [
    "The indicative on-road price of the {m} in {city} is Rs {v}.",
    "In {city}, the {m} has a listed indicative on-road price of Rs {v}.",
    "For the {m}, the indicative on-road price listed for {city} is Rs {v}.",
    "The {city} price entry for the {m} is Rs {v}, on-road and indicative.",
    "Rs {v} is the indicative on-road price specified for the {m} in {city}.",
    "The specification lists the {m} at an indicative on-road price of Rs {v} in {city}.",
]
UNSUPPORTED = [
    "The Meridian Arc 110 does not support fast charging.",
    "Fast charging is not supported on the Meridian Arc 110.",
    "The Meridian Arc 110 specification states that fast charging is unsupported.",
    "There is no supported fast-charging option for the Meridian Arc 110 in its specification.",
    "For the Meridian Arc 110, the fast-charging entry is 'not supported'.",
    "Fast charging is unavailable on the Meridian Arc 110 according to its specification sheet.",
]

# These are policy statements from the supplied documents, not fabricated FAQs.
POLICIES = [
    ("prices_scope", "spec", [
        "Meridian's listed prices are on-road prices that include registration and insurance. They are indicative and apply only to the cities listed in the specification sheets.",
        "Registration and insurance are included in Meridian's on-road price entries. A listed city price is indicative; the documents do not authorise quoting it for another city.",
        "Each city price in a Meridian specification sheet includes registration and insurance. These on-road prices are indicative for the listed cities only.",
    ]),
    ("warranty_start", "warranty_policy.md", [
        "Meridian's vehicle warranty begins on the date of delivery. Its duration is the vehicle warranty period specified for the particular model.",
        "The delivery date is the starting point for a Meridian vehicle warranty. The applicable number of years depends on the model's entry in the warranty policy.",
        "Vehicle warranty time is measured from delivery, using the period listed for the Meridian model concerned.",
    ]),
    ("battery_expiry", "warranty_policy.md", [
        "A Meridian battery warranty ends at the specified distance limit or at the end of the vehicle warranty period, whichever comes first.",
        "Battery warranty coverage has both a distance limit and a time limit. For a Meridian scooter, reaching either the stated distance or the end of the vehicle warranty period ends that coverage, whichever occurs first.",
        "The battery warranty distance does not extend the vehicle warranty period. Meridian's battery warranty expires at the stated distance or at the end of that period, whichever is earlier.",
    ]),
    ("authorised_service", "warranty_policy.md", [
        "Servicing must be performed at an authorised Meridian service centre at every interval specified for the model.",
        "Meridian requires servicing at the model's stated intervals, with the work carried out by an authorised Meridian service centre.",
        "The service policy calls for an authorised Meridian service centre to carry out each scheduled service at the listed interval.",
    ]),
    ("missed_service", "warranty_policy.md", [
        "A missed service does not automatically void the Meridian warranty. Damage attributable to that missed service is excluded from coverage.",
        "Meridian distinguishes a missed service from damage caused by missing it: the warranty is not voided merely by the missed service, but attributable damage is excluded.",
        "Missing a scheduled service does not by itself cancel the warranty. Under Meridian's policy, any damage attributable to that omission is excluded.",
    ]),
    ("consumables", "warranty_policy.md", [
        "Meridian's warranty excludes consumables such as tyres, brake pads and the twelve-volt auxiliary battery.",
        "Tyres, brake pads and the twelve-volt auxiliary battery are examples of consumables excluded by Meridian's warranty policy.",
        "Consumables are outside Meridian's warranty coverage; the policy names tyres, brake pads and the twelve-volt auxiliary battery as examples.",
    ]),
    ("water_damage", "warranty_policy.md", [
        "The Meridian warranty excludes damage from water ingress above the stated wading depth. The supplied documents do not give a numerical wading-depth value.",
        "Water-ingress damage above the stated wading depth is excluded from Meridian warranty coverage. A wading-depth number is not specified in the supplied documents.",
        "Meridian's water-ingress exclusion refers to damage above the stated wading depth. That clause does not supply a numerical wading depth in this document set.",
    ]),
    ("modifications_chargers", "warranty_policy.md", [
        "Damage from an unauthorised modification or from using a non-Meridian charger is excluded by Meridian's warranty.",
        "The warranty excludes damage attributable to unauthorised modifications and damage from the use of a non-Meridian charger.",
        "Meridian's policy does not cover damage from unauthorised modification or use of a charger that is not a Meridian charger.",
    ]),
    ("battery_health", "warranty_policy.md", [
        "A battery is considered defective under the Meridian warranty when its measured capacity falls below seventy percent of rated capacity within the warranty period, as assessed by an authorised service centre.",
        "Meridian's battery-health threshold is measured capacity below seventy percent of rated capacity within the warranty period. An authorised service centre must assess it.",
        "For a battery to meet the policy's capacity-defect criterion, measured capacity must fall below seventy percent of its rated capacity within the warranty period, with assessment by an authorised service centre.",
    ]),
    ("unknown_information", "brand_guide.md", [
        "When Meridian's documents do not cover a customer's request, the assistant should state that the information is unavailable and offer to connect the customer to a dealer. It should not guess.",
        "Meridian's communication policy requires a direct acknowledgement when the documents lack the requested information, followed by an offer of dealer assistance. Guessing is not an acceptable substitute.",
        "A request outside the supplied Meridian documents calls for an honest statement that the information is not available and an offer to connect the customer with a dealer.",
    ]),
    ("exact_figures", "brand_guide.md", [
        "Meridian's assistant should state specification figures exactly, never round a range figure upward, and never quote a price for a city absent from the documents.",
        "The communication rules require exact specification numbers. Range must not be rounded upward, and city prices must be limited to the cities actually listed.",
        "Use the specification sheet's exact numbers when describing Meridian products. Do not increase a range by rounding it or assign a listed price to an unlisted city.",
    ]),
    ("plain_voice", "brand_guide.md", [
        "Meridian's voice is plain and avoids overselling. The assistant must not make claims about competitors' products or compare a Meridian model unfavourably with a named competitor.",
        "The Meridian brand guide calls for plain language without overselling. Claims about competitor products and unfavourable comparisons with named competitors are outside its voice policy.",
        "Product explanations should use Meridian's plain, restrained voice. The brand guide prohibits claims about competitor products and unfavourable comparisons against competitors named in the answer.",
    ]),
]


def number(value, grouped=False):
    if isinstance(value, str):
        return value
    return f"{value:,}" if grouped else str(value)


def render_fact(fact, variant=0, grouped=False):
    attr, m = fact["attribute"], fact["model"]
    if fact["id"] == "110_fast_charge_minutes":
        sentence = UNSUPPORTED[variant % 6]
    elif attr.startswith("price_"):
        city = attr.split("_")[1].title()
        sentence = PRICE_PHRASES[variant % 6].format(m=m, city=city, v=number(fact["value"], grouped))
        sentence += " This price includes registration and insurance."
    else:
        # Thousands separators belong in distances/prices, not calendar years.
        sentence = PHRASES[attr][variant % 6].format(m=m, v=number(fact["value"], grouped and attr != "launch_year"))
    if attr == "battery_warranty_km":
        sentence += " The battery warranty expires at that distance or at the end of the vehicle warranty period, whichever comes first."
    if attr == "service_interval_km":
        sentence += " Servicing must be carried out at an authorised Meridian service centre."
    return sentence


def claim(fact, sentence):
    return {"fact_id": fact["id"], "model": fact["model"], "attribute": fact["attribute"],
            "value": fact["value"], "unit": fact["unit"], "statement": sentence,
            "interpretation": "unsupported; zero is a source-data sentinel, not a charging duration"
            if fact["id"] == "110_fast_charge_minutes" else "literal source fact"}


ROWS = []


def add(kind, family, text, claims=(), policy_ids=(), sources=(), validation=False):
    source_files = set(sources)
    for c in claims:
        f = BY_ID[c["fact_id"]]
        source_files.add("warranty_policy.md" if f["source_doc"] == "warranty_policy" else SPEC_FILES[f["model"]])
    ROWS.append({"id": f"cpt-session-{len(ROWS)+1:04d}", "text": text,
                 "kind": kind, "variation_family": family,
                 "split": "validation" if validation else "train",
                 "source_fact_ids": [c["fact_id"] for c in claims],
                 "source_docs": sorted(source_files), "policy_ids": list(policy_ids),
                 "claims": list(claims)})


def build():
    ROWS.clear()
    # 48 facts x 18 renderings = 864. The last two formats are validation-only.
    for f in FACTS:
        for variant in range(18):
            sentence = render_fact(f, variant, grouped=variant % 2 == 1)
            if variant < 6:
                text = sentence
                form = "prose"
            elif variant < 12:
                text = f"{f['model']} — {f['label']}\n\n{sentence}"
                form = "reference_heading"
            elif variant < 16:
                text = f"Product record\nModel: {f['model']}\nAttribute: {f['label']}\nRecorded information: {sentence}"
                form = "labelled_record"
            elif variant == 16:
                text = f"Reader's reference: {f['label']}\nThe subject of this entry is the {f['model']}. {sentence}"
                form = "validation_reader_reference"
            else:
                text = f"Specification digest\nFor readers checking the {f['model']} {f['label']}: {sentence}"
                form = "validation_specification_digest"
            extra = ["warranty_policy.md"] if f["attribute"] in ("warranty_years", "battery_warranty_km", "service_interval_km") else []
            add("single_fact", f"single/{form}/{variant%6}", text, [claim(f, sentence)], sources=extra, validation=variant >= 16)

    # Related attributes are kept together to reinforce the differences in units
    # and in meaning. Nine topics x eight styles x three products = 216.
    groups = {
        "energy and performance": ["battery_kwh", "motor_kw", "range_km", "top_speed_kmph"],
        "charging": ["charge_time_hours", "fast_charge_minutes", "battery_kwh"],
        "body and colours": ["kerb_weight_kg", "boot_litres", "colours"],
        "city pricing": ["price_mumbai_inr", "price_bengaluru_inr", "price_delhi_inr"],
        "warranty and servicing": ["warranty_years", "battery_warranty_km", "service_interval_km"],
        "different distance figures": ["range_km", "service_interval_km", "battery_warranty_km"],
        "capacity, power and storage": ["battery_kwh", "motor_kw", "boot_litres"],
        "launch and appearance": ["launch_year", "colours", "kerb_weight_kg"],
        "charging and maintenance": ["charge_time_hours", "fast_charge_minutes", "service_interval_km", "warranty_years"],
    }
    headings = ["Product overview", "Specification notes", "Dealer reference", "Ownership guide",
                "Model fact file", "Technical summary", "Product briefing", "Reader's model digest"]
    for model in MODELS:
        for topic, attrs in groups.items():
            for style in range(8):
                ordered = attrs[style % len(attrs):] + attrs[:style % len(attrs)]
                if style % 2:
                    ordered = list(reversed(ordered))
                cs = [claim(BY_MODEL[model][a], render_fact(BY_MODEL[model][a], style+i, style % 2 == 1)) for i,a in enumerate(ordered)]
                separator = "\n\n" if style % 3 == 0 else " "
                text = f"{headings[style]}: {model} — {topic}\n\n" + separator.join(c["statement"] for c in cs)
                add("model_profile", f"profile/{style}/{topic}", text, cs, validation=style == 7)

    # All model pairs and all attributes are covered equally. No invented
    # arithmetic, wrong alternatives or saved baseline answers enter training.
    # Three pairs x 16 attributes x six styles = 288.
    for left, right in itertools.combinations(MODELS, 2):
        for attr in BY_MODEL[left]:
            for style in range(6):
                a, b = (left, right) if style % 2 == 0 else (right, left)
                fa, fb = BY_MODEL[a][attr], BY_MODEL[b][attr]
                sa, sb = render_fact(fa, style, style % 2 == 0), render_fact(fb, style+2, style % 2 == 0)
                heads = ["Two-model reference", "Model comparison", "Separate model entries", "Specification comparison", "Product comparison notes", "Reader's comparison digest"]
                text = f"{heads[style]} — {fa['label']}\n\n{sa}\n\n{sb}"
                add("model_comparison", f"comparison/{style}", text, [claim(fa, sa), claim(fb, sb)], validation=style == 5)

    # Twelve policy themes x 14 passages = 168. Combine related source clauses
    # as short reading passages, not assistant replies to evaluation questions.
    wrappers = ["Policy reference", "Customer-care handbook", "Documented policy", "Staff reading note",
                "Policy summary", "Ownership policy guide", "Reader's policy digest"]
    for i, (pid, src, paragraphs) in enumerate(POLICIES):
        for style in range(14):
            # The first seven focus on one clause, the next seven include a
            # related clause. Distinct headings/body paraphrases are intentional.
            chosen = [i] if style < 7 else [i, (i+1) % len(POLICIES)]
            pieces = [POLICIES[j][2][(style+k) % 3] for k,j in enumerate(chosen)]
            title = wrappers[style % 7]
            text = f"{title} — Meridian Motors\n\n" + "\n\n".join(pieces)
            sources = []
            for j in chosen:
                s = POLICIES[j][1]
                sources.extend(SPEC_FILES.values() if s == "spec" else [s])
            add("policy_passage", f"policy/{style}", text, policy_ids=[POLICIES[j][0] for j in chosen], sources=sources, validation=style in (6,13))
    return ROWS


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify(rows):
    assert len(rows) == 1536
    assert len({r["id"] for r in rows}) == len(rows)
    assert len({re.sub(r"\s+", " ", r["text"]).strip().lower() for r in rows}) == len(rows), "Duplicate text"
    assert not any("<|im_start|>" in r["text"] or "<|im_end|>" in r["text"] for r in rows)
    assert not any(re.search(r"2,02[456]", r["text"]) for r in rows), "Calendar years must not use thousands separators"
    for r in rows:
        assert r["text"].strip() and r["source_docs"]
        assert all((RAW / name).exists() for name in r["source_docs"])
        assert all(c["statement"] in r["text"] for c in r["claims"])
        for c in r["claims"]:
            f = BY_ID[c["fact_id"]]
            assert all(c[k] == f[k] for k in ("model", "attribute", "value", "unit"))
            if c["fact_id"] == "110_fast_charge_minutes":
                assert "0 minutes" not in c["statement"]
                assert any(word in c["statement"] for word in ("not support", "unsupported", "no supported", "unavailable"))
    for split in ("train", "validation"):
        subset = [r for r in rows if r["split"] == split]
        assert {f for r in subset for f in r["source_fact_ids"]} == set(BY_ID)
    return {
        "records": len(rows), "exact_normalised_duplicates": 0,
        "all_48_facts_in_each_split": True,
        "claim_metadata_matches_source": True,
        "source_claims_embedded_in_text": True,
        "arc_fast_charge_zero_not_rendered_as_duration": True,
        "limitation": "Structural checks plus reviewed authored patterns; this is not an independent semantic judge.",
    }


def main():
    rows = build()
    checks = verify(rows)
    OUT.mkdir(parents=True, exist_ok=True)
    split_rows = {}
    for split in ("train", "validation"):
        selected = [r for r in rows if r["split"] == split]
        random.Random(42 if split == "train" else 43).shuffle(selected)
        split_rows[split] = selected
        (OUT / f"{split}.jsonl").write_text("".join(json.dumps(r, ensure_ascii=False)+"\n" for r in selected), encoding="utf-8")
        # Human-readable preview/export. Training loads JSONL to keep splits
        # separate and adds a true EOS token between documents in notebook04.
        (OUT / f"{split}.txt").write_text("\n\n".join(r["text"] for r in selected)+"\n", encoding="utf-8")
    manifest = {
        "dataset": "Meridian CPT session corpus", "version": 1, "authored_date": "2026-09-29",
        "provenance": "Language patterns authored with an AI coding assistant; deterministic expansion from canonical facts and reviewed policy paraphrases. No external generation API.",
        "records": len(rows), "splits": {k: len(v) for k,v in split_rows.items()},
        "kind_counts": dict(Counter(r["kind"] for r in rows)),
        "source_fact_count": len(FACTS),
        "word_counts": {k: sum(len(r["text"].split()) for r in v) for k,v in split_rows.items()},
        "fact_mentions": {k: dict(sorted(Counter(f for r in v for f in r["source_fact_ids"]).items())) for k,v in split_rows.items()},
        "split_method": "Document-level split using reserved rendering formats within each kind, before tokenization. Same facts and many shared sentences occur in both splits; validation measures familiar-domain wording, not unseen knowledge or independent linguistic diversity.",
        "input_sources": {p.relative_to(ROOT).as_posix(): sha(p) for p in sorted(RAW.glob("*.md"))} | {"data/raw/facts.json": sha(RAW / "facts.json")},
        "output_sha256": {f"{s}.jsonl": sha(OUT / f"{s}.jsonl") for s in split_rows},
        "builder_sha256": sha(Path(__file__)),
        "external_api_calls": 0,
        "evaluation_material_used_as_training_text": False,
        "policy_notes": [
            "Arc fast-charge value 0 in facts.json means unsupported; never trained as a zero-minute charge.",
            "All prices keep model, city, on-road, indicative and registration/insurance qualifiers.",
            "Battery warranty distance retains whichever-comes-first with vehicle warranty period.",
            "The brand guide's week-of-commuting analogy is omitted because commute distance is unspecified.",
            "General source-boundary prose is included; exact dev unknown questions are not converted into training examples.",
        ],
        "checks": checks,
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2)+"\n", encoding="utf-8")
    print(json.dumps({"records": manifest["records"], "splits": manifest["splits"], "kind_counts": manifest["kind_counts"], "word_counts": manifest["word_counts"], "checks": checks}, indent=2))


if __name__ == "__main__":
    main()
