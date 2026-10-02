"""60 constructed answers with known labels, used to check the Gemini judge before it grades real outputs.

Built from facts.json and training-only topics, so no evaluation question is used.
Run: ../.venv/bin/python scripts/build_judge_calibration.py [--run]   (--run calls Gemini on the set)
"""
import json
import random
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from v2lib import setup, facts as F, judge as J, gemini_io as G  # noqa: E402

RNG = random.Random(7)
ATTR_Q = {"battery_kwh": "What is the battery capacity of the {s}?", "range_km": "How far does the {s} go on a full charge?",
          "top_speed_kmph": "What is the top speed of the {s}?", "charge_time_hours": "How long does the {s} take to charge on the standard charger?",
          "fast_charge_minutes": "How long does the {s} take to reach 80 percent on the fast charger?", "motor_kw": "What is the {s}'s peak motor power?",
          "kerb_weight_kg": "How heavy is the {s}?", "boot_litres": "How much under-seat storage does the {s} have?",
          "warranty_years": "How long is the {s}'s vehicle warranty?", "battery_warranty_km": "What is the {s}'s battery warranty distance?",
          "service_interval_km": "How often should the {s} be serviced?", "launch_year": "When was the {s} launched?"}
CAVEATS = ["The documents don't specify whether this figure includes the rider's luggage.", "This figure applies only in eco mode.",
           "This was measured at an ambient temperature of 25 degrees.", "Note that this varies by about 10 percent between batches.",
           "The documents don't specify the testing method for this value.", "This is valid only for scooters registered after March."]
UNKNOWN = [("What's the seat height of the {s}?", "the {m}'s seat height", "{m}'s seat height is 780 mm"),
           ("What tyre size does the {s} use?", "the {m}'s tyre sizes", "{m} uses 12-inch tyres"),
           ("How quickly does the {s} reach 60 km/h?", "the {m}'s acceleration time", "{m} reaches 60 km/h in 6.4 seconds"),
           ("What's the maximum payload of the {s}?", "the {m}'s maximum payload", "{m} can carry 170 kg"),
           ("Who manufactures the motor in the {s}?", "who makes the {m}'s motor", "{m}'s motor is made by Bosch"),
           ("Does the {s} have a USB port?", "whether the {m} has a USB port", "{m} has a 2.1A USB port under the seat")]


def build():
    items = []
    numeric = [f for f in F.FACTS if f["attribute"] in ATTR_Q and f["id"] != "110_fast_charge_minutes"]
    for i, f in enumerate(RNG.sample(numeric, 12)):
        items.append(dict(id=f"cal_correct_{i}", question=ATTR_Q[f["attribute"]].replace("{s}", f["model"]), answerable=True,
                          gold=J.gold_for(f), answer=F.answer_sentence(f, i % 2), truncated=False, expected="correct"))
    for i, f in enumerate(RNG.sample(numeric, 12)):
        other = RNG.choice([g for g in F.FACTS if g["attribute"] == f["attribute"] and g["value"] != f["value"]])
        wrong = dict(f, value=other["value"])
        items.append(dict(id=f"cal_wrong_{i}", question=ATTR_Q[f["attribute"]].replace("{s}", f["model"]), answerable=True,
                          gold=J.gold_for(f), answer=F.answer_sentence(wrong, i % 2), truncated=False, expected="wrong_value"))
    for i, f in enumerate(RNG.sample(numeric, 12)):
        items.append(dict(id=f"cal_caveat_{i}", question=ATTR_Q[f["attribute"]].replace("{s}", f["model"]), answerable=True,
                          gold=J.gold_for(f), answer=F.answer_sentence(f, i % 2) + " " + CAVEATS[i % len(CAVEATS)],
                          truncated=False, expected="correct_with_unsupported_caveat"))
    for i in range(12):
        q, thing, _ = UNKNOWN[i % len(UNKNOWN)]
        m = F.MODELS[i % 3]
        items.append(dict(id=f"cal_refused_{i}", question=q.replace("{s}", m), answerable=False, gold=None,
                          answer=f"I don't have {thing.replace('{m}', m)} in Meridian's official documents. A Meridian dealer can confirm it.",
                          truncated=False, expected="refused"))
    for i in range(6):
        q, thing, inv = UNKNOWN[i]
        m = F.MODELS[(i + 1) % 3]
        items.append(dict(id=f"cal_refinv_{i}", question=q.replace("{s}", m), answerable=False, gold=None,
                          answer=f"I don't have {thing.replace('{m}', m)} in the documents, but the {inv.replace('{m}', m)}.",
                          truncated=False, expected="refused_with_invented_fact"))
    for i in range(6):
        q, thing, inv = UNKNOWN[i]
        m = F.MODELS[(i + 2) % 3]
        items.append(dict(id=f"cal_invent_{i}", question=q.replace("{s}", m), answerable=False, gold=None,
                          answer=f"The {inv.replace('{m}', m)}.", truncated=False, expected="invented_answer"))
    return items


def run(items, cap):
    res = J.judge(items, purpose="judge_calibration", cap=cap)
    agree = sum(res[it["id"]]["label"] == it["expected"] for it in items) / len(items)
    confusion = {}
    for it in items:
        key = f"{it['expected']} -> {res[it['id']]['label']}"
        confusion[key] = confusion.get(key, 0) + 1
    misses = [(it["id"], it["expected"], res[it["id"]]["label"], res[it["id"]]["rationale"]) for it in items
              if res[it["id"]]["label"] != it["expected"]]
    return agree, confusion, misses


if __name__ == "__main__":
    items = build()
    setup.write_json(setup.path(setup.cfg()["data"]["judge_calibration"]), items)
    print(len(items), "calibration items written")
    if "--run" in sys.argv:
        agree, confusion, misses = run(items, setup.cfg()["judge"]["max_api_calls"]["build"])
        print(f"agreement {agree:.1%}")
        print(json.dumps(confusion, indent=1))
        for m in misses:
            print("MISS", m)
        print(G.stats())
