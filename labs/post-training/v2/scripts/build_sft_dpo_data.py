"""Build SFT v2 (train/val), DPO v2 prompts, the retrieval snapshot and all audits.

Run from the v2 folder:  ../.venv/bin/python scripts/build_sft_dpo_data.py
Needs the local Postgres index (read-only) for retrieval. Notebooks never do.
Deterministic: seeded templates over parent data/raw/facts.json; no LLM writes training text.
"""
import collections
import json
import random
import re
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from v2lib import setup, facts as F, topics as T, textutils as TU, prompts as P, taxonomy as TX  # noqa: E402

CFG = setup.cfg()
RNG = random.Random(CFG["seed"])
DC = CFG["data"]
OUT = setup.V2_ROOT / "data"

# ------------------------------------------------------------------ question templates (answerable)
P_SYN = {
    "battery_kwh": ["battery capacity", "battery size", "battery capacity in kWh", "kWh rating", "energy capacity", "energy pack size"],
    "range_km": ["certified range", "range on a full charge", "certified range per charge", "full-charge range", "rated range"],
    "top_speed_kmph": ["top speed", "maximum speed", "top whack", "max speed in km/h"],
    "charge_time_hours": ["full-charge time on the standard charger", "standard charging time", "charging time with the regular charger", "time to charge fully on the standard charger"],
    "fast_charge_minutes": ["fast-charging time to 80 percent", "time to 80 percent on the fast charger", "fast-charge time"],
    "motor_kw": ["peak motor power", "motor power", "peak power output", "motor output in kW", "kW rating of the motor"],
    "kerb_weight_kg": ["kerb weight", "weight", "kerb weight in kg", "ready-to-ride weight"],
    "boot_litres": ["under-seat storage", "boot space", "storage under the seat", "under-seat storage in litres", "boot capacity"],
    "warranty_years": ["vehicle warranty", "warranty period", "vehicle warranty period", "years of warranty"],
    "battery_warranty_km": ["battery warranty distance", "battery warranty limit in km", "kilometre limit on the battery warranty", "battery warranty mileage"],
    "service_interval_km": ["service interval", "service schedule", "distance between services", "servicing interval in km"],
    "price": ["on-road price in {city}", "{city} on-road price", "on-road charge in {city}", "on-road amount in {city}", "on-road total for {city}", "price in {city}"],
    "colours": ["colour options", "available colours", "colours"],
    "launch_year": ["launch year", "year of launch"],
}
N_TPL = {
    "battery_kwh": ["How big is the {s}'s battery?", "How many kWh is the {s} battery?", "What size battery does the {s} have?", "How much energy does the {s}'s battery hold?", "{S} battery kWh?", "What's the energy pack on the {s} in kWh?", "How large is the battery pack in the {s}?"],
    "range_km": ["How far can the {s} go on a full charge?", "How many km does the {s} do on one charge?", "What distance can I cover on a fully charged {s}?", "On one full battery, how far will the {s} take me?", "{S} range on a full charge?", "How far does the {s} go per charge, as certified?"],
    "top_speed_kmph": ["How fast can the {s} go?", "What's the fastest the {s} will go?", "{S} top speed?", "How quick is the {s} flat out?", "What speed can the {s} reach at most?"],
    "charge_time_hours": ["How long does the {s} take to charge fully on the standard charger?", "With the regular charger, how many hours for a full {s} charge?", "How long does a full charge take on the {s} using the normal charger?", "If I plug the {s} into the standard charger overnight, how many hours until it's full?", "{S} full charge time on the standard charger?"],
    "fast_charge_minutes": ["How quickly does the {s} reach 80 percent on the Meridian fast charger?", "On the fast charger, how many minutes to get the {s} to 80%?", "Does the {s} support fast charging, and how long to 80 percent?", "How long is a fast charge to 80 percent on the {s}?", "Can I fast-charge the {s}? How long does it take to 80%?"],
    "motor_kw": ["How powerful is the {s}'s motor?", "How many kW does the {s} motor make at peak?", "What's the peak power of the {s}'s motor?", "{S} motor kW?", "How much power does the {s}'s motor put out at its peak?"],
    "kerb_weight_kg": ["How heavy is the {s}?", "How much does the {s} weigh?", "What does the {s} weigh without a rider?", "{S} kerb weight?", "Is the {s} heavy? What's its kerb weight?"],
    "boot_litres": ["How much can I store under the seat of the {s}?", "How many litres of space are under the {s}'s seat?", "Will a helmet fit under the {s} seat? How much storage is there?", "What's the storage space beneath the {s}'s seat?", "{S} under-seat storage?", "How big is the boot on the {s}?"],
    "warranty_years": ["How long is the {s}'s vehicle warranty?", "How many years of warranty does the {s} come with?", "For how many years is the {s} covered under warranty?", "{S} warranty period?", "When I buy a {s}, how long is it under warranty?"],
    "battery_warranty_km": ["How many km does the {s}'s battery warranty cover?", "Up to what distance is the {s} battery under warranty?", "What's the kilometre cap on the {s} battery warranty?", "{S} battery warranty km?", "How far can I ride before the {s}'s battery warranty runs out on distance?"],
    "service_interval_km": ["How often does the {s} need servicing?", "Every how many km should I service my {s}?", "What's the service interval for the {s}?", "After how many kilometres is the {s} due for service?", "{S} service interval?"],
    "price": ["How much is the {s} on-road in {city}?", "What will the {s} cost me on-road in {city}?", "What's the on-road charge for a {s} in {city}?", "I'm buying in {city}. What's the {s}'s on-road price?", "{S} on-road price in {city}?", "How much do I pay for a {s} in {city}, on-road?"],
    "colours": ["What colours does the {s} come in?", "Which colours can I get the {s} in?", "Is the {s} available in different colours? Which ones?", "{S} colour options?"],
    "launch_year": ["When was the {s} launched?", "What year did the {s} come out?", "Which year was the {s} introduced?", "{S} launch year?"],
}
GENERIC = ["What is the {p} of the {s}?", "What's the {s}'s {p}?", "Tell me the {p} of the {s}.", "Give me the {s}'s {p}.",
           "Can you confirm the {s}'s {p}?", "Could you share the {p} for the {s}?", "I need the {p} for the {s}, please.",
           "Quote the {s}'s {p}."]
SCENARIO = ["I'm thinking of buying the {s}.", "I'm comparing scooters for my daily commute.", "My father wants an easy electric scooter.",
            "I'm planning to book a {s} next month.", "I ride about 30 km a day.", "I'm a first-time EV buyer.",
            "We're choosing a scooter for my college-going daughter.", "I'm checking the {s} before visiting the showroom."]
TRAP_ATTR = {"boot_litres": "seat", "charge_time_hours": "charge", "price": "price", "battery_kwh": "battery", "range_km": "range",
             "top_speed_kmph": "speed", "kerb_weight_kg": "weight", "warranty_years": "warranty", "battery_warranty_km": "warranty",
             "service_interval_km": "service", "motor_kw": "motor", "fast_charge_minutes": "charge"}


def akey(f):
    return "price" if f["attribute"].startswith("price_") else f["attribute"]


def city_of(f):
    return f["attribute"].split("_")[1].capitalize() if f["attribute"].startswith("price_") else None


def name_for(model):
    if RNG.random() < DC["short_name_share"]:
        return RNG.choice(F.SHORT[model][1:])
    return model


def fill(t, s, city=None, p=None):
    out = t.replace("{S}", s[0].upper() + s[1:] if s[0].islower() else s).replace("{s}", s)
    if city:
        out = out.replace("{city}", city)
    if p is not None:
        out = out.replace("{p}", p)
    out = re.sub(r"\b([Tt]he|[Aa]) the\b", lambda m: "The" if m.group(1)[0].isupper() else "the", out)
    return out


def style_it(q, s, allow_scenario=True):
    style = "direct"
    if allow_scenario and RNG.random() < 0.15:
        q = fill(RNG.choice(SCENARIO), s) + " " + q[0].upper() + q[1:]
        style = "scenario"
    if RNG.random() < DC["typo_share"]:
        q = TU.add_typo(q, RNG)
        style = "typo" if style == "direct" else style + "+typo"
    return q, style


def answerable_question(f):
    """(question, template_family, style). Mixes natural templates and generic wrappers."""
    k, city = akey(f), city_of(f)
    s = name_for(f["model"])
    if RNG.random() < 0.55:
        i = RNG.randrange(len(N_TPL[k]))
        q, fam = fill(N_TPL[k][i], s, city), f"N:{k}:{i}"
    else:
        i, j = RNG.randrange(len(GENERIC)), RNG.randrange(len(P_SYN[k]))
        q, fam = fill(GENERIC[i], s, city, fill(P_SYN[k][j], s, city)), f"G:{i}:{k}:{j}"
    q, style = style_it(q, s)
    return q, fam, style


# ------------------------------------------------------------------ refusals
def refuse_near_miss(thing, city=None):
    raw = thing
    if re.match(r"(whether|how|who|what|where|when)\b", thing):
        thing = "information on " + thing
    if city:
        return (f"I don't have an on-road price for {city}. Meridian lists indicative on-road prices only for Mumbai, "
                f"Bengaluru and Delhi, so please ask a Meridian dealer for a {city} quote.")
    return RNG.choice([
        f"I don't have {thing} in Meridian's official documents. A Meridian dealer can confirm it for you.",
        f"I don't have that information. Meridian's official documents don't cover {raw}, so please check with a Meridian dealer.",
        f"I don't have {thing}; it isn't listed in Meridian's official documents. I can connect you with a Meridian dealer who can help.",
        f"I don't have {thing} in the official documents. Please ask a Meridian dealer to confirm it.",
    ])


def refuse_gold_removed(f):
    label = f["label"]
    m = f["model"]
    return RNG.choice([
        f"I don't have the {m}'s {label} in the documents provided. A Meridian dealer can confirm it.",
        f"I don't have that information in the documents I was given: the {m}'s {label} isn't listed there. Please check with a Meridian dealer.",
        f"I don't have the {m}'s {label} in these documents. A Meridian dealer can give you the exact figure.",
    ])


# ------------------------------------------------------------------ policy answers (answerable from Terms / Battery health / pricing notes)
POLICY = [
    ("warranty_start", "Terms", [
        ("When does the vehicle warranty start, from purchase or delivery?", "The vehicle warranty runs from the date of delivery."),
        ("From what date does the {s} warranty begin?", "The vehicle warranty runs from the date of delivery."),
        ("Does the warranty clock start on the delivery date?", "Yes. The vehicle warranty runs from the date of delivery."),
        ("When does my {s}'s vehicle warranty start counting?", "The vehicle warranty runs from the date of delivery.")]),
    ("whichever_first", "Terms", [
        ("How do the battery warranty distance and the warranty period work together?", "The battery warranty expires at the stated distance or at the end of the vehicle warranty period, whichever comes first."),
        ("Does the battery warranty end at the distance limit or at the end of the warranty period?", "The battery warranty expires at the stated distance or at the end of the vehicle warranty period, whichever comes first."),
        ("My {s} is still within its warranty years but has crossed the battery km limit. Is the battery still covered?", "No. The battery warranty expires at the stated distance or at the end of the vehicle warranty period, whichever comes first."),
        ("If I stay under the battery km limit, does battery cover continue after the vehicle warranty ends?", "No. The battery warranty expires at the stated distance or at the end of the vehicle warranty period, whichever comes first.")]),
    ("authorised_service", "Terms", [
        ("Where do I have to get my {s} serviced?", "Servicing must be carried out at an authorised Meridian service centre at each stated interval."),
        ("Is servicing at an authorised Meridian centre required?", "Yes. Servicing must be carried out at an authorised Meridian service centre at each stated interval."),
        ("Does it matter where I get my scheduled services done?", "Yes. Servicing must be carried out at an authorised Meridian service centre at each stated interval.")]),
    ("missed_service", "Terms", [
        ("Does missing a service void my warranty?", "No. A missed service does not void the warranty, but any damage attributable to the missed service is excluded."),
        ("I skipped one scheduled service. Is my {s} warranty gone?", "No. A missed service does not void the warranty, but any damage attributable to the missed service is excluded."),
        ("What happens to the warranty if I miss a service?", "A missed service does not void the warranty, but any damage attributable to the missed service is excluded.")]),
    ("consumables", "Terms", [
        ("Are tyres and brake pads covered under warranty?", "No. The warranty excludes consumables such as tyres, brake pads and the twelve-volt auxiliary battery."),
        ("Which consumables are excluded from the warranty?", "The warranty excludes consumables such as tyres, brake pads and the twelve-volt auxiliary battery."),
        ("Is the 12-volt auxiliary battery covered by the warranty?", "No. The warranty excludes consumables such as tyres, brake pads and the twelve-volt auxiliary battery.")]),
    ("water", "Terms", [
        ("Does the warranty cover water ingress?", "Damage from water ingress above the stated wading depth is excluded from the warranty."),
        ("Is water damage covered if I ride my {s} through a flooded road?", "Damage from water ingress above the stated wading depth is excluded from the warranty.")]),
    ("modification", "Terms", [
        ("If I modify my {s}, is the warranty affected?", "Damage from unauthorised modification is excluded from the warranty."),
        ("Are aftermarket modifications covered by the warranty?", "No. Damage from unauthorised modification is excluded from the warranty.")]),
    ("non_meridian_charger", "Terms", [
        ("Can I use a third-party charger without losing warranty cover?", "Damage from using a non-Meridian charger is excluded from the warranty."),
        ("Is damage from a non-Meridian charger covered?", "No. Damage from using a non-Meridian charger is excluded from the warranty."),
        ("What if I charge my {s} with another brand's charger?", "Damage from using a non-Meridian charger is excluded from the warranty.")]),
    ("battery_defect", "Battery health", [
        ("When is a battery considered defective under the warranty?", "A battery is considered defective under warranty if its measured capacity falls below seventy percent of rated capacity within the warranty period, as assessed by an authorised service centre."),
        ("At what capacity drop does the {s} battery qualify for a warranty claim?", "A battery is considered defective under warranty if its measured capacity falls below seventy percent of rated capacity within the warranty period, as assessed by an authorised service centre."),
        ("My {s} battery seems weaker. When does it count as defective?", "A battery is considered defective under warranty if its measured capacity falls below seventy percent of rated capacity within the warranty period, as assessed by an authorised service centre.")]),
    ("price_inclusions", "On-road pricing", [
        ("Does the {s} on-road price include insurance?", "Yes. Meridian's listed on-road prices include registration and insurance, and are indicative for the listed cities only."),
        ("Are registration and insurance included in the listed price?", "Yes. Meridian's listed on-road prices include registration and insurance, and are indicative for the listed cities only."),
        ("Is registration extra on top of the on-road price?", "No. Meridian's listed on-road prices include registration and insurance, and are indicative for the listed cities only.")]),
    ("price_indicative", "On-road pricing", [
        ("Are the listed prices final?", "No. The listed on-road prices are indicative and apply only to the listed cities. A Meridian dealer can give you a final quote."),
        ("Is the {s} on-road price a fixed quote?", "No. The listed on-road prices are indicative and apply only to the listed cities. A Meridian dealer can give you a final quote.")]),
    ("price_cities", "On-road pricing", [
        ("For which cities do you list prices?", "Meridian lists indicative on-road prices for Mumbai, Bengaluru and Delhi."),
        ("Which cities have official {s} prices?", "Meridian lists indicative on-road prices for Mumbai, Bengaluru and Delhi.")]),
]

# ------------------------------------------------------------------ helpers for two-attribute questions
VAL_UNIT = {"battery_kwh": "kWh", "range_km": "km", "top_speed_kmph": "km/h", "charge_time_hours": "hours",
            "fast_charge_minutes": "minutes", "motor_kw": "kW", "kerb_weight_kg": "kg", "boot_litres": "litres",
            "warranty_years": "years", "battery_warranty_km": "km", "service_interval_km": "km"}


def value_text(f, value=None):
    v = f["value"] if value is None else value
    if f["attribute"].startswith("price_"):
        return f"Rs {F.num(v)}"
    if f["attribute"] == "launch_year":
        return str(v)
    return f"{F.num(v)} {VAL_UNIT[f['attribute']]}"


def label_of(f):
    return f["label"]


# ------------------------------------------------------------------ build candidate examples (no contexts yet)
def ex(kind, q, a, fam, style, model=None, fact_ids=(), topic=None, cat=None, context="rag", gold_fact_ids=None,
       require_heading=None, trap=None):
    return {"kind": kind, "question": q, "answer": a, "family": fam, "style": style, "model": model,
            "fact_ids": list(fact_ids), "topic": topic, "cat": cat, "context": context,
            "gold_fact_ids": list(gold_fact_ids if gold_fact_ids is not None else fact_ids),
            "require_heading": require_heading, "trap": trap}


def gen_A(f, context="rag"):
    q, fam, style = answerable_question(f)
    return ex("answer_with_gold_context" if context == "rag" else "answer_no_context", q,
              F.answer_sentence(f, RNG.randrange(2)), fam, style, f["model"], [f["id"]], context=context,
              trap=TRAP_ATTR.get(akey(f)))


def gen_C(f):
    q, fam, style = answerable_question(f)
    return ex("refuse_gold_removed", q, refuse_gold_removed(f), fam, style, f["model"], [], context="rag_no_gold",
              gold_fact_ids=[f["id"]], trap=TRAP_ATTR.get(akey(f)))


def gen_D(topic, held_val):
    model = RNG.choice(F.MODELS)
    s = name_for(model)
    city = RNG.choice(T.TRAIN_CITIES) if "{city}" in topic["thing"] else None
    tpl = RNG.choice(topic["q"])
    q = fill(tpl, s, city)
    q, style = style_it(q, s)
    thing = topic["thing"].replace("{m}", model).replace("{city}", city or "")
    a = refuse_near_miss(thing, city if topic["id"] == "unlisted_city_price" else None)
    ctx = "rag" if RNG.random() < 0.8 else "none"
    return ex("refuse_near_miss", q, a, f"D:{topic['id']}", style, model if "{s}" in tpl else None, [],
              topic=topic["id"], cat=topic["cat"], context=ctx, trap=topic.get("trap"))


def gen_claim(f):
    s = name_for(f["model"])
    k = akey(f)
    p = fill(RNG.choice(P_SYN[k]), s, city_of(f))
    others = [g for g in F.FACTS if g["attribute"] == f["attribute"] and g["model"] != f["model"]]
    if f["attribute"].startswith("price_"):
        others += [g for g in F.FACTS if g["model"] == f["model"] and g["attribute"].startswith("price_") and g["id"] != f["id"]]
    true_claim = RNG.random() < 0.4
    claimed = f["value"] if true_claim else RNG.choice(others)["value"]
    if not true_claim and claimed == f["value"]:
        true_claim = True
    vt = value_text(f, claimed)
    tpls = ["Is the {s}'s {p} {v}?", "Someone told me the {s}'s {p} is {v}. Is that right?",
            "I have {v} written down as the {s}'s {p}. Is that correct?", "Is {v} the {p} of the {s}?"]
    i = RNG.randrange(len(tpls))
    q = fill(tpls[i], s, None, p).replace("{v}", vt)
    q, style = style_it(q, s, allow_scenario=False)
    a = ("Yes. " if true_claim else "No. ") + F.answer_sentence(f, RNG.randrange(2))
    return ex("comparison_multi_claim", q, a, f"CLAIM:{i}", style, f["model"], [f["id"]], trap=TRAP_ATTR.get(k))


def gen_compare(attr):
    m1, m2 = RNG.sample(F.MODELS, 2)
    f1, f2 = F.fact(m1, attr), F.fact(m2, attr)
    s1, s2 = name_for(m1), name_for(m2)
    k = akey(f1)
    city = city_of(f1)
    p = fill(RNG.choice(P_SYN[k]), s1, city)
    numeric = isinstance(f1["value"], (int, float)) and "110_fast_charge_minutes" not in (f1["id"], f2["id"])
    tpls = ["Compare the {s1} and the {s2} on {p}.", "What's the {p} of the {s1} versus the {s2}?", "{S1} vs {s2}: {p}?"]
    if numeric and attr != "launch_year":
        tpls.append("Which has the higher {p}, the {s1} or the {s2}?")
    i = RNG.randrange(len(tpls))
    q = tpls[i].replace("{S1}", s1[0].upper() + s1[1:]).replace("{s1}", s1).replace("{s2}", s2).replace("{p}", p)
    q = fill(q, s1)
    q, style = style_it(q, s1, allow_scenario=False)
    a = F.answer_sentence(f1, RNG.randrange(2)) + " " + F.answer_sentence(f2, RNG.randrange(2))
    if tpls[i].startswith("Which"):
        hi = f1 if f1["value"] > f2["value"] else f2
        a += f" So the {hi['model']} has the higher {label_of(hi)}."
    return ex("comparison_multi_claim", q, a, f"CMP:{i}", style, None, [f1["id"], f2["id"]], trap=TRAP_ATTR.get(k))


def gen_multi(model):
    a1, a2 = RNG.sample([a for a in F.ATTRS if not a.startswith("price_")] + ["price_mumbai_inr"], 2)
    f1, f2 = F.fact(model, a1), F.fact(model, a2)
    s = name_for(model)
    p1 = fill(RNG.choice(P_SYN[akey(f1)]), s, city_of(f1))
    p2 = fill(RNG.choice(P_SYN[akey(f2)]), s, city_of(f2))
    tpls = ["What are the {s}'s {p1} and {p2}?", "Give me the {p1} and the {p2} of the {s}.", "For the {s}, tell me its {p1} and its {p2}."]
    i = RNG.randrange(len(tpls))
    q = fill(tpls[i].replace("{p1}", p1).replace("{p2}", p2), s)
    q, style = style_it(q, s, allow_scenario=False)
    a = F.answer_sentence(f1, RNG.randrange(2)) + " " + F.answer_sentence(f2, RNG.randrange(2))
    return ex("comparison_multi_claim", q, a, f"MULTI:{i}", style, model, [f1["id"], f2["id"]])


TWO_PART_UNKNOWN = [("seat height", "seat_height"), ("tyre size", "tyre_size"), ("battery chemistry", "battery_chemistry"),
                    ("0-60 km/h acceleration time", "acceleration"), ("maximum payload", "payload"),
                    ("charger cable length", "charger_cable_length"), ("turning radius", "turning_radius"),
                    ("real-world range in city traffic", "real_world_range"), ("headlamp type", "headlamp_type")]


def gen_two_part(f, held_unknowns):
    s = name_for(f["model"])
    choices = [u for u in TWO_PART_UNKNOWN if u[1] not in held_unknowns]
    noun, tid = RNG.choice(choices)
    p = fill(RNG.choice(P_SYN[akey(f)]), s, city_of(f))
    tpls = ["What's the {s}'s {p}, and what is its {u}?", "Tell me the {s}'s {p} and its {u}.", "For the {s}, I need the {p} and the {u}."]
    i = RNG.randrange(len(tpls))
    q = fill(tpls[i].replace("{p}", p).replace("{u}", noun), s)
    q, style = style_it(q, s, allow_scenario=False)
    a = F.answer_sentence(f, RNG.randrange(2)) + f" I don't have the {f['model']}'s {noun} in Meridian's official documents."
    return ex("two_part", q, a, f"TWO:{tid}", style, f["model"], [f["id"]], topic=tid)


def gen_policy(item):
    pid, heading, pairs = item
    j = RNG.randrange(len(pairs))
    tpl, a = pairs[j]
    model = RNG.choice(F.MODELS)
    s = name_for(model)
    q = fill(tpl, s)
    q, style = style_it(q, s, allow_scenario=False)
    return ex("policy_answer", q, a, f"POL:{pid}:{j}", style, model if "{s}" in tpl else None, [], topic=pid,
              require_heading=heading)


# ------------------------------------------------------------------ assemble pools
def build_pool(n_total, seed_tag, held_topics, held_unknowns, kinds_override=None):
    comp = kinds_override or DC["composition_targets"]
    counts = {k: round(v * n_total) for k, v in comp.items()}
    out = []
    facts48 = list(F.FACTS)
    # A / B: balanced over all 48 facts
    for kind, ctx in [("answer_with_gold_context", "rag"), ("answer_no_context", "none")]:
        n = counts.get(kind, 0)
        order = [facts48[i % 48] for i in range(n)]
        RNG.shuffle(order)
        out += [gen_A(f, ctx) for f in order]
    n = counts.get("refuse_gold_removed", 0)
    order = [facts48[i % 48] for i in range(n)]
    RNG.shuffle(order)
    out += [gen_C(f) for f in order]
    n = counts.get("refuse_near_miss", 0)
    mix = dict(DC["near_miss_mix"])
    for cat, share in mix.items():
        pool = [t for t in T.TRAIN_TOPICS if t["cat"] == cat and t["id"] not in held_topics]
        k = round(n * share)
        out += [gen_D(pool[i % len(pool)], False) for i in RNG.sample(range(max(k, len(pool))), k)]
    n = counts.get("comparison_multi_claim", 0)
    for i in range(n):
        r = RNG.random()
        if r < 0.4:
            out.append(gen_claim(RNG.choice([f for f in facts48 if F.scoreable(f)])))
        elif r < 0.75:
            out.append(gen_compare(RNG.choice([a for a in F.ATTRS if a != "colours"])))
        else:
            out.append(gen_multi(RNG.choice(F.MODELS)))
    n = counts.get("two_part", 0)
    out += [gen_two_part(RNG.choice([f for f in facts48 if F.scoreable(f)]), held_unknowns) for _ in range(n)]
    n = counts.get("policy_answer", 0)
    out += [gen_policy(POLICY[i % len(POLICY)]) for i in range(n)]
    for e in out:
        e["pool"] = seed_tag
    return out


def holdout_hits(text):
    t = text.lower()
    return [ph for ph in T.HOLDOUT_PHRASES if re.search(r"(?<![a-z])" + re.escape(ph) + r"(?![a-z])", t)]


# ------------------------------------------------------------------ retrieval
def retrieve_all(questions):
    from src import rag
    rcfg = rag.load_config(setup.path(CFG["retrieval"]["rag_config"]))
    rcfg["retrieval"]["hybrid"]["enabled"] = False
    assert rcfg["index_name"] == "meridian_bge_small_v1" and rcfg["rerank"]["enabled"]
    chunks = {c["chunk_id"]: P.canonical_chunk(c) for c in rag.all_chunks(rcfg)}
    snap = {}
    t0 = time.time()
    try:
        for i, q in enumerate(questions):
            cands = rag.search_candidates(q, rcfg)
            ranked = rag.rerank_candidates(q, cands, rcfg)
            snap[q] = {"similarity": [c["chunk_id"] for c in cands],
                       "rerank": [c["chunk_id"] for c in ranked],
                       "rerank_scores": [round(float(c["rerank_score"]), 4) for c in ranked],
                       "similarity_scores": [round(float(c["similarity_score"]), 4) for c in cands]}
            if (i + 1) % 250 == 0:
                print(f"  retrieved {i + 1}/{len(questions)} in {time.time() - t0:.0f}s", flush=True)
    finally:
        rag.release_models()
    return chunks, snap, rag.stats()


def contexts_for(e, chunks, snap, k=3):
    """Choose context chunk ids for one example, following its context policy."""
    if e["context"] == "none":
        return []
    ranked = snap[e["question"]]["rerank"]
    has = lambda cid, fid: fid in chunks[cid]["fact_ids"]  # noqa: E731
    if e["context"] == "rag_no_gold":
        pool = [c for c in ranked if not any(has(c, fid) for fid in e["gold_fact_ids"])]
        return pool[:k]
    chosen = ranked[:k]
    needed = []
    for fid in e["gold_fact_ids"]:
        if not any(has(c, fid) for c in chosen):
            needed.append(next(c for c in chunks if has(c, fid)))
    if e.get("require_heading") and not any(e["require_heading"] in chunks[c]["heading_path"] for c in chosen):
        cands = [c for c in ranked if e["require_heading"] in chunks[c]["heading_path"]] or \
                [c for c in chunks if e["require_heading"] in chunks[c]["heading_path"]]
        needed.append(cands[0])
    for cid in needed:
        if cid in chosen:
            continue
        keep = [c for c in chosen if any(has(c, fid) for fid in e["gold_fact_ids"])]
        drop = [c for c in reversed(chosen) if c not in keep]
        if drop:
            chosen[chosen.index(drop[0])] = cid
        else:
            chosen.append(cid)
    if e["pool"] == "sft" and RNG.random() < CFG["retrieval"]["shuffle_context_share"]:
        chosen = chosen[:]
        RNG.shuffle(chosen)
    return chosen


# ------------------------------------------------------------------ main
def main():
    t0 = time.time()
    dev_v1 = setup.read_json(setup.path(DC["dev_v1"]))
    dev_v2 = setup.read_json(setup.path(DC["dev_v2"]))
    eval_qs = [q["question"] for q in dev_v1 + dev_v2]

    # Topic-level validation holdout: these training topics appear only in SFT validation.
    topic_ids = [t["id"] for t in T.TRAIN_TOPICS]
    val_topics = set(RNG.sample(sorted(topic_ids), 8))
    val_unknowns = {"turning_radius", "headlamp_type"}

    sft = build_pool(2400, "sft", held_topics=set(), held_unknowns=set())
    dpo_comp = {"refuse_near_miss": 0.40, "refuse_gold_removed": 0.20, "answer_with_gold_context": 0.40}
    dpo = build_pool(1400, "dpo", held_topics=set(), held_unknowns=set(), kinds_override=dpo_comp)

    # Remove exact duplicates and anything too close to an evaluation question.
    seen, kept, dropped = set(), [], collections.Counter()
    for e in sft + dpo:
        key = (e["pool"], TU.norm(e["question"]), e["context"])
        if key in seen:
            dropped["duplicate"] += 1
            continue
        if holdout_hits(e["question"]) or holdout_hits(e["answer"]):
            dropped["holdout_phrase"] += 1
            continue
        if max(TU.jaccard(e["question"], q) for q in eval_qs) >= 0.8:
            dropped["near_eval"] += 1
            continue
        seen.add(key)
        kept.append(e)
    sft = [e for e in kept if e["pool"] == "sft"]
    dpo = [e for e in kept if e["pool"] == "dpo"]
    sft_q = {TU.norm(e["question"]) for e in sft}
    dpo = [e for e in dpo if TU.norm(e["question"]) not in sft_q]
    by_kind = collections.defaultdict(list)
    for e in dpo:
        by_kind[e["kind"]].append(e)
    dpo = []
    for kind, share in dpo_comp.items():
        dpo += by_kind[kind][:round(600 * share)]
    print(f"examples: sft {len(sft)} | dpo prompts {len(dpo)} | dropped {dict(dropped)}")

    # Retrieval snapshot for every question we will ever show a model.
    questions = sorted({e["question"] for e in sft + dpo} | set(eval_qs))
    print(f"retrieving {len(questions)} questions (local BGE + reranker, read-only index)...", flush=True)
    chunks, snap, rstats = retrieve_all(questions)

    for e in sft + dpo:
        e["chunk_ids"] = contexts_for(e, chunks, snap)
        if e["kind"] in ("answer_with_gold_context", "comparison_multi_claim", "two_part") and e["context"] == "rag":
            for fid in e["gold_fact_ids"]:
                assert any(fid in chunks[c]["fact_ids"] for c in e["chunk_ids"]), (e["question"], fid)
        if e["context"] == "rag_no_gold":
            for fid in e["gold_fact_ids"]:
                assert not any(fid in chunks[c]["fact_ids"] for c in e["chunk_ids"]), (e["question"], fid)
        e["form"] = TX.form(e["question"], {"comparison_multi_claim": None}.get(e["kind"]))

    # Train / validation split (SFT): held-out families and topics go to validation only.
    def is_val(e):
        if e["kind"] == "refuse_near_miss":
            return e["topic"] in val_topics
        if e["kind"] == "two_part":
            return e["topic"] in val_unknowns
        h = int(__import__("hashlib").sha256(e["family"].encode()).hexdigest(), 16) % 100
        return h < 11
    train = [e for e in sft if not is_val(e)]
    val = [e for e in sft if is_val(e)]
    for i, e in enumerate(train):
        e["id"] = f"sft2-train-{i:04d}"
    for i, e in enumerate(val):
        e["id"] = f"sft2-val-{i:04d}"
    RNG.shuffle(dpo)
    for i, e in enumerate(dpo):
        e["id"] = f"dpo2-{i:04d}"
        e["split"] = "val" if (e["kind"] == "refuse_near_miss" and e["topic"] in val_topics) or \
            (e["kind"] != "refuse_near_miss" and int(__import__("hashlib").sha256(e["family"].encode()).hexdigest(), 16) % 100 < 10) else "train"

    # Audits
    audit = {"facts_in_answers_wrong": [], "arc_zero_minutes": [], "holdout_hits": [], "near_eval_max_jaccard": 0.0}
    for e in train + val:
        for n in F.numbers_in(re.sub(r"(Arc|Pulse) (110|125)", "", e["answer"])):
            allowed = {float(F.FIDX[fid]["value"]) for fid in e["fact_ids"] if isinstance(F.FIDX[fid]["value"], (int, float))}
            allowed |= {80.0, 12.0, 70.0, 0.0, 60.0} | {float(x.replace(",", "")) for x in re.findall(r"\d[\d,]*(?:\.\d+)?", e["question"])}
            allowed |= {4.5} if "110_fast_charge_minutes" in e["fact_ids"] else set()
            if n not in allowed and n not in (2024.0, 2025.0, 2026.0) | allowed:
                audit["facts_in_answers_wrong"].append((e["id"], e["answer"]))
        if re.search(r"(?<![\d,.])0 minutes", e["answer"]):
            audit["arc_zero_minutes"].append(e["id"])
        if holdout_hits(e["question"]):
            audit["holdout_hits"].append(e["id"])
    audit["near_eval_max_jaccard"] = round(max(TU.jaccard(e["question"], q) for e in train + val + dpo for q in eval_qs), 3)

    setup.write_json(OUT / "retrieval_snapshot.json", {
        "index_name": "meridian_bge_small_v1", "settings": {"top_n_candidates": 10, "top_k": 3, "rerank": True, "hybrid": False},
        "chunks": chunks, "questions": snap, "built_at": time.strftime("%Y-%m-%d %H:%M:%S"), "local_usage": rstats})
    setup.write_jsonl(OUT / "sft_v2_train.jsonl", train)
    setup.write_jsonl(OUT / "sft_v2_val.jsonl", val)
    setup.write_jsonl(OUT / "dpo_v2_prompts.jsonl", dpo)
    setup.write_json(OUT / "topic_holdout.json", {
        "dev_v1_topics": T.DEV_V1_TOPICS, "dev_v2_topics": [t[0] for t in T.DEV_V2_UNANSWERABLE],
        "held_out_cities": T.HELD_OUT_CITIES, "phrases": T.HOLDOUT_PHRASES,
        "sft_validation_only_topics": sorted(val_topics), "sft_validation_only_two_part_unknowns": sorted(val_unknowns)})

    def counts(rows, key):
        return dict(collections.Counter(r[key] for r in rows).most_common())
    manifest = {
        "built_at": time.strftime("%Y-%m-%d %H:%M:%S"), "seed": CFG["seed"], "seconds": round(time.time() - t0, 1),
        "sft_train": len(train), "sft_val": len(val), "dpo_prompts": len(dpo),
        "dpo_split": counts(dpo, "split"), "dropped": dict(dropped),
        "composition_train": {k: round(v / len(train), 3) for k, v in counts(train, "kind").items()},
        "composition_targets": DC["composition_targets"],
        "near_miss_categories_train": counts([e for e in train if e["kind"] == "refuse_near_miss"], "cat"),
        "context_policy_train": counts(train, "context"), "styles_train": counts(train, "style"),
        "forms_train": counts(train, "form"), "traps_train": counts([e for e in train if e["trap"]], "trap"),
        "dpo_kinds": counts(dpo, "kind"),
        "short_name_share_train": round(sum(not re.search(r"meridian (arc 110|pulse 125|volt x)", e["question"].lower()) for e in train) / len(train), 3),
        "refusal_share_train": round(sum(e["kind"].startswith("refuse") for e in train) / len(train), 3),
        "audit": {k: (v if not isinstance(v, list) else {"count": len(v), "examples": v[:5]}) for k, v in audit.items()},
        "retrieval_questions": len(snap),
    }
    setup.write_json(OUT / "sft_v2_manifest.json", manifest)
    print(json.dumps(manifest, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
