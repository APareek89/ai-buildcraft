"""Canonical facts (parent data/raw/facts.json, read-only) and how to say them."""
from __future__ import annotations

import json
import re

from v2lib import setup

FACTS = json.loads(setup.path("../data/raw/facts.json").read_text())["facts"]
FIDX = {f["id"]: f for f in FACTS}
MODELS = ["Meridian Arc 110", "Meridian Pulse 125", "Meridian Volt X"]
PREFIX = {"Meridian Arc 110": "110", "Meridian Pulse 125": "125", "Meridian Volt X": "x"}
SHORT = {  # ways customers name each model; index 0 is the official name
    "Meridian Arc 110": ["Meridian Arc 110", "Arc 110", "Arc 110", "Arc", "the Arc"],
    "Meridian Pulse 125": ["Meridian Pulse 125", "Pulse 125", "Pulse 125", "Pulse", "the Pulse"],
    "Meridian Volt X": ["Meridian Volt X", "Volt X", "Volt X", "Volt X", "the Volt X"],
}
CITIES = ["Mumbai", "Bengaluru", "Delhi"]
ATTRS = ["battery_kwh", "range_km", "top_speed_kmph", "charge_time_hours", "fast_charge_minutes", "motor_kw",
         "kerb_weight_kg", "boot_litres", "warranty_years", "battery_warranty_km", "service_interval_km",
         "price_mumbai_inr", "price_bengaluru_inr", "price_delhi_inr", "colours", "launch_year"]


def fact(model: str, attribute: str) -> dict:
    return FIDX[f"{PREFIX[model]}_{attribute}"]


def num(v) -> str:
    """Spec-sheet style number: 109,900 / 2.9 / 3.0."""
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, int):
        return f"{v:,}"
    return f"{v:.1f}" if float(v).is_integer() else f"{v}"


def scoreable(f: dict) -> bool:
    """Numeric facts the legacy scorer can check. Colours are excluded; the Arc fast-charge 0 is a sentinel."""
    return f["attribute"] != "colours" and not (f["id"] == "110_fast_charge_minutes")


def answer_sentence(f: dict, variant: int = 0) -> str:
    """One grounded sentence stating a fact, with its model and unit. No caveats."""
    m, a, v = f["model"], f["attribute"], f["value"]
    city = a.split("_")[1].capitalize() if a.startswith("price_") else None
    T = {
        "battery_kwh": [f"The {m} has a battery capacity of {num(v)} kWh.", f"The {m}'s battery capacity is {num(v)} kWh."],
        "range_km": [f"The {m} has a certified range of {num(v)} km on a full charge.", f"On a full charge, the {m}'s certified range is {num(v)} km."],
        "top_speed_kmph": [f"The {m}'s top speed is {num(v)} km/h.", f"The {m} has a listed top speed of {num(v)} km/h."],
        "charge_time_hours": [f"A full charge on the standard charger takes {num(v)} hours for the {m}.", f"The {m} takes {num(v)} hours to charge fully on the standard charger."],
        "fast_charge_minutes": [f"On the Meridian fast charger, the {m} reaches 80 percent in {num(v)} minutes.", f"The {m} takes {num(v)} minutes to reach 80 percent on the Meridian fast charger."],
        "motor_kw": [f"The {m}'s peak motor power is {num(v)} kW.", f"The {m} has a peak motor power of {num(v)} kW."],
        "kerb_weight_kg": [f"The {m}'s kerb weight is {num(v)} kg.", f"The {m} has a listed kerb weight of {num(v)} kg."],
        "boot_litres": [f"The {m} has {num(v)} litres of under-seat storage.", f"The {m}'s under-seat storage is {num(v)} litres."],
        "warranty_years": [f"The {m} has a {num(v)}-year vehicle warranty, running from the date of delivery.", f"The {m}'s vehicle warranty lasts {num(v)} years from the date of delivery."],
        "battery_warranty_km": [f"The {m}'s battery warranty covers {num(v)} km or the end of the vehicle warranty period, whichever comes first.", f"The {m}'s battery warranty distance limit is {num(v)} km, or the end of the vehicle warranty period if that comes first."],
        "service_interval_km": [f"The {m} should be serviced every {num(v)} km at an authorised Meridian service centre.", f"The {m}'s service interval is {num(v)} km, at an authorised Meridian service centre."],
        "colours": [f"The {m} is available in {v}.", f"The {m} comes in {v}."],
        "launch_year": [f"The {m} was launched in {v}.", f"The {m}'s launch year is {v}."],
    }
    if a.startswith("price_"):
        T[a] = [f"The {m}'s indicative on-road price in {city} is Rs {num(v)}, including registration and insurance.",
                f"In {city}, the {m} has an indicative on-road price of Rs {num(v)}, which includes registration and insurance."]
    if f["id"] == "110_fast_charge_minutes":
        T[a] = ["The Meridian Arc 110 does not support fast charging.",
                "Fast charging is not supported on the Meridian Arc 110; it charges fully in 4.5 hours on the standard charger."]
    options = T[a]
    return options[variant % len(options)]


def numbers_in(text: str) -> list[float]:
    out = []
    for tok in re.findall(r"\d[\d,]*(?:\.\d+)?", text):
        try:
            out.append(float(tok.replace(",", "")))
        except ValueError:
            pass
    return out


ALL_VALUES = {float(f["value"]) for f in FACTS if isinstance(f["value"], (int, float))}
