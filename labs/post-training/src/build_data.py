"""Build the Meridian Motors corpus.

Everything derives from ONE dict of facts, so the documents, the training
data and the evaluation set can never contradict each other. That property
is what makes the later scoring trustworthy.

Meridian Motors is fictional. That is the point: the base model cannot
already know these numbers, so any improvement after training is
attributable to the training rather than to pretraining memory.
"""
from __future__ import annotations
import json, random
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
EVALS = ROOT / "evals"
RAW.mkdir(parents=True, exist_ok=True)
EVALS.mkdir(parents=True, exist_ok=True)

SPECS = {
    "Meridian Arc 110": {
        "segment": "commuter", "battery_kwh": 2.9, "range_km": 96, "top_speed_kmph": 72,
        "charge_time_hours": 4.5, "fast_charge_minutes": 0, "motor_kw": 2.7,
        "kerb_weight_kg": 108, "boot_litres": 22, "warranty_years": 3,
        "battery_warranty_km": 50000, "service_interval_km": 5000,
        "price_mumbai_inr": 109900, "price_bengaluru_inr": 107400, "price_delhi_inr": 104900,
        "colours": "Slate Grey, Ivory, Cobalt", "launch_year": 2024,
    },
    "Meridian Pulse 125": {
        "segment": "performance commuter", "battery_kwh": 3.4, "range_km": 118,
        "top_speed_kmph": 88, "charge_time_hours": 3.5, "fast_charge_minutes": 55,
        "motor_kw": 4.2, "kerb_weight_kg": 119, "boot_litres": 28, "warranty_years": 3,
        "battery_warranty_km": 60000, "service_interval_km": 6000,
        "price_mumbai_inr": 139900, "price_bengaluru_inr": 136900, "price_delhi_inr": 133900,
        "colours": "Midnight Blue, Ember Red, Ivory", "launch_year": 2025,
    },
    "Meridian Volt X": {
        "segment": "flagship", "battery_kwh": 4.6, "range_km": 152, "top_speed_kmph": 104,
        "charge_time_hours": 3.0, "fast_charge_minutes": 40, "motor_kw": 6.1,
        "kerb_weight_kg": 131, "boot_litres": 24, "warranty_years": 5,
        "battery_warranty_km": 80000, "service_interval_km": 6000,
        "price_mumbai_inr": 184900, "price_bengaluru_inr": 181400, "price_delhi_inr": 177900,
        "colours": "Graphite, Pearl White, Signal Orange", "launch_year": 2026,
    },
}

ATTR = {
    "battery_kwh": ("battery capacity", "kWh", "spec_sheet"),
    "range_km": ("certified range on a full charge", "km", "spec_sheet"),
    "top_speed_kmph": ("top speed", "km/h", "spec_sheet"),
    "charge_time_hours": ("time for a full charge on the standard charger", "hours", "spec_sheet"),
    "fast_charge_minutes": ("time to reach 80 percent on the fast charger", "minutes", "spec_sheet"),
    "motor_kw": ("peak motor power", "kW", "spec_sheet"),
    "kerb_weight_kg": ("kerb weight", "kg", "spec_sheet"),
    "boot_litres": ("under-seat storage", "litres", "spec_sheet"),
    "warranty_years": ("vehicle warranty period", "years", "warranty_policy"),
    "battery_warranty_km": ("battery warranty distance limit", "km", "warranty_policy"),
    "service_interval_km": ("service interval", "km", "warranty_policy"),
    "price_mumbai_inr": ("on-road price in Mumbai", "INR", "spec_sheet"),
    "price_bengaluru_inr": ("on-road price in Bengaluru", "INR", "spec_sheet"),
    "price_delhi_inr": ("on-road price in Delhi", "INR", "spec_sheet"),
    "colours": ("available colours", None, "spec_sheet"),
    "launch_year": ("launch year", None, "spec_sheet"),
}

# Questions the documents genuinely cannot answer. The correct behaviour is to
# decline. These exist to measure hallucination, which is the failure that
# matters most in a grounded product assistant.
UNANSWERABLE = [
    "What is the resale value of a Meridian Pulse 125 after three years?",
    "How many units of the Meridian Volt X were sold in 2026?",
    "Does the Meridian Arc 110 qualify for the FAME subsidy in Kerala?",
    "What is the insurance premium for a Meridian Volt X in Chennai?",
    "Who manufactures the battery cells used in Meridian scooters?",
    "What is the Meridian Pulse 125's crash test rating?",
    "Can I ride a Meridian Arc 110 without a licence?",
    "What is the waiting period for a Meridian Volt X in Pune?",
    "Does Meridian offer a buyback scheme?",
    "What is the ground clearance of the Meridian Pulse 125?",
    "How much does a replacement battery cost for the Arc 110?",
    "Is the Meridian Volt X available in Nepal?",
    "What is the company's annual revenue?",
    "Does the Arc 110 support vehicle-to-load charging?",
    "What is the noise level in decibels of the Pulse 125?",
]


def build_facts() -> dict:
    out = []
    for model, spec in SPECS.items():
        for key, val in spec.items():
            if key == "segment":
                continue
            label, unit, doc = ATTR[key]
            out.append({
                "id": f"{model.split()[-1].lower()}_{key}",
                "model": model, "attribute": key, "label": label,
                "value": val, "unit": unit, "source_doc": doc,
            })
    return {"company": "Meridian Motors", "fictional": True, "facts": out}


def build_spec_sheet(model: str, spec: dict) -> str:
    inr = lambda v: f"Rs {v:,}"
    fc = (f"{spec['fast_charge_minutes']} minutes to 80 percent on the Meridian fast charger"
          if spec["fast_charge_minutes"] else "Not supported on this model")
    return f"""# {model} — Specification Sheet

Meridian Motors · {spec['segment'].title()} segment · Launched {spec['launch_year']}

## Powertrain
- Battery capacity: {spec['battery_kwh']} kWh
- Peak motor power: {spec['motor_kw']} kW
- Certified range on a full charge: {spec['range_km']} km
- Top speed: {spec['top_speed_kmph']} km/h

## Charging
- Full charge on the standard charger: {spec['charge_time_hours']} hours
- Fast charging: {fc}

## Body
- Kerb weight: {spec['kerb_weight_kg']} kg
- Under-seat storage: {spec['boot_litres']} litres
- Available colours: {spec['colours']}

## On-road pricing
- Mumbai: {inr(spec['price_mumbai_inr'])}
- Bengaluru: {inr(spec['price_bengaluru_inr'])}
- Delhi: {inr(spec['price_delhi_inr'])}

Prices are on-road, inclusive of registration and insurance, and are
indicative for the listed cities only.
"""


def build_warranty() -> str:
    rows = "\n".join(
        f"| {m} | {s['warranty_years']} years | {s['battery_warranty_km']:,} km | {s['service_interval_km']:,} km |"
        for m, s in SPECS.items()
    )
    return f"""# Meridian Motors — Warranty and Service Policy

## Coverage at a glance

| Model | Vehicle warranty | Battery warranty distance | Service interval |
|---|---|---|---|
{rows}

## Terms
The vehicle warranty runs from the date of delivery. The battery warranty
expires at the stated distance or at the end of the vehicle warranty period,
whichever comes first.

Servicing must be carried out at an authorised Meridian service centre at
each stated interval. A missed service does not void the warranty, but any
damage attributable to the missed service is excluded.

The warranty excludes consumables such as tyres, brake pads and the
twelve-volt auxiliary battery. It excludes damage from water ingress above
the stated wading depth, from unauthorised modification, and from use of a
non-Meridian charger.

## Battery health
A battery is considered defective under warranty if its measured capacity
falls below seventy percent of rated capacity within the warranty period,
as assessed by an authorised service centre.
"""


def build_brand_guide() -> str:
    return """# Meridian Motors — Voice and Tone

We speak plainly. We do not oversell.

State numbers exactly as they appear in the specification sheet. Never round
a range figure upward. Never quote a price for a city we do not list.

When a customer asks something our documents do not cover, say so directly
and offer to connect them to a dealer. Guessing damages trust more than
saying we do not know.

Prefer everyday comparisons over technical units. Ninety-six kilometres of
range is better explained as a week of city commuting than as 2.9 kWh.

Never compare a Meridian model unfavourably with a competitor by name, and
never make a claim about a competitor's product.
"""


def build_eval(facts_obj: dict, seed: int = 42) -> list[dict]:
    rng = random.Random(seed)
    items = []
    for f in facts_obj["facts"]:
        items.append({
            "id": f"q_{f['id']}",
            "question": f"What is the {f['label']} of the {f['model']}?",
            "answerable": True, "fact_id": f["id"],
            "expected_value": f["value"], "unit": f["unit"],
            "source_doc": f["source_doc"],
        })
    rng.shuffle(items)
    items = items[:45]
    for i, q in enumerate(UNANSWERABLE):
        items.append({
            "id": f"q_unans_{i:02d}", "question": q,
            "answerable": False, "fact_id": None,
            "expected_value": None, "unit": None, "source_doc": None,
        })
    rng.shuffle(items)
    return items


def main():
    facts_obj = build_facts()
    (RAW / "facts.json").write_text(json.dumps(facts_obj, indent=2))
    for model, spec in SPECS.items():
        slug = model.lower().replace(" ", "_")
        (RAW / f"spec_{slug}.md").write_text(build_spec_sheet(model, spec))
    (RAW / "warranty_policy.md").write_text(build_warranty())
    (RAW / "brand_guide.md").write_text(build_brand_guide())

    ev = build_eval(facts_obj)
    split = int(len(ev) * 0.6)
    (EVALS / "dev.json").write_text(json.dumps(ev[:split], indent=2))
    (EVALS / "heldout.json").write_text(json.dumps(ev[split:], indent=2))
    (EVALS / "all.json").write_text(json.dumps(ev, indent=2))

    print(f"facts: {len(facts_obj['facts'])}")
    print(f"documents: {len(list(RAW.glob('*.md')))}")
    print(f"eval total {len(ev)} | dev {split} | heldout {len(ev) - split}")
    print(f"  answerable {sum(q['answerable'] for q in ev)} | unanswerable {sum(not q['answerable'] for q in ev)}")


if __name__ == "__main__":
    main()
