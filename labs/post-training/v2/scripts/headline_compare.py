"""Same questions, same ruler: base vs SFT v1 vs SFT v2, all with RAG (rag_rerank), on dev_v1 and dev_v2.

Answers use notebook 04's exact generation settings and cache keys (so notebook 04 reuses them).
dev_v1 answers for base / SFT v1 are reused from the main lab's notebook 13 (master evaluation) when byte-identical.
All three systems' answers are judged together by the calibrated Gemini judge, blind and shuffled.
Run: scripts/run_guarded.sh headline ../.venv/bin/python scripts/headline_compare.py
"""
import hashlib
import json
import math
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from v2lib import setup, device as D, prompts as P, facts as F, judge as J, gemini_io as G  # noqa: E402

CFG = setup.cfg()
FE = CFG["final_eval"]
SNAP = setup.read_json(setup.V2_ROOT / CFG["retrieval"]["snapshot"])
CHUNKS = SNAP["chunks"]
EVAL = {"dev_v1": setup.read_json(setup.path(CFG["data"]["dev_v1"])), "dev_v2": setup.read_json(setup.V2_ROOT / CFG["data"]["dev_v2"])}
GEN = dict(CFG["generation"], device=D.device(), dtype=str(D.dtype()).replace("torch.", ""))
CACHE = setup.V2_ROOT / FE["cache_dir"]
CACHE.mkdir(parents=True, exist_ok=True)
MODELS = {"base": FE["models"]["base"], "sft_v1": FE["models"]["sft_v1"], "sft_v2": FE["models"]["sft_v2"]}
PARENT_NAME = {"base": "base", "sft_v1": "sft"}
COND = "rag_rerank"


def sha_file(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def ident(spec):
    return {"kind": spec["kind"]} if spec["kind"] == "base" else \
        {"kind": "adapter", "adapter": sha_file(setup.path(spec["adapter"]) / "adapter_model.safetensors")}


def ids_for(q):
    return SNAP["questions"][q["question"]]["rerank"][:3]


def key_for(mid, q):
    obj = {"model": ident(MODELS[mid]), "cond": COND, "q": q["question"], "chunks": ids_for(q), "gen": GEN}
    return hashlib.sha256(json.dumps(obj, sort_keys=True).encode()).hexdigest()


def parent_reuse(mid):
    out = {}
    if mid not in PARENT_NAME:
        return out
    path = setup.path(FE["parent_v1_results"]) / f"{PARENT_NAME[mid]}__{COND}.json"
    if not path.exists():
        return out
    saved = json.loads(path.read_text())
    g = saved["generation"]
    if (g["max_new_tokens"], g["do_sample"], g["device"], g["dtype"]) != (GEN["max_new_tokens"], False, GEN["device"], GEN["dtype"]):
        return out
    byq = {q["id"]: q for q in EVAL["dev_v1"]}
    for a in saved["answers"]:
        q = byq.get(a["question_id"])
        if q and a["status"] in ("ok", "truncated") and a["chunk_ids"] == ids_for(q) and \
                a["system_prompt_sha256"] == P.sha(P.system_prompt([CHUNKS[c] for c in ids_for(q)])):
            out[q["id"]] = {"answer": a["answer"], "truncated": a["status"] == "truncated", "source": "main-lab notebook 13"}
    return out


def generate_all(mid):
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer
    from peft import PeftModel
    reuse = parent_reuse(mid)
    todo = [(es, q) for es, items in EVAL.items() for q in items
            if not (es == "dev_v1" and q["id"] in reuse) and not (CACHE / f"{key_for(mid, q)}.json").exists()]
    rows = {}
    model = None
    if todo:
        tok = AutoTokenizer.from_pretrained(D.base_model_path())
        base = AutoModelForCausalLM.from_pretrained(D.base_model_path(), dtype=D.dtype()).to(D.device())
        spec = MODELS[mid]
        model = base if spec["kind"] == "base" else PeftModel.from_pretrained(base, str(setup.path(spec["adapter"])))
        model = model.to(D.device()).eval()
    t0 = time.time()
    n = 0
    for es, items in EVAL.items():
        for q in items:
            if es == "dev_v1" and q["id"] in reuse:
                rows[(es, q["id"])] = reuse[q["id"]]
                continue
            path = CACHE / f"{key_for(mid, q)}.json"
            if path.exists():
                rows[(es, q["id"])] = json.loads(path.read_text())
                continue
            prompt = tok.apply_chat_template(P.messages(q["question"], [CHUNKS[c] for c in ids_for(q)]), tokenize=True,
                                             add_generation_prompt=True, return_dict=False)
            x = torch.tensor([prompt], device=D.device())
            eos = model.generation_config.eos_token_id
            eos_ids = [e for e in (eos if isinstance(eos, list) else [eos]) if e is not None]
            with torch.inference_mode():
                o = model.generate(input_ids=x, attention_mask=torch.ones_like(x), max_new_tokens=GEN["max_new_tokens"],
                                   do_sample=False, num_beams=1, eos_token_id=eos, pad_token_id=tok.pad_token_id or tok.eos_token_id)
            new = o[0, x.shape[1]:].tolist()
            rec = {"answer": tok.decode(new, skip_special_tokens=True).strip(), "completion_tokens": len(new), "prompt_tokens": len(prompt),
                   "truncated": len(new) >= GEN["max_new_tokens"] and (not new or new[-1] not in eos_ids),
                   "chunk_ids": ids_for(q), "source": "generated", "model": mid, "condition": COND, "eval_set": es, "question_id": q["id"]}
            path.write_text(json.dumps(rec, ensure_ascii=False))
            rows[(es, q["id"])] = rec
            n += 1
            if n % 25 == 0:
                setup.progress("headline", f"{mid}: {n}/{len(todo)} generated | {(time.time() - t0) / 60:.1f} min")
    if model is not None:
        del model
        D.empty_cache()
    setup.progress("headline", f"{mid}: ready ({n} generated, {len(reuse)} reused from main-lab notebook 13)")
    return rows


def wilson(k, n, z=1.96):
    if not n:
        return None
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return [round(c - h, 3), round(c + h, 3)]


def main():
    answers = {mid: generate_all(mid) for mid in MODELS}
    QI = {(es, q["id"]): q for es, items in EVAL.items() for q in items}
    uniq, rows = {}, []
    for mid, got in answers.items():
        for (es, qid), a in got.items():
            q = QI[(es, qid)]
            jid = hashlib.sha256((es + qid + a["answer"]).encode()).hexdigest()[:20]
            rows.append({"model": mid, "eval_set": es, "question_id": qid, "answerable": q["answerable"], "category": q["category"],
                         "answer": a["answer"], "truncated": a.get("truncated", False), "jid": jid})
            uniq.setdefault(jid, {"id": jid, "question": q["question"], "answerable": q["answerable"],
                                  "gold": J.gold_for(F.FIDX[q["fact_id"]]) if q["answerable"] else None,
                                  "answer": a["answer"], "truncated": a.get("truncated", False)})
    cal = setup.read_json(setup.V2_ROOT / CFG["data"]["judge_calibration"])
    cal_res = J.judge(cal, purpose="judge_calibration", cap=120)
    agree = sum(cal_res[i["id"]]["label"] == i["expected"] for i in cal) / len(cal)
    assert agree >= CFG["judge"]["calibration_min_agreement"], agree
    setup.progress("headline", f"judging {len(uniq)} distinct answers (calibration {agree:.0%})")
    verdict = J.judge(list(uniq.values()), purpose="headline_compare", cap=120)
    for r in rows:
        r["label"] = verdict[r["jid"]]["label"]
        r["rationale"] = verdict[r["jid"]]["rationale"]
    table = []
    for mid in MODELS:
        for es in EVAL:
            g = [r for r in rows if r["model"] == mid and r["eval_set"] == es]
            m = J.metrics(g)
            ans, una = [r for r in g if r["answerable"]], [r for r in g if not r["answerable"]]
            k_acc = sum(r["label"] in ("correct", "correct_with_unsupported_caveat") for r in ans)
            k_ref = sum(r["label"] == "refused" for r in una)
            cats = {}
            for c in sorted({r["category"] for r in una}):
                cc = [r for r in una if r["category"] == c]
                cats[c] = f"{sum(r['label'] == 'refused' for r in cc)}/{len(cc)}"
            table.append(dict(model=mid, eval_set=es, n_ans=len(ans), n_unans=len(una), correct=k_acc, refused=k_ref,
                              accuracy=m["accuracy_answerable"], accuracy_ci=wilson(k_acc, len(ans)),
                              hallucination=m["hallucination_rate_answerable"], over_refusal=m["over_refusal_rate"],
                              appropriate_refusal=m["appropriate_refusal_rate"], refusal_ci=wilson(k_ref, len(una)),
                              invented_unanswerable=m["invented_rate_unanswerable"], refusal_by_category=cats))
    out = {"condition": COND, "judge_calibration": agree, "gemini": G.stats(), "table": table, "rows": rows,
           "saved_at": time.strftime("%Y-%m-%d %H:%M:%S")}
    setup.write_json(setup.V2_ROOT / "runs/headline_compare.json", out)
    for t in table:
        print(f"{t['model']:7s} {t['eval_set']}: acc {t['correct']}/{t['n_ans']} ({t['accuracy']:.1%}) | refused {t['refused']}/{t['n_unans']} "
              f"({t['appropriate_refusal']:.1%}) | halluc {t['hallucination']:.1%} | over-ref {t['over_refusal']:.1%} | {t['refusal_by_category']}")
    print(G.stats())


if __name__ == "__main__":
    main()
