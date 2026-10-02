"""Evaluation cells appended to notebooks/01_sft_v2.ipynb (SFT v2 on its own, four conditions).

Used two ways:
  python scripts/sft_eval_cells.py append   -> append the cells to the executed notebook 01 (once)
  python scripts/sft_eval_cells.py run      -> execute ONLY these cells (via a temporary notebook) and
                                               copy their outputs back into notebook 01, so training never reruns
"""
import json
import subprocess
import sys
from pathlib import Path

import nbformat as nbf

ROOT = Path(__file__).resolve().parents[1]
NB = ROOT / "notebooks/01_sft_v2.ipynb"
TMP = ROOT / "notebooks/_tmp_01_sft_eval.ipynb"
MARK = "<!-- sft-eval-section -->"

CELLS = [
("m", MARK + """
## How good is SFT v2 on its own? Prompt only vs all documents vs RAG

Training loss says the model fits its data. This section asks the business question: **does it answer correctly and refuse appropriately?** Every dev_v1 (50) and dev_v2 (140) question is answered under four conditions:

| condition | what the model sees |
|---|---|
| `engineered` | the system prompt only: no documents (tests what it memorised) |
| `with_docs` | all five official documents pasted into the prompt (about 1,200 tokens; **not** the format it was trained on) |
| `rag_rerank` | the 3 retrieved chunks (the format it was trained on) |
| `oracle` | only the chunk that holds the answer (answerable questions only; the ceiling for RAG) |

Generation is identical to the main lab's notebook 13 and to v2 notebook 04 (greedy, 160 new tokens, float32). Answers are written into notebook 04's cache with the same keys, so the final evaluation reuses them. Scoring: the Gemini judge (primary) and the v1 keyword scorer (continuity)."""),
("c", '''# Self-contained: loads SFT v2 from disk, so it does not depend on the training cells above.
import pandas as pd, torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel
from src import lab
from v2lib import judge as J, gemini_io as G
EVAL = {"dev_v1": setup.read_json(setup.path(CFG["data"]["dev_v1"])), "dev_v2": setup.read_json(V2_ROOT / CFG["data"]["dev_v2"])}
DOCS = "\\n\\n".join(p.read_text() for p in sorted((setup.PARENT / "data/raw").glob("*.md")))   # the main lab's with_docs text
CONDS = ["engineered", "with_docs", "rag_rerank", "oracle"]
GEN = dict(CFG["generation"], device=D.device(), dtype=str(D.dtype()).replace("torch.", ""))
CACHE = V2_ROOT / CFG["final_eval"]["cache_dir"]; CACHE.mkdir(parents=True, exist_ok=True)

def chunk_ids_for(q, cond):
    if cond in ("engineered", "with_docs"):
        return []
    if cond == "rag_rerank":
        return SNAP["questions"][q["question"]]["rerank"][:3]
    return [c for c in sorted(CHUNKS) if q["answerable"] and q["fact_id"] in CHUNKS[c]["fact_ids"]]   # oracle

def system_for(cond, ids):
    return P.ENGINEERED + P.SEPARATOR + DOCS if cond == "with_docs" else P.system_prompt([CHUNKS[c] for c in ids])

adapter_dir = V2_ROOT / CFG["sft"]["output_adapter"]
IDENT = {"kind": "adapter", "adapter": hashlib.sha256((adapter_dir / "adapter_model.safetensors").read_bytes()).hexdigest()}
tok_e = AutoTokenizer.from_pretrained(D.base_model_path())
sft_model = PeftModel.from_pretrained(AutoModelForCausalLM.from_pretrained(D.base_model_path(), dtype=D.dtype()).to(D.device()),
                                      str(adapter_dir)).to(D.device()).eval()
jobs = [(cond, es, q) for cond in CONDS for es, items in EVAL.items() for q in items if cond != "oracle" or q["answerable"]]
print(len(jobs), "answers planned:", dict(collections.Counter(c for c, _, _ in jobs)))
D.memory_report("SFT v2 loaded for evaluation")'''),
("c", '''def generate_answer(system, question):
    ids = tok_e.apply_chat_template([{"role": "system", "content": system}, {"role": "user", "content": question}],
                                    tokenize=True, add_generation_prompt=True, return_dict=False)
    assert len(ids) <= GEN["max_input_tokens"]
    x = torch.tensor([ids], device=D.device())
    eos = sft_model.generation_config.eos_token_id
    eos_ids = [e for e in (eos if isinstance(eos, list) else [eos]) if e is not None]
    with torch.inference_mode():
        out = sft_model.generate(input_ids=x, attention_mask=torch.ones_like(x), max_new_tokens=GEN["max_new_tokens"],
                                 do_sample=False, num_beams=1, eos_token_id=eos, pad_token_id=tok_e.pad_token_id or tok_e.eos_token_id)
    new = out[0, x.shape[1]:].tolist()
    return {"answer": tok_e.decode(new, skip_special_tokens=True).strip(), "completion_tokens": len(new), "prompt_tokens": len(ids),
            "truncated": len(new) >= GEN["max_new_tokens"] and (not new or new[-1] not in eos_ids)}

EV, t0 = [], time.time()
for n, (cond, es, q) in enumerate(jobs):
    ids = chunk_ids_for(q, cond)
    key_obj = {"model": IDENT, "cond": cond, "q": q["question"], "chunks": ids, "gen": GEN}          # notebook 04's cache key
    if cond == "with_docs":
        key_obj["system_sha256"] = P.sha(system_for(cond, ids))
    path = CACHE / (hashlib.sha256(json.dumps(key_obj, sort_keys=True).encode()).hexdigest() + ".json")
    if path.exists():
        rec = json.loads(path.read_text())
    else:
        rec = generate_answer(system_for(cond, ids), q["question"])
        rec.update(chunk_ids=ids, source="generated", model="sft_v2", condition=cond, eval_set=es, question_id=q["id"])
        path.write_text(json.dumps(rec, ensure_ascii=False))
    EV.append({"eval_set": es, "condition": cond, "question_id": q["id"], "answerable": q["answerable"], "category": q["category"],
               "style": q["style"], "question": q["question"], "answer": rec["answer"], "truncated": rec["truncated"],
               "prompt_tokens": rec.get("prompt_tokens")})
    if (n + 1) % 50 == 0:
        setup.progress("01_sft_eval", f"{n + 1}/{len(jobs)} answers | {(time.time() - t0) / 60:.1f} min")
print(f"{len(EV)} answers ready in {(time.time() - t0) / 60:.1f} min")
del sft_model; D.empty_cache(); D.memory_report("released")'''),
("m", "### Score: Gemini judge (primary) and the v1 keyword scorer\n\nThe judge first passes its 60-item calibration check. Each distinct (question, answer) pair is judged once. \"Accuracy\" counts the right value even with an unsupported caveat; `caveat` shows how often such a caveat appeared."),
("c", '''fidx = lab.fact_index()
QI = {(es, q["id"]): q for es, items in EVAL.items() for q in items}
cal = setup.read_json(V2_ROOT / CFG["data"]["judge_calibration"])
cal_res = J.judge(cal, purpose="judge_calibration", cap=150)
assert sum(cal_res[i["id"]]["label"] == i["expected"] for i in cal) / len(cal) >= CFG["judge"]["calibration_min_agreement"]
uniq = {}
for r in EV:
    q = QI[(r["eval_set"], r["question_id"])]
    s = lab.score_answer(r["answer"], q, fidx)
    r.update(legacy_correct=s["correct"], legacy_refused=s["refused"])
    r["jid"] = hashlib.sha256((r["eval_set"] + q["id"] + r["answer"]).encode()).hexdigest()[:20]
    uniq.setdefault(r["jid"], {"id": r["jid"], "question": q["question"], "answerable": q["answerable"],
                               "gold": J.gold_for(F.FIDX[q["fact_id"]]) if q["answerable"] else None,
                               "answer": r["answer"], "truncated": r["truncated"]})
print(f"{len(EV)} answers -> {len(uniq)} distinct pairs to judge")
setup.progress("01_sft_eval", f"judging {len(uniq)} distinct answers")
V = J.judge(list(uniq.values()), purpose="sft_v2_eval", cap=150)
E = pd.DataFrame(EV)
E["label"] = [V[j]["label"] for j in E.jid]
E["rationale"] = [V[j]["rationale"] for j in E.jid]
print(G.stats())'''),
("c", '''def summarise(g):
    m = J.metrics(g[["answerable", "label"]].to_dict("records"))
    a, u = g[g.answerable], g[~g.answerable]
    return pd.Series({"n_ans": len(a), "n_unans": len(u), "accuracy": m["accuracy_answerable"], "caveat": m["caveat_rate_answerable"],
                      "hallucination": m["hallucination_rate_answerable"], "over_refusal": m["over_refusal_rate"],
                      "approp_refusal": m["appropriate_refusal_rate"], "invented_unans": m["invented_rate_unanswerable"],
                      "legacy_acc": a.legacy_correct.mean() if len(a) else None, "legacy_refusal": u.legacy_correct.mean() if len(u) else None,
                      "mean_prompt_tokens": g.prompt_tokens.mean()})
SFT_EVAL = E.groupby(["eval_set", "condition"]).apply(summarise, include_groups=False).reindex(CONDS, level="condition")
pd.set_option("display.width", 220)
display(SFT_EVAL.round(3))
setup.write_json(V2_ROOT / "runs/sft_v2_eval.json", {"scoreboard": json.loads(SFT_EVAL.reset_index().to_json(orient="records")),
                                                      "gemini": G.stats(), "saved_at": time.strftime("%Y-%m-%d %H:%M:%S")})'''),
("m", "### Same questions, old ruler: SFT v1 vs SFT v2 on dev_v1\n\nSFT v1's numbers come from the main lab's notebook 13 (keyword scorer). This cell is skipped if you have not run it. SFT v2 is shown on the same keyword scorer, so this row-for-row comparison uses one ruler."),
("c", '''v1_csv = setup.path(CFG["final_eval"]["parent_v1_results"]) / "summary.csv"
if v1_csv.exists():
    v1 = pd.read_csv(v1_csv)
    v1 = v1[(v1.model == "sft") & v1.condition.isin(CONDS)].set_index("condition")[["accuracy_answerable", "appropriate_refusal_rate"]]
    v2 = SFT_EVAL.loc["dev_v1"][["legacy_acc", "legacy_refusal"]]
    cmp_ = pd.DataFrame({"SFT v1 accuracy": v1["accuracy_answerable"], "SFT v2 accuracy": v2["legacy_acc"],
                         "SFT v1 refusal": v1["appropriate_refusal_rate"], "SFT v2 refusal": v2["legacy_refusal"]}).reindex(CONDS)
    display(cmp_.round(3))
else:
    print("Skipped: run the main lab's notebook 13 (master evaluation) first to compare with SFT v1.")'''),
("m", "### Refusals by category, and answers to read\n\nCorrect-refusal rate per unanswerable category (n in brackets), then a few wrong answers per condition from dev_v2."),
("c", '''u = E[~E.answerable]
display(u.groupby(["eval_set", "category", "condition"]).apply(lambda g: f"{(g.label == 'refused').mean():.0%} ({len(g)})", include_groups=False)
        .unstack("condition").reindex(columns=[c for c in CONDS if c != "oracle"]))
def wrong(r):
    return r.label not in ("correct", "correct_with_unsupported_caveat") if r.answerable else r.label != "refused"
W = E[(E.eval_set == "dev_v2") & E.apply(wrong, axis=1)]
with pd.option_context("display.max_colwidth", None):
    display(W.groupby("condition").head(3)[["condition", "category", "question", "answer", "label"]])'''),
("m", """### How to read this

- **`engineered` vs `rag_rerank`** shows what retrieval adds over memorised knowledge.
- **`with_docs` vs `rag_rerank`** shows whether three focused chunks beat five whole documents. SFT v2 trained only on the chunk format, so `with_docs` is partly out of distribution for it.
- **`oracle`** is the ceiling: with the right chunk alone, wrong answers are generation errors, not retrieval misses.
- **dev_v2 is the cleaner read.** dev_v1 informed the v2 design.
- **The full comparison** with base, v1 and DPO v2, plus the `rag_no_gold` condition, is in notebook 04."""),
]


def append():
    nb = nbf.read(str(NB), as_version=4)
    if any(MARK in "".join(c.source) for c in nb.cells if c.cell_type == "markdown"):
        print("cells already present"); return
    for kind, src in CELLS:
        nb.cells.append(nbf.v4.new_markdown_cell(src) if kind == "m" else nbf.v4.new_code_cell(src))
    nbf.write(nb, str(NB)); print(f"appended {len(CELLS)} cells to {NB.name}")


def run():
    nb = nbf.read(str(NB), as_version=4)
    start = next(i for i, c in enumerate(nb.cells) if c.cell_type == "markdown" and MARK in "".join(c.source))
    setup_cell = next(c for c in nb.cells if c.cell_type == "code")          # first code cell = SETUP
    tmp = nbf.v4.new_notebook(metadata=nb.metadata)
    tmp.cells = [nbf.v4.new_code_cell(setup_cell.source)] + [nbf.v4.new_code_cell(c.source) if c.cell_type == "code"
                                                              else nbf.v4.new_markdown_cell(c.source) for c in nb.cells[start:]]
    nbf.write(tmp, str(TMP))
    subprocess.run([str(ROOT.parent / ".venv/bin/jupyter"), "nbconvert", "--to", "notebook", "--execute", "--inplace",
                    "--ExecutePreprocessor.timeout=-1", "--ExecutePreprocessor.kernel_name=python3", str(TMP)], check=True)
    done = nbf.read(str(TMP), as_version=4)
    for k, cell in enumerate(nb.cells[start:]):
        src = done.cells[k + 1]
        if cell.cell_type == "code":
            cell.outputs, cell.execution_count = src.outputs, src.execution_count
    nbf.write(nb, str(NB)); TMP.unlink()
    print("outputs copied into", NB.name)


if __name__ == "__main__":
    {"append": append, "run": run}[sys.argv[1]]()
