"""Author the five v2 notebooks. Run: ../.venv/bin/python scripts/build_notebooks.py
Notebooks are written without outputs; executing them fills the outputs in place.
"""
import sys
from pathlib import Path

import nbformat as nbf

ROOT = Path(__file__).resolve().parents[1]
KERNEL = {"display_name": "Python 3 (Post-Training-Lab)", "language": "python", "name": "python3"}

SETUP = '''# Find the v2 folder, put it (and the main lab one folder up) on the import path,
# and apply the memory-safety settings BEFORE torch is imported.
import sys, json, time, re, math, random, hashlib, collections
from pathlib import Path
V2_ROOT = next(p for p in (Path.cwd(), *Path.cwd().parents) if (p / "configs/v2.yaml").is_file())
sys.path.insert(0, str(V2_ROOT))
from v2lib import setup, device as D, prompts as P, facts as F
CFG = setup.cfg()
SNAP = setup.read_json(V2_ROOT / CFG["retrieval"]["snapshot"])
CHUNKS = SNAP["chunks"]
print("v2 folder:", V2_ROOT)
print("main lab:", setup.PARENT)
print("device:", D.device(), "| dtype:", D.dtype(), "| base model:", D.base_model_path())
D.memory_report("start")'''


def nb(cells):
    book = nbf.v4.new_notebook()
    book.metadata["kernelspec"] = KERNEL
    book.metadata["language_info"] = {"name": "python"}
    for kind, src in cells:
        book.cells.append(nbf.v4.new_markdown_cell(src) if kind == "m" else nbf.v4.new_code_cell(src))
    return book


def save(name, cells):
    if len(sys.argv) > 1 and name not in sys.argv[1:]:
        return
    path = ROOT / "notebooks" / name
    nbf.write(nb(cells), str(path))
    print("wrote", path.relative_to(ROOT))


# =====================================================================================
# 00 · data
# =====================================================================================
save("00_data_v2.ipynb", [
("m", """# 00 · The v2 data: is it aimed at what went wrong in v1?

**Decision this notebook supports:** before spending hours on training, check that the new data actually targets the v1 failures.

What the v1 analysis found (dev_v1, best system SFT + RAG rerank: 87% accuracy, **55% correct refusals**):

1. **Wrong refusal mix.** 94% of v1 SFT refusals were "spec/feature not listed". Money and policy near-misses, 60% of dev_v1's unanswerable questions, were almost absent.
2. **Lexical traps.** "storage under the seat" was refused as "seat height"; "on-road *charge*" was answered with a charging time.
3. **Hedge leak.** The model added invented caveats to correct answers, and put an unrelated fact before its refusals.
4. **Trained without documents, served with documents.** It still copied the wrong city's price from a correct chunk.
5. **Phrasing gap.** v1 training used "Meridian Arc 110" 61% of the time; customers say "Arc 110" or "the Arc".

This notebook loads the v2 data and checks each point. Nothing here trains or calls an API."""),
("c", SETUP),
("m", "## Load everything\n\nSFT v2 (train / validation), the DPO v2 prompts, both evaluation sets, and the build manifest. Every row keeps its `kind`, `context` policy and `chunk_ids`, so you can see exactly what the model will be shown."),
("c", '''train = setup.read_jsonl(V2_ROOT / CFG["data"]["sft_train"])
val = setup.read_jsonl(V2_ROOT / CFG["data"]["sft_val"])
dpo_prompts = setup.read_jsonl(V2_ROOT / CFG["data"]["dpo_prompts"])
dev_v1 = setup.read_json(setup.path(CFG["data"]["dev_v1"]))
dev_v2 = setup.read_json(V2_ROOT / CFG["data"]["dev_v2"])
manifest = setup.read_json(V2_ROOT / "data/sft_v2_manifest.json")
v1_train = setup.read_json(setup.PARENT / "data/generated/sft_train.json")
print(f"SFT v2: {len(train)} train, {len(val)} validation | DPO prompts: {len(dpo_prompts)}")
print(f"dev_v1: {len(dev_v1)} ({sum(q['answerable'] for q in dev_v1)} answerable) | dev_v2: {len(dev_v2)} ({sum(q['answerable'] for q in dev_v2)} answerable)")
print(f"SFT v1 for comparison: {len(v1_train)} train examples")'''),
("m", "## What one training example looks like to the model\n\nThe exact chat the model is trained on: the **same** system prompt and documents block used at evaluation (the master evaluation's `rag_rerank` format), then the question, then the target answer. Only the answer tokens are scored during SFT."),
("c", '''from transformers import AutoTokenizer
tok = AutoTokenizer.from_pretrained(D.base_model_path())
example = next(e for e in train if e["kind"] == "answer_with_gold_context" and e["trap"] == "price")
msgs = P.messages(example["question"], [CHUNKS[c] for c in example["chunk_ids"]])
print(tok.apply_chat_template(msgs + [{"role": "assistant", "content": example["answer"]}], tokenize=False))'''),
("m", "## Composition: actual vs target\n\nShares of the training set by **what the model should do**. Targets live in `configs/v2.yaml`."),
("c", '''import pandas as pd
import matplotlib.pyplot as plt
actual = collections.Counter(e["kind"] for e in train)
comp = pd.DataFrame([{"kind": k, "target": v, "actual": actual[k] / len(train), "examples": actual[k]}
                     for k, v in CFG["data"]["composition_targets"].items()])
comp["gap_pp"] = (100 * (comp["actual"] - comp["target"])).round(1)
display(comp.round(3))
ax = comp.set_index("kind")[["target", "actual"]].plot.barh(figsize=(8, 3.5), title="SFT v2 composition")
ax.set_xlabel("share of training examples"); plt.tight_layout(); plt.show()'''),
("m", "## Point 1 · the refusal mix now matches what customers ask\n\nv1 refusal topics come from the v1 analysis keyword rules (shown in the cell). v2 rows carry their category explicitly. The dev sets show what the model is tested on."),
("c", '''def v1_unknown_type(q):
    q = q.lower()
    if re.search(r"price|fee|cost|charge for|tariff|rupee|quotation|tax|interest|finance|loan|deposit|refund|premium|resale|amount", q): return "money"
    if re.search(r"warranty|claim|policy|transfer|eligib|appeal|cover|void|notify", q): return "policy"
    if re.search(r"incorporat|address|owner|stake|revenue|employees|ceo|founded|headquart|units were|sales", q): return "company"
    if re.search(r"app\\b|application|usb|alarm|key|delivery|test.ride|ship|courier|freight|book|hours|software|update|mount|top.box|windscreen|phone|mirror|towing|tow", q): return "feature"
    return "spec"
dev_cat = {"price_near_miss": "money", "policy_near_miss": "policy", "spec_near_miss": "spec", "out_of_scope": "company"}
table = pd.DataFrame({
    "SFT v1 train": collections.Counter(v1_unknown_type(r["question"]) for r in v1_train if r["kind"] == "refusal"),
    "SFT v2 train": collections.Counter(e["cat"] for e in train if e["kind"] == "refuse_near_miss"),
    "dev_v1": collections.Counter(dev_cat[q["category"]] for q in dev_v1 if not q["answerable"]),
    "dev_v2": collections.Counter(dev_cat[q["category"]] for q in dev_v2 if not q["answerable"]),
}).fillna(0).astype(int).reindex(["money", "policy", "spec", "feature", "company"])
display(table)
display((100 * table / table.sum()).round(0).astype(int).rename(columns=lambda c: c + " %"))'''),
("m", "## Question forms: v1 vs v2 vs the eval sets\n\nSame rule-based labels as the v1 analysis (`v2lib/taxonomy.py`), so the numbers compare directly."),
("c", '''from v2lib import taxonomy as TX
v1_kind = {"premise_correction": "claimed_value", "multi_fact": "multi_fact", "mixed": "two_part", "comparison": "comparison"}
forms = pd.DataFrame({
    "SFT v1": collections.Counter(TX.form(r["question"], v1_kind.get(r["kind"])) for r in v1_train),
    "SFT v2": collections.Counter(e["form"] for e in train),
    "dev_v1": collections.Counter(TX.form(q["question"], style=q["style"]) for q in dev_v1),
    "dev_v2": collections.Counter(TX.form(q["question"], style=("scenario" if q["style"] == "scenario" else "direct")) for q in dev_v2),
}).fillna(0).astype(int)
display(forms.reindex([f for f in TX.FORMS if f in forms.index]))'''),
("m", "## Point 5 · phrasing: short names, typos, scenarios"),
("c", '''def phrasing(rows, key="question"):
    qs = [r[key] for r in rows]
    full = sum(bool(re.search(r"meridian (arc 110|pulse 125|volt x)", q.lower())) for q in qs)
    return {"n": len(qs), "full official name %": round(100 * full / len(qs)), "short name %": round(100 - 100 * full / len(qs))}
display(pd.DataFrame({"SFT v1": phrasing(v1_train), "SFT v2": phrasing(train), "DPO v2 prompts": phrasing(dpo_prompts),
                      "dev_v1": phrasing(dev_v1), "dev_v2": phrasing(dev_v2)}).T)
print("SFT v2 styles:", dict(collections.Counter(e["style"] for e in train)))'''),
("m", "## Point 2 · trap families: the same words on the answer side and the refuse side\n\nFor each family, one example the model must **answer** and one it must **refuse**. Seeing both teaches the model that a shared word (\"seat\", \"charge\", \"battery\") does not decide the answer; the documents do."),
("c", '''rng = random.Random(0)
rows = []
for trap in sorted({e["trap"] for e in train if e["trap"]}):
    ans = [e for e in train if e["trap"] == trap and e["kind"] == "answer_with_gold_context"]
    ref = [e for e in train if e["trap"] == trap and e["kind"] == "refuse_near_miss"]
    if ans and ref:
        a, r = rng.choice(ans), rng.choice(ref)
        rows.append({"family": trap, "ANSWER this": a["question"], "REFUSE this": r["question"], "refusal": r["answer"]})
with pd.option_context("display.max_colwidth", None):
    display(pd.DataFrame(rows))'''),
("m", "## Point 4 · context policies: gold present, gold removed, no documents\n\n- **rag**: the retrieved chunks; when the question is answerable, the chunk holding the fact is guaranteed to be there, among look-alike chunks from other models.\n- **rag_no_gold**: the same question, but every chunk holding the fact was removed. The right behaviour is a refusal, not a guess from a look-alike chunk.\n- **none**: no documents block (keeps the no-docs condition working)."),
("c", '''print(dict(collections.Counter(e["context"] for e in train)))
e = next(x for x in train if x["context"] == "rag_no_gold" and "price" in x["gold_fact_ids"][0])
print("\\nQuestion:", e["question"])
print("Chunks shown:", [CHUNKS[c]["heading_path"] for c in e["chunk_ids"]])
print("Target answer:", e["answer"])'''),
("m", "## Point 3 · no hedge leak: refusals never start with a fact, answers carry no caveats"),
("c", '''hedge = re.compile(r"(don't|doesn't|do not|does not) (specify|provide|list)|not specified", re.I)
answers = [e for e in train if e["kind"] in ("answer_with_gold_context", "answer_no_context")]
refusals = [e for e in train if e["kind"].startswith("refuse")]
print("answers containing a hedge clause:", sum(bool(hedge.search(e["answer"])) for e in answers), "of", len(answers))
print("refusals that do not begin with 'I don't have':", sum(not e["answer"].startswith("I don't have") for e in refusals), "of", len(refusals))
print("example refusals:")
for e in random.Random(1).sample(refusals, 4): print("  -", e["answer"])'''),
("m", "## Token lengths decide `max_seq_len`\n\nv1 used 512 tokens. With documents in the prompt, that would cut off answers, so the model would learn from broken examples. Notebook 01 computes the limit from the data instead."),
("c", '''lens = []
for e in train + val:
    m = P.messages(e["question"], [CHUNKS[c] for c in e["chunk_ids"]]) + [{"role": "assistant", "content": e["answer"]}]
    lens.append(len(tok.apply_chat_template(m, tokenize=True, return_dict=False)))
s = pd.Series(lens)
print(s.describe().round(0).to_dict())
print("examples longer than v1's 512:", int((s > 512).sum()))
s.plot.hist(bins=40, figsize=(7, 3), title="SFT v2 tokens per example"); plt.tight_layout(); plt.show()'''),
("m", "## Audits and prompt parity\n\nThe builder already enforced these; this cell re-checks them from the files on disk."),
("c", '''print(json.dumps(manifest["audit"], indent=1))
parent_file = setup.path(CFG["final_eval"]["parent_v1_results"]) / "sft__rag_rerank.json"
if parent_file.exists():
    parent = {a["question_id"]: a for a in json.load(open(parent_file))["answers"]}
    same = 0
    for q in dev_v1:
        ids = SNAP["questions"][q["question"]]["rerank"][:3]
        same += ids == parent[q["id"]]["chunk_ids"] and P.sha(P.system_prompt([CHUNKS[c] for c in ids])) == parent[q["id"]]["system_prompt_sha256"]
    print(f"dev_v1 rag_rerank prompts identical to the master evaluation: {same}/{len(dev_v1)}")
else:
    print("Prompt-parity check skipped: run the main lab's notebook 13 first to compare against its saved prompts.")
holdout = setup.read_json(V2_ROOT / CFG["data"]["topic_holdout"])
print("eval topics held out of all training:", len(holdout["dev_v1_topics"]) + len(holdout["dev_v2_topics"]))'''),
("m", "## dev_v2 at a glance\n\n140 questions. Gemini wrote the wording from a spec, so dev_v2 shares no templates with the training data, and no unanswerable topic overlaps with training (only the categories match). Gemini also checked that every unanswerable question is really absent from the five documents."),
("c", '''d2 = pd.DataFrame(dev_v2)
display(pd.crosstab(d2["category"], d2["style"], margins=True))
with pd.option_context("display.max_colwidth", None):
    display(d2.groupby("category").head(2)[["id", "category", "style", "question"]])'''),
("m", """## What this data does not fix, and how to read later results

- **dev_v1 is no longer an independent test** for v2: v2 was designed from dev_v1's failures, e.g. the "on-road charge" synonym. Treat dev_v1 as a regression check and **dev_v2 as the cleaner read**.
- **dev_v2 is independent at the topic level only.** It uses the same 48 facts the model trains on (that is the point of this lab) and the same refusal *categories*.
- **`evals/heldout.json` is still untouched.** Keep it for one final run after all choices are made.
- **The data is templated, not real customer text.** Variety comes from templates, synonyms, short names, typos and scenarios. Expect real traffic to be messier."""),
])

# =====================================================================================
# 01 · SFT
# =====================================================================================
save("01_sft_v2.ipynb", [
("m", """# 01 · SFT v2: train in the same format you serve

**Decision this notebook supports:** if the model is trained on exactly the prompts it will see in use (system prompt + retrieved documents + question), and on near-miss refusals, do the v1 failures go away?

What changes from the main lab's notebook 05:

| | v1 (notebook 05) | v2 (here) |
|---|---|---|
| Prompt | short `SYSTEM`, no documents | the `ENGINEERED` prompt + retrieved chunks, byte-identical to evaluation |
| Data | 995 examples, refusals 94% spec/feature | 1,759 examples, refusals 35% money · 25% policy · rest spec/feature/company |
| Start point | base | base (a clean comparison, not stacked on v1) |
| Max length | 512 (would cut answers) | computed from the data so nothing is cut |
| LoRA | r 16 · α 32 · 7 modules | **same** (so only the data changed) |

Memory: gradient checkpointing is on, and the MPS allocator is capped (`configs/v2.yaml → memory_safety`). If the job runs out of memory you get an error, not a frozen Mac."""),
("c", SETUP),
("m", "## Load the base model\n\nThe original Qwen2.5-0.5B-Instruct in float32, the same precision as every v1 run."),
("c", '''import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
DEVICE, DTYPE = D.device(), D.dtype()
tok = AutoTokenizer.from_pretrained(D.base_model_path())
if tok.pad_token is None:
    tok.pad_token = tok.eos_token
model = AutoModelForCausalLM.from_pretrained(D.base_model_path(), dtype=DTYPE).to(DEVICE)
print(f"{sum(p.numel() for p in model.parameters())/1e6:.0f}M parameters on {DEVICE}")
D.memory_report("base loaded")'''),
("m", "## Turn each example into tokens, and score only the answer\n\nThe chat template renders system + user + assistant. Everything up to and including `<|im_start|>assistant` gets the label `-100`, so it is ignored by the loss; only the answer (and its end marker) is learned.\n\nThe assert checks that the prompt tokens are an exact prefix of the full conversation, which is what makes this masking correct."),
("c", '''train_rows = setup.read_jsonl(V2_ROOT / CFG["data"]["sft_train"])
val_rows = setup.read_jsonl(V2_ROOT / CFG["data"]["sft_val"])

def encode(e):
    msgs = P.messages(e["question"], [CHUNKS[c] for c in e["chunk_ids"]])
    prompt_ids = tok.apply_chat_template(msgs, tokenize=True, add_generation_prompt=True, return_dict=False)
    full_ids = tok.apply_chat_template(msgs + [{"role": "assistant", "content": e["answer"]}], tokenize=True, return_dict=False)
    assert full_ids[:len(prompt_ids)] == prompt_ids, "prompt must be an exact prefix"
    labels = [-100] * len(prompt_ids) + full_ids[len(prompt_ids):]
    return {"input_ids": full_ids, "attention_mask": [1] * len(full_ids), "labels": labels}

for name, e in [("RAG answer", next(x for x in train_rows if x["kind"] == "answer_with_gold_context")),
                ("near-miss refusal", next(x for x in train_rows if x["kind"] == "refuse_near_miss"))]:
    enc = encode(e)
    scored = [t for t in enc["labels"] if t != -100]
    print(f"{name}: {len(enc['input_ids'])} tokens, {len(scored)} scored")
    print("   scored text:", repr(tok.decode(scored)))'''),
("m", "## Set `max_seq_len` from the data\n\nRound the longest example up to a multiple of 64, then assert that no example is longer. An answer cut off at the end would teach the model half-sentences."),
("c", '''train_enc = [encode(e) for e in train_rows]
val_enc = [encode(e) for e in val_rows]
longest = max(len(x["input_ids"]) for x in train_enc + val_enc)
MAX_LEN = int(math.ceil(longest / 64) * 64) if CFG["sft"]["max_seq_len"] == "auto" else int(CFG["sft"]["max_seq_len"])
assert all(len(x["input_ids"]) <= MAX_LEN for x in train_enc + val_enc), "an example would be truncated"
print(f"longest example {longest} tokens -> max_seq_len {MAX_LEN} (v1 used 512)")
print(f"train {len(train_enc)} | validation {len(val_enc)}")'''),
("c", '''from torch.utils.data import Dataset

class Rows(Dataset):
    def __init__(self, rows): self.rows = rows
    def __len__(self): return len(self.rows)
    def __getitem__(self, i): return self.rows[i]

def collate(batch):
    n = max(len(b["input_ids"]) for b in batch)
    pad = tok.pad_token_id
    return {"input_ids": torch.tensor([b["input_ids"] + [pad] * (n - len(b["input_ids"])) for b in batch]),
            "attention_mask": torch.tensor([b["attention_mask"] + [0] * (n - len(b["attention_mask"])) for b in batch]),
            "labels": torch.tensor([b["labels"] + [-100] * (n - len(b["labels"])) for b in batch])}

train_ds, val_ds = Rows(train_enc), Rows(val_enc)
b = collate([train_enc[0], train_enc[1]])
print({k: tuple(v.shape) for k, v in b.items()}, "| padded labels ignored:", bool((b["labels"][b["attention_mask"] == 0] == -100).all()))'''),
("m", "## Attach LoRA (same settings as v1)\n\nOnly the small adapter matrices train; the 494M base weights stay frozen."),
("c", '''from peft import LoraConfig, get_peft_model
lc = CFG["lora"]
peft_cfg = LoraConfig(r=lc["r"], lora_alpha=lc["alpha"], lora_dropout=lc["dropout"],
                      target_modules=lc["target_modules"], task_type="CAUSAL_LM")
model = get_peft_model(model, peft_cfg)
model.print_trainable_parameters()'''),
("m", """## Compute the loss only where it counts

A causal LM normally produces a score for **every** vocabulary word (151,936 for Qwen) at **every** position: about 650 positions × 152k × 4 bytes ≈ 400 MB per example, before gradients. The first attempt at this notebook hit the memory cap exactly there.

But only the answer positions are scored; every other label is `-100` and contributes nothing. So we ask the model for logits **only at the positions whose next token is scored** (`logits_to_keep`), then take the same cross-entropy. The loss is mathematically identical, as the next cell checks on a real example, and memory falls by about 15×."""),
("c", '''import torch.nn.functional as Fn
from transformers import Trainer

def answer_only_loss(m, batch, num_items_in_batch=None):
    labels = batch["labels"]
    shift = labels[:, 1:]                                   # token t+1 is predicted at position t
    keep = (shift != -100).any(dim=0).nonzero().squeeze(-1)  # positions whose next token is scored
    out = m(input_ids=batch["input_ids"], attention_mask=batch["attention_mask"], logits_to_keep=keep)
    logits = out.logits.float()                            # [batch, len(keep), vocab]
    target = shift[:, keep]
    loss_sum = Fn.cross_entropy(logits.reshape(-1, logits.shape[-1]), target.reshape(-1), ignore_index=-100, reduction="sum")
    n = num_items_in_batch if num_items_in_batch is not None else (target != -100).sum()
    return loss_sum / n

class AnswerOnlyTrainer(Trainer):
    def compute_loss(self, model, inputs, return_outputs=False, num_items_in_batch=None):
        loss = answer_only_loss(model, inputs, num_items_in_batch)
        return (loss, {"loss": loss}) if return_outputs else loss

# Equivalence check on one real example: full logits + HF loss vs answer-only logits.
probe = collate([train_enc[0]])
probe = {k: v.to(DEVICE) for k, v in probe.items()}
with torch.no_grad():
    full = model(**probe).loss
    mine = answer_only_loss(model, probe)
print(f"HF full-logits loss {full.item():.6f} | answer-only loss {mine.item():.6f} | difference {abs(full.item() - mine.item()):.2e}")
assert abs(full.item() - mine.item()) < 1e-4'''),
("m", "## Training settings\n\nEffective batch = batch 2 × accumulation 4 = 8 examples per weight update, as in v1. Gradient checkpointing recomputes activations during the backward pass instead of storing them, trading some speed for a much smaller memory peak."),
("c", '''from transformers import Trainer, TrainingArguments
c = CFG["sft"]
args = TrainingArguments(
    output_dir=str(V2_ROOT / "runs/sft_v2_trainer"), num_train_epochs=c["epochs"], learning_rate=c["lr"],
    per_device_train_batch_size=c["batch_size"], per_device_eval_batch_size=c["batch_size"],
    gradient_accumulation_steps=c["grad_accum"], warmup_steps=c["warmup_ratio"],
    gradient_checkpointing=c["gradient_checkpointing"], gradient_checkpointing_kwargs={"use_reentrant": False},
    logging_steps=10, eval_strategy="epoch", save_strategy="no", report_to=[], seed=CFG["seed"],
    dataloader_num_workers=0, prediction_loss_only=True)
steps_per_epoch = math.ceil(len(train_ds) / (c["batch_size"] * c["grad_accum"]))
print(f"{steps_per_epoch} weight updates per epoch, {steps_per_epoch * c['epochs']} in total")
trainer = AnswerOnlyTrainer(model=model, args=args, train_dataset=train_ds, eval_dataset=val_ds, data_collator=collate)'''),
("m", "## Train\n\nThis is the long cell. On this Mac, expect roughly 35–60 minutes."),
("c", '''t0 = time.time()
result = trainer.train()
train_minutes = (time.time() - t0) / 60
print(result.metrics)
print(f"training took {train_minutes:.1f} minutes")
D.memory_report("after training")'''),
("m", "## Loss curves\n\nTraining loss should fall smoothly. Validation loss is measured on held-out templates and **held-out refusal topics**, so a gap tells you how much is memorised phrasing rather than transferable behaviour."),
("c", '''import pandas as pd
import matplotlib.pyplot as plt
hist = pd.DataFrame(trainer.state.log_history)
fig, ax = plt.subplots(figsize=(8, 3.5))
hist.dropna(subset=["loss"]).plot(x="step", y="loss", ax=ax, label="train loss")
if "eval_loss" in hist:
    hist.dropna(subset=["eval_loss"]).plot(x="step", y="eval_loss", ax=ax, marker="o", label="validation loss")
ax.set_title("SFT v2"); plt.tight_layout(); plt.show()
display(hist.dropna(subset=["eval_loss"])[["epoch", "step", "eval_loss"]] if "eval_loss" in hist else hist.tail())'''),
("m", "## Save the adapter and the run record"),
("c", '''out = V2_ROOT / CFG["sft"]["output_adapter"]
model.save_pretrained(str(out))
data_sha = {n: hashlib.sha256((V2_ROOT / CFG["data"][k]).read_bytes()).hexdigest() for n, k in [("train", "sft_train"), ("val", "sft_val")]}
setup.write_json(V2_ROOT / "runs/sft_v2.json", {
    "metrics": result.metrics, "train_minutes": round(train_minutes, 1), "max_seq_len": MAX_LEN,
    "log_history": trainer.state.log_history, "config": CFG["sft"], "lora": CFG["lora"],
    "n_train": len(train_ds), "n_val": len(val_ds), "data_sha256": data_sha, "device": DEVICE, "dtype": str(DTYPE),
    "saved_at": time.strftime("%Y-%m-%d %H:%M:%S")})
print("saved", out.relative_to(V2_ROOT), "and runs/sft_v2.json")'''),
("m", "## Quick look: answers on held-out validation prompts\n\nGreedy decoding, the same settings as the final evaluation. Four should be answered, four refused (two of them on refusal topics the model never trained on)."),
("c", '''model.eval()
def generate(m, question, chunk_ids, max_new_tokens=160):
    ids = tok.apply_chat_template(P.messages(question, [CHUNKS[c] for c in chunk_ids]), tokenize=True,
                                  add_generation_prompt=True, return_dict=False)
    x = torch.tensor([ids], device=DEVICE)
    with torch.inference_mode():
        out = m.generate(input_ids=x, attention_mask=torch.ones_like(x), max_new_tokens=max_new_tokens,
                         do_sample=False, num_beams=1, pad_token_id=tok.pad_token_id)
    return tok.decode(out[0, x.shape[1]:], skip_special_tokens=True).strip()

rng = random.Random(3)
picks = rng.sample([e for e in val_rows if e["kind"] == "answer_with_gold_context"], 4) + \\
        rng.sample([e for e in val_rows if e["kind"] == "refuse_near_miss"], 2) + \\
        rng.sample([e for e in val_rows if e["kind"] == "refuse_gold_removed"], 2)
for e in picks:
    print(f"[{e['kind']}] {e['question']}\\n   model : {generate(model, e['question'], e['chunk_ids'])}\\n   target: {e['answer']}\\n")
D.memory_report("end")'''),
])

# The SFT v2 evaluation section (four conditions) lives in scripts/sft_eval_cells.py and is appended to notebook 01.
sys.path.insert(0, str(ROOT / "scripts"))
from sft_eval_cells import CELLS as SFT_EVAL_CELLS  # noqa: E402
if len(sys.argv) == 1 or "01_sft_v2.ipynb" in sys.argv[1:]:
    _b = nbf.read(str(ROOT / "notebooks/01_sft_v2.ipynb"), as_version=4)
    if not any("sft-eval-section" in "".join(c.source) for c in _b.cells):
        for kind, src in SFT_EVAL_CELLS:
            _b.cells.append(nbf.v4.new_markdown_cell(src) if kind == "m" else nbf.v4.new_code_cell(src))
        nbf.write(_b, str(ROOT / "notebooks/01_sft_v2.ipynb"))

# =====================================================================================
# 02 · DPO pairs
# =====================================================================================
save("02_dpo_pairs_v2.ipynb", [
("m", """# 02 · DPO pairs from the model's own mistakes

**Decision this notebook supports:** DPO only teaches something when the "rejected" side is a mistake the model would really make. v1's rejected answers were absurd ("Around 18,000 units were delivered"), so the model already avoided them, and DPO changed 2 of 280 answers.

Here: run SFT v2 on 600 fresh prompts in the serving format, collect its real failures, have Gemini confirm them, and pair each with the correct response.

| prompt type | the model fails when it... | chosen |
|---|---|---|
| answer with gold context (look-alike chunks present) | gives another model's or city's value, refuses, or adds an invented caveat | the correct fact sentence |
| near-miss unanswerable | invents an answer, or refuses but adds an invented detail | a clean refusal |
| gold chunk removed | states a **wrong** value (a correct memorised value is not punished) | a clean refusal |"""),
("c", SETUP),
("c", '''prompts = setup.read_jsonl(V2_ROOT / CFG["data"]["dpo_prompts"])
print(len(prompts), "prompts |", dict(collections.Counter(p["kind"] for p in prompts)), "|", dict(collections.Counter(p["split"] for p in prompts)))'''),
("m", "## Load SFT v2 (base + adapter)"),
("c", '''import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel
DEVICE, DTYPE = D.device(), D.dtype()
tok = AutoTokenizer.from_pretrained(D.base_model_path())
base = AutoModelForCausalLM.from_pretrained(D.base_model_path(), dtype=DTYPE).to(DEVICE)
model = PeftModel.from_pretrained(base, str(V2_ROOT / CFG["sft"]["output_adapter"])).to(DEVICE).eval()
D.memory_report("SFT v2 loaded")'''),
("m", "## Generate: one greedy answer + three sampled answers per prompt\n\nGreedy shows what the model does by default. Sampling at temperature 0.8 shows which mistakes are *nearby*, which DPO can push down. Results are saved after every prompt, so an interrupted run resumes where it stopped."),
("c", '''GEN_PATH = V2_ROOT / "runs/dpo_pairs/generations.jsonl"
GEN_PATH.parent.mkdir(parents=True, exist_ok=True)
done = {r["id"]: r for r in setup.read_jsonl(GEN_PATH)} if GEN_PATH.exists() else {}
d = CFG["dpo"]

def prompt_ids(p):
    return tok.apply_chat_template(P.messages(p["question"], [CHUNKS[c] for c in p["chunk_ids"]]), tokenize=True,
                                   add_generation_prompt=True, return_dict=False)

t0 = time.time()
with GEN_PATH.open("a") as fh:
    for i, p in enumerate(prompts):
        if p["id"] in done:
            continue
        x = torch.tensor([prompt_ids(p)], device=DEVICE)
        with torch.inference_mode():
            g = model.generate(input_ids=x, attention_mask=torch.ones_like(x), max_new_tokens=CFG["generation"]["max_new_tokens"],
                               do_sample=False, num_beams=1, pad_token_id=tok.pad_token_id)
            torch.manual_seed(CFG["seed"] + i)
            s = model.generate(input_ids=x, attention_mask=torch.ones_like(x), max_new_tokens=CFG["generation"]["max_new_tokens"],
                               do_sample=True, temperature=d["sample_temperature"], top_p=1.0,
                               num_return_sequences=d["samples_per_prompt"], pad_token_id=tok.pad_token_id)
        outs = [tok.decode(g[0, x.shape[1]:], skip_special_tokens=True).strip()] + \\
               [tok.decode(s[j, x.shape[1]:], skip_special_tokens=True).strip() for j in range(s.shape[0])]
        row = {"id": p["id"], "answers": outs, "sources": ["greedy"] + ["sample"] * (len(outs) - 1)}
        fh.write(json.dumps(row, ensure_ascii=False) + "\\n"); fh.flush()
        done[p["id"]] = row
        if len(done) % 25 == 0:
            setup.progress("02_dpo_pairs", f"generated {len(done)}/{len(prompts)} prompts | {(time.time()-t0)/60:.1f} min")
        if len(done) % 100 == 0:
            print(f"{len(done)}/{len(prompts)} prompts | {(time.time()-t0)/60:.1f} min"); D.memory_report()
print(f"generations ready for {len(done)} prompts")'''),
("m", """## Round 2 · sample more widely

SFT v2 is already right on most of these prompts, so round 1 alone yields few real failures. Round 2 draws four more answers per prompt at temperature 1.0. They are still the model's **own** answers, just less conservative, and they surface the mistakes it is close to making. When a prompt has several failures, the pair builder prefers greedy over T=0.8 over T=1.0."""),
("c", '''R2_PATH = V2_ROOT / "runs/dpo_pairs/generations_round2.jsonl"
done2 = {r["id"]: r for r in setup.read_jsonl(R2_PATH)} if R2_PATH.exists() else {}
t0 = time.time()
with R2_PATH.open("a") as fh:
    for i, p in enumerate(prompts):
        if p["id"] in done2:
            continue
        x = torch.tensor([prompt_ids(p)], device=DEVICE)
        torch.manual_seed(10_000 + CFG["seed"] + i)
        with torch.inference_mode():
            s = model.generate(input_ids=x, attention_mask=torch.ones_like(x), max_new_tokens=CFG["generation"]["max_new_tokens"],
                               do_sample=True, temperature=d["round2_temperature"], top_p=1.0,
                               num_return_sequences=d["round2_samples"], pad_token_id=tok.pad_token_id)
        outs = [tok.decode(s[j, x.shape[1]:], skip_special_tokens=True).strip() for j in range(s.shape[0])]
        row = {"id": p["id"], "answers": outs, "sources": ["sample_t1.0"] * len(outs)}
        fh.write(json.dumps(row, ensure_ascii=False) + "\\n"); fh.flush()
        done2[p["id"]] = row
        if len(done2) % 50 == 0:
            setup.progress("02_dpo_pairs", f"round 2: {len(done2)}/{len(prompts)} prompts | {(time.time()-t0)/60:.1f} min")
for pid, row in done2.items():
    if pid in done and len(done[pid]["answers"]) == 1 + d["samples_per_prompt"]:
        done[pid] = {"id": pid, "answers": done[pid]["answers"] + row["answers"], "sources": done[pid]["sources"] + row["sources"]}
print(f"round 2 ready for {len(done2)} prompts; answers per prompt now {len(next(iter(done.values()))['answers'])}")'''),
("m", "## First pass: deterministic checks\n\nFast rules decide which answers *might* be failures:\n- answerable: does the answer contain the gold value? Does it refuse? Does it add a \"documents don't specify\" hedge?\n- unanswerable: does it refuse? Does it state numbers that are not in the question?\n\nOnly the suspected failures go to Gemini."),
("c", '''from src import lab
REFUSAL = re.compile(r"i don't have|i do not have|not in (the|meridian's)( official)? documents|isn't listed|not listed|don't cover|not specified|no information", re.I)
HEDGE = re.compile(r"(don't|doesn't|do not|does not) (specify|provide|list|mention)|not specified|isn't specified", re.I)
PIDX = {p["id"]: p for p in prompts}

def nums(text):
    return F.numbers_in(re.sub(r"(Arc|Pulse) (110|125)", "", text))

def has_value(answer, fact):
    if isinstance(fact["value"], str):
        return all(c.strip().lower() in answer.lower() for c in fact["value"].split(","))
    return lab.contains_value(answer, fact["value"], fact.get("unit"))

def first_pass(p, a):
    a2 = a.replace("’", "'")
    refused = bool(REFUSAL.search(a2))
    if p["kind"] in ("answer_with_gold_context", "refuse_gold_removed"):
        f = F.FIDX[p["gold_fact_ids"][0]]
        gold = has_value(a2, f)
        if p["kind"] == "refuse_gold_removed":
            return "ok" if refused or gold else "suspect_wrong_value"
        if gold and not refused:
            return "suspect_caveat" if HEDGE.search(a2) else "ok"
        return "suspect_over_refusal" if refused and not gold else "suspect_wrong_value"
    extra = [n for n in nums(a2) if n not in nums(p["question"])]
    if refused and not extra:
        return "ok"
    return "suspect_refused_with_invented" if refused else "suspect_invented"

checks = []
for pid, row in done.items():
    for a, src in zip(row["answers"], row["sources"]):
        checks.append({"id": pid, "answer": a, "source": src, "first_pass": first_pass(PIDX[pid], a)})
cdf = __import__("pandas").DataFrame(checks)
display(cdf.groupby(["first_pass", "source"]).size().unstack(fill_value=0))'''),
("m", "## Second pass: Gemini confirms each suspected failure\n\nThe judge is first checked on 60 answers with known labels; it must agree on at least 90% or the notebook stops. Identical answers to the same prompt are judged once."),
("c", '''from v2lib import judge as J, gemini_io as G
cal = setup.read_json(V2_ROOT / CFG["data"]["judge_calibration"])
cal_res = J.judge(cal, purpose="judge_calibration", cap=CFG["judge"]["max_api_calls"]["dpo_pairs"])
agree = sum(cal_res[it["id"]]["label"] == it["expected"] for it in cal) / len(cal)
print(f"judge calibration agreement: {agree:.1%}")
assert agree >= CFG["judge"]["calibration_min_agreement"], "judge failed calibration: stop and inspect"

suspects = {}
for c in checks:
    if c["first_pass"] != "ok":
        suspects.setdefault((c["id"], c["answer"]), c)
items = []
for (pid, a), c in suspects.items():
    p = PIDX[pid]
    answerable = p["kind"] in ("answer_with_gold_context", "refuse_gold_removed")
    items.append({"id": hashlib.sha256((pid + a).encode()).hexdigest()[:16], "pid": pid, "question": p["question"],
                  "answerable": answerable, "gold": J.gold_for(F.FIDX[p["gold_fact_ids"][0]]) if answerable else None,
                  "answer": a, "truncated": False})
print(len(items), "distinct suspected failures to confirm")
setup.progress("02_dpo_pairs", f"judging {len(items)} suspected failures")
verdicts = J.judge(items, purpose="dpo_failure_check", cap=CFG["judge"]["max_api_calls"]["dpo_pairs"])
print(G.stats())'''),
("m", "## Build the pairs\n\nA failure is **confirmed** only when Gemini agrees: wrong value, invented answer, refusal with an invented fact, or an unsupported caveat. For answerable prompts, an over-refusal is also a failure, because the answer was in the documents. For gold-removed prompts, only a wrong value counts.\n\nOne pair per prompt, preferring the greedy answer's failure (the model's default behaviour)."),
("c", '''FAIL = {"answer_with_gold_context": {"wrong_value", "correct_with_unsupported_caveat", "refused", "off_topic"},
        "refuse_gold_removed": {"wrong_value"},
        "refuse_near_miss": {"invented_answer", "refused_with_invented_fact", "off_topic"}}
confirmed = collections.defaultdict(list)
for it in items:
    v = verdicts[it["id"]]
    p = PIDX[it["pid"]]
    if v["label"] in FAIL[p["kind"]]:
        src = suspects[(it["pid"], it["answer"])]["source"]
        confirmed[it["pid"]].append({"answer": it["answer"], "label": v["label"], "source": src, "rationale": v["rationale"]})

pairs = []
for pid, fails in confirmed.items():
    p = PIDX[pid]
    best = sorted(fails, key=lambda f: {"greedy": 0, "sample": 1}.get(f["source"], 2))[0]
    if best["answer"].strip() == p["answer"].strip():
        continue
    pairs.append({"id": pid, "kind": p["kind"], "question": p["question"], "chunk_ids": p["chunk_ids"], "split": p["split"],
                  "chosen": p["answer"], "rejected": best["answer"], "failure": best["label"], "rejected_source": best["source"]})
real = len(pairs)
print(f"real-failure pairs: {real} | prompts with no confirmed failure: {len(prompts) - len(confirmed)}")
print(dict(collections.Counter(p["failure"] for p in pairs)))'''),
("m", "## Top up only if needed: plausible look-alike rejects\n\nIf fewer than the configured minimum of real failures exist, add rejects that use **another model's or city's real value** (the binding mistake seen in v1), capped at 30% of the pairs and flagged `synthetic_lookalike`. No absurd or off-topic rejects."),
("c", '''need = max(0, d["min_real_pairs"] - real)
share = d["max_synthetic_share"]
cap = int(real * share / (1 - share))          # synthetic / (real + synthetic) <= share
added = 0
used = {p["id"] for p in pairs}
for p in prompts:
    if added >= min(need, cap):
        break
    if p["id"] in used or p["kind"] != "answer_with_gold_context":
        continue
    f = F.FIDX[p["gold_fact_ids"][0]]
    others = [g for g in F.FACTS if g["attribute"] == f["attribute"] and g["value"] != f["value"]]
    if not others or isinstance(f["value"], str) or f["id"] == "110_fast_charge_minutes":
        continue   # the Arc fast-charge sentence never states a number, so a value swap would not change it
    fake = dict(f, value=random.Random(p["id"]).choice(others)["value"])
    if F.answer_sentence(fake, 0).strip() == p["answer"].strip():
        continue
    pairs.append({"id": p["id"], "kind": p["kind"], "question": p["question"], "chunk_ids": p["chunk_ids"], "split": p["split"],
                  "chosen": p["answer"], "rejected": F.answer_sentence(fake, 0), "failure": "wrong_value", "rejected_source": "synthetic_lookalike"})
    added += 1
print(f"synthetic look-alike pairs added: {added} (cap {cap}; share of final set {added / max(1, real + added):.0%})")'''),
("m", "## Checks, then save"),
("c", '''for p in pairs:
    assert p["chosen"].strip() != p["rejected"].strip()
    assert not re.search(r"(?<![\\d,.])0 minutes", p["chosen"])
train_pairs = [p for p in pairs if p["split"] == "train"]
val_pairs = [p for p in pairs if p["split"] == "val"]
setup.write_jsonl(V2_ROOT / CFG["data"]["dpo_train"], train_pairs)
setup.write_jsonl(V2_ROOT / CFG["data"]["dpo_val"], val_pairs)
summary = {"prompts": len(prompts), "real_pairs": real, "synthetic_pairs": added, "train": len(train_pairs), "val": len(val_pairs),
           "by_failure": dict(collections.Counter(p["failure"] for p in pairs)), "by_kind": dict(collections.Counter(p["kind"] for p in pairs)),
           "by_source": dict(collections.Counter(p["rejected_source"] for p in pairs)),
           "val_by_kind": dict(collections.Counter(p["kind"] for p in val_pairs)), "gemini": G.stats(),
           "saved_at": time.strftime("%Y-%m-%d %H:%M:%S")}
setup.write_json(V2_ROOT / "runs/dpo_pairs/summary.json", summary)
print(json.dumps(summary, indent=1))'''),
("c", '''import pandas as pd
with pd.option_context("display.max_colwidth", None):
    display(pd.DataFrame(pairs).groupby("failure").head(2)[["failure", "question", "chosen", "rejected"]])
del model, base
D.empty_cache(); D.memory_report("released")'''),
])

# =====================================================================================
# 03 · DPO
# =====================================================================================
save("03_dpo_v2.ipynb", [
("m", """# 03 · DPO v2, with the reference model fixed

**Decision this notebook supports:** does preference training on the model's own mistakes reduce them, without moving the model away from what SFT v2 learned?

**The v1 bug fixed here.** v1 kept training the SFT adapter in place and passed no reference model. With PEFT, TRL then uses "the model with its adapter switched off" as the reference, which was **plain base Qwen, not SFT**. DPO's KL leash pointed at the wrong model.

v2 does it properly:
1. Merge the SFT v2 adapter into the base weights, giving a full "SFT v2" model on disk.
2. Train a **new** LoRA on top of that merged model.
3. The reference is now "merged model, new adapter off" = **SFT v2 exactly**. A cell below proves it numerically.

Prompts are in the serving format (ENGINEERED + documents + question), not v1's short `SYSTEM` prompt."""),
("c", SETUP),
("m", "## Step 1 · merge SFT v2 into a full model"),
("c", '''import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel
DEVICE, DTYPE = D.device(), D.dtype()
tok = AutoTokenizer.from_pretrained(D.base_model_path())
MERGED = V2_ROOT / CFG["dpo"]["merged_sft_model"]
base = AutoModelForCausalLM.from_pretrained(D.base_model_path(), dtype=DTYPE).to(DEVICE)
sft = PeftModel.from_pretrained(base, str(V2_ROOT / CFG["sft"]["output_adapter"])).to(DEVICE).eval()
probe = tok.apply_chat_template(P.messages("What's the Volt X's top speed?", None), tokenize=True, add_generation_prompt=True, return_dict=False)
x = torch.tensor([probe], device=DEVICE)
with torch.inference_mode():
    sft_logits = sft(input_ids=x).logits[0, -1].float().cpu()
merged = sft.merge_and_unload()
merged.save_pretrained(str(MERGED)); tok.save_pretrained(str(MERGED))
with torch.inference_mode():
    merged_logits = merged(input_ids=x).logits[0, -1].float().cpu()
print("max |logit difference| SFT adapter vs merged model:", float((sft_logits - merged_logits).abs().max()))
del sft, merged, base
D.empty_cache(); D.memory_report("merged saved")'''),
("m", "## Step 2 · the preference data, in the serving format"),
("c", '''from datasets import Dataset
pairs_train = setup.read_jsonl(V2_ROOT / CFG["data"]["dpo_train"])
pairs_val = setup.read_jsonl(V2_ROOT / CFG["data"]["dpo_val"])
print(len(pairs_train), "train pairs |", len(pairs_val), "validation pairs")
print("train failures:", dict(collections.Counter(p["failure"] for p in pairs_train)))

def to_ds(rows):
    return Dataset.from_list([{
        "prompt": P.messages(r["question"], [CHUNKS[c] for c in r["chunk_ids"]]),
        "chosen": [{"role": "assistant", "content": r["chosen"]}],
        "rejected": [{"role": "assistant", "content": r["rejected"]}]} for r in rows])

train_ds, val_ds = to_ds(pairs_train), to_ds(pairs_val)
def full_len(r, side):
    m = P.messages(r["question"], [CHUNKS[c] for c in r["chunk_ids"]]) + [{"role": "assistant", "content": r[side]}]
    return len(tok.apply_chat_template(m, tokenize=True, return_dict=False))
longest = max(full_len(r, s) for r in pairs_train + pairs_val for s in ("chosen", "rejected"))
MAX_LEN = int(math.ceil((longest + 8) / 64) * 64)
print(f"longest prompt+response {longest} tokens -> max_length {MAX_LEN} (nothing is truncated)")'''),
("m", "## Step 3 · new LoRA on the merged model; reference = SFT v2\n\n`beta` is the leash: higher keeps the policy closer to SFT v2. The learning rate is 40× smaller than SFT's, because DPO only nudges probabilities that are already shaped."),
("c", '''from trl import DPOTrainer, DPOConfig
from peft import LoraConfig
d, lc = CFG["dpo"], CFG["lora"]
policy = AutoModelForCausalLM.from_pretrained(str(MERGED), dtype=DTYPE).to(DEVICE)
dpo_args = DPOConfig(
    output_dir=str(V2_ROOT / "runs/dpo_v2_trainer"), beta=d["beta"], loss_type=d["loss_type"],
    num_train_epochs=d["epochs"], learning_rate=d["lr"], per_device_train_batch_size=d["batch_size"],
    per_device_eval_batch_size=1, gradient_accumulation_steps=d["grad_accum"], max_length=MAX_LEN,
    truncation_mode="keep_start", precompute_ref_log_probs=True, gradient_checkpointing=d["gradient_checkpointing"],
    gradient_checkpointing_kwargs={"use_reentrant": False}, logging_steps=5, eval_strategy="epoch",
    save_strategy="no", report_to=[], seed=CFG["seed"])
peft_cfg = LoraConfig(r=lc["r"], lora_alpha=lc["alpha"], lora_dropout=lc["dropout"],
                      target_modules=lc["target_modules"], task_type="CAUSAL_LM")
from transformers import TrainerCallback
class ProgressLog(TrainerCallback):
    def on_log(self, args, state, control, logs=None, **kw):
        keep = {k: round(v, 4) for k, v in (logs or {}).items() if isinstance(v, (int, float)) and ("loss" in k or "margins" in k or "accuracies" in k)}
        setup.progress("03_dpo", f"step {state.global_step}/{state.max_steps} {keep}")
trainer = DPOTrainer(model=policy, ref_model=None, args=dpo_args, train_dataset=train_ds, eval_dataset=val_ds,
                     processing_class=tok, peft_config=peft_cfg, callbacks=[ProgressLog()])
# Proof the reference is SFT v2: with the new adapter disabled, the policy equals the merged SFT model.
x = torch.tensor([probe], device=DEVICE)
check = AutoModelForCausalLM.from_pretrained(str(MERGED), dtype=DTYPE).to(DEVICE).eval()
with torch.inference_mode():
    with trainer.model.disable_adapter():
        ref_logits = trainer.model(input_ids=x).logits[0, -1].float().cpu()
    sft_v2_logits = check(input_ids=x).logits[0, -1].float().cpu()
print("reference vs merged SFT v2, max |logit difference|:", float((ref_logits - sft_v2_logits).abs().max()))
del check; D.empty_cache(); D.memory_report("trainer ready")'''),
("m", "## Train\n\nWatch `rewards/margins` (chosen minus rejected) and `rewards/accuracies` on the **validation** pairs. They rise only if the model's preference really moved."),
("c", '''t0 = time.time()
result = trainer.train()
dpo_minutes = (time.time() - t0) / 60
print(result.metrics); print(f"DPO took {dpo_minutes:.1f} minutes")
D.memory_report("after DPO")'''),
("c", '''import pandas as pd
import matplotlib.pyplot as plt
hist = pd.DataFrame(trainer.state.log_history)
cols = [c for c in ["rewards/margins", "rewards/accuracies", "loss"] if c in hist]
fig, axes = plt.subplots(1, len(cols), figsize=(4 * len(cols), 3))
for ax, col in zip(axes, cols):
    hist.dropna(subset=[col]).plot(x="step", y=col, ax=ax, legend=False, title=col)
plt.tight_layout(); plt.show()
ev = hist[[c for c in hist.columns if c.startswith("eval_")] + ["epoch"]].dropna(how="all", subset=[c for c in hist.columns if c.startswith("eval_")])
display(ev)'''),
("m", "## Save, then compare SFT v2 and DPO v2 on validation prompts"),
("c", '''out = V2_ROOT / d["output_adapter"]
trainer.model.save_pretrained(str(out))
setup.write_json(V2_ROOT / "runs/dpo_v2.json", {"metrics": result.metrics, "minutes": round(dpo_minutes, 1), "max_length": MAX_LEN,
    "n_train": len(train_ds), "n_val": len(val_ds), "config": d, "reference": "merged SFT v2 (new adapter disabled)",
    "log_history": trainer.state.log_history, "saved_at": time.strftime("%Y-%m-%d %H:%M:%S")})
print("saved", out.relative_to(V2_ROOT))

model = trainer.model.eval()
def generate(question, chunk_ids, use_adapter=True):
    ids = tok.apply_chat_template(P.messages(question, [CHUNKS[c] for c in chunk_ids]), tokenize=True, add_generation_prompt=True, return_dict=False)
    x = torch.tensor([ids], device=DEVICE)
    with torch.inference_mode():
        if use_adapter:
            o = model.generate(input_ids=x, attention_mask=torch.ones_like(x), max_new_tokens=160, do_sample=False, pad_token_id=tok.pad_token_id)
        else:
            with model.disable_adapter():
                o = model.generate(input_ids=x, attention_mask=torch.ones_like(x), max_new_tokens=160, do_sample=False, pad_token_id=tok.pad_token_id)
    return tok.decode(o[0, x.shape[1]:], skip_special_tokens=True).strip()

for r in pairs_val[:8]:
    print(f"[{r['failure']}] {r['question']}\\n   SFT v2 : {generate(r['question'], r['chunk_ids'], False)}\\n   DPO v2 : {generate(r['question'], r['chunk_ids'], True)}\\n   chosen : {r['chosen']}\\n")
del model, trainer, policy
D.empty_cache(); D.memory_report("released")'''),
])

# =====================================================================================
# 04 · final eval
# =====================================================================================
save("04_final_eval_v2.ipynb", [
("m", """# 04 · Final evaluation with Gemini as the ruler

**Decision this notebook supports:** did v2 fix refusals without breaking accuracy, and is it at your bar (≥80% accuracy, ≤10% hallucination, ≥80% correct refusals, ≤15% over-refusal)?

| | |
|---|---|
| Models | base · SFT v1 · SFT+DPO v1 (main-lab adapters from notebooks 05 and 06) · SFT v2 · SFT v2 + DPO v2 |
| Conditions | `engineered` (no documents) · `rag_rerank` (3 retrieved chunks) · `oracle` (only the right chunk) · `rag_no_gold` (right chunk removed, a retrieval miss) |
| Eval sets | dev_v1 (50, now dev-informed: a regression check) · **dev_v2 (140, the cleaner read)** |
| Scoring | Gemini judge with a fixed rubric (primary), plus the v1 keyword scorer for continuity |

Generation matches the main lab's master evaluation (notebook 13) exactly: greedy, 160 new tokens, float32, the same prompt text. **Truncated answers are scored, not dropped.** The v1 models' dev_v1 answers are reused from the master evaluation (main-lab notebook 13) only when the prompt and settings are byte-identical; otherwise they are generated."""),
("c", SETUP),
("m", "## Eval sets, conditions and the plan"),
("c", '''import pandas as pd
EVAL = {"dev_v1": setup.read_json(setup.path(CFG["data"]["dev_v1"])), "dev_v2": setup.read_json(V2_ROOT / CFG["data"]["dev_v2"])}
FE = CFG["final_eval"]
BAR = setup.read_json(setup.path(FE["bar_path"]))["bar"] if setup.path(FE["bar_path"]).exists() else FE["bar_default"]
print("bar:", BAR)

def chunks_for(q, condition):
    if condition == "engineered":
        return []
    ranked = SNAP["questions"][q["question"]]["rerank"]
    if condition == "rag_rerank":
        return ranked[:3]
    gold = [c for c in sorted(CHUNKS) if q["answerable"] and q["fact_id"] in CHUNKS[c]["fact_ids"]]
    if condition == "oracle":
        return gold
    if condition == "rag_no_gold":
        return [c for c in ranked if c not in gold][:3]
    raise ValueError(condition)

def cohort(items, condition):
    return [q for q in items if condition in ("engineered", "rag_rerank") or q["answerable"]]

def artifact_ok(spec):
    if spec["kind"] == "base":
        return True, ""
    paths = [setup.path(spec["adapter"])] + ([setup.path(spec["base"])] if spec["kind"] == "merged_adapter" else [])
    missing = [str(p) for p in paths if not p.exists()]
    return not missing, ", ".join(missing)

plan = []
for mid, spec in FE["models"].items():
    ok, missing = artifact_ok(spec)
    for cond in spec["conditions"]:
        for es in FE["eval_sets"]:
            plan.append({"model": mid, "condition": cond, "eval_set": es, "questions": len(cohort(EVAL[es], cond)),
                         "status": "ready" if ok else f"SKIPPED (missing {missing})"})
plan = pd.DataFrame(plan)
display(plan.pivot_table(index="model", columns=["eval_set", "condition"], values="questions", aggfunc="sum"))
print("skipped:", plan[plan.status != "ready"].model.unique().tolist())'''),
("m", "## Reuse v1 answers from the master evaluation where nothing differs\n\nA parent answer is reused only when the model, condition, question text, system-prompt hash, chunk IDs and generation settings all match. Everything else is generated fresh."),
("c", '''PARENT_NAME = {"base": "base", "sft_v1": "sft", "sft_dpo_v1": "sft_dpo"}
GEN = dict(CFG["generation"], device=D.device(), dtype=str(D.dtype()).replace("torch.", ""))
reuse = {}
for mid, pname in PARENT_NAME.items():
    for cond in ["engineered", "rag_rerank", "oracle"]:
        path = setup.path(FE["parent_v1_results"]) / f"{pname}__{cond}.json"
        if not path.exists():
            continue
        saved = json.loads(path.read_text())
        g = saved["generation"]
        if (g["max_new_tokens"], g["do_sample"], g["num_beams"], g["device"], g["dtype"]) != (GEN["max_new_tokens"], False, 1, GEN["device"], GEN["dtype"]):
            continue
        byq = {q["id"]: q for q in EVAL["dev_v1"]}
        for a in saved["answers"]:
            q = byq.get(a["question_id"])
            if not q or a["status"] not in ("ok", "truncated") or a["question"] != q["question"]:
                continue
            ids = chunks_for(q, cond)
            if a["chunk_ids"] != ids or a["system_prompt_sha256"] != P.sha(P.system_prompt([CHUNKS[c] for c in ids])):
                continue
            reuse[(mid, cond, "dev_v1", q["id"])] = {"answer": a["answer"], "truncated": a["status"] == "truncated",
                                                     "completion_tokens": a.get("completion_tokens"), "source": "master eval"}
print(len(reuse), "v1 answers reused from the master evaluation (0 if you have not run main-lab notebook 13)")'''),
("m", "## Generation: identical to the master evaluation\n\nOne answer per (model, condition, question). Each answer is cached on disk the moment it is produced, so the run can stop and resume."),
("c", '''import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel
CACHE = V2_ROOT / FE["cache_dir"]; CACHE.mkdir(parents=True, exist_ok=True)
tok = AutoTokenizer.from_pretrained(D.base_model_path())

def file_sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()

def model_identity(spec):
    ident = {"kind": spec["kind"]}
    if spec["kind"] != "base":
        ident["adapter"] = file_sha(setup.path(spec["adapter"]) / "adapter_model.safetensors")
    if spec["kind"] == "merged_adapter":
        ident["base"] = file_sha(setup.path(spec["base"]) / "model.safetensors")
    return ident

def load(spec):
    if spec["kind"] == "merged_adapter":
        base = AutoModelForCausalLM.from_pretrained(str(setup.path(spec["base"])), dtype=D.dtype()).to(D.device())
    else:
        base = AutoModelForCausalLM.from_pretrained(D.base_model_path(), dtype=D.dtype()).to(D.device())
    m = base if spec["kind"] == "base" else PeftModel.from_pretrained(base, str(setup.path(spec["adapter"])))
    return m.to(D.device()).eval()

def generate_one(m, q, ids):
    prompt = tok.apply_chat_template(P.messages(q["question"], [CHUNKS[c] for c in ids]), tokenize=True, add_generation_prompt=True, return_dict=False)
    assert len(prompt) <= GEN["max_input_tokens"]
    x = torch.tensor([prompt], device=D.device())
    eos = m.generation_config.eos_token_id
    eos_ids = [e for e in (eos if isinstance(eos, list) else [eos]) if e is not None]
    with torch.inference_mode():
        out = m.generate(input_ids=x, attention_mask=torch.ones_like(x), max_new_tokens=GEN["max_new_tokens"], do_sample=False,
                         num_beams=1, eos_token_id=eos, pad_token_id=tok.pad_token_id or tok.eos_token_id, use_cache=True)
    new = out[0, x.shape[1]:].tolist()
    return {"answer": tok.decode(new, skip_special_tokens=True).strip(), "completion_tokens": len(new),
            "truncated": len(new) >= GEN["max_new_tokens"] and (not new or new[-1] not in eos_ids), "prompt_tokens": len(prompt)}'''),
("c", '''ANSWERS = {}
t_all = time.time()
for mid, spec in FE["models"].items():
    ok, missing = artifact_ok(spec)
    if not ok:
        print(f"SKIPPED {mid}: missing {missing}"); continue
    ident = model_identity(spec)
    jobs = []
    for cond in spec["conditions"]:
        for es in FE["eval_sets"]:
            for q in cohort(EVAL[es], cond):
                ids = chunks_for(q, cond)
                key = hashlib.sha256(json.dumps({"model": ident, "cond": cond, "q": q["question"], "chunks": ids, "gen": GEN}, sort_keys=True).encode()).hexdigest()
                jobs.append((cond, es, q, ids, key))
    todo = [j for j in jobs if (mid, j[0], j[1], j[2]["id"]) not in reuse and not (CACHE / f"{j[4]}.json").exists()]
    print(f"{mid}: {len(jobs)} answers, {len(jobs) - len(todo)} cached or reused, {len(todo)} to generate")
    m = load(spec) if todo else None
    t0 = time.time()
    for n, (cond, es, q, ids, key) in enumerate(jobs):
        k = (mid, cond, es, q["id"])
        if k in reuse:
            ANSWERS[k] = dict(reuse[k], chunk_ids=ids); continue
        path = CACHE / f"{key}.json"
        if path.exists():
            ANSWERS[k] = json.loads(path.read_text()); continue
        rec = generate_one(m, q, ids)
        rec.update(chunk_ids=ids, source="generated", model=mid, condition=cond, eval_set=es, question_id=q["id"])
        path.write_text(json.dumps(rec, ensure_ascii=False))
        ANSWERS[k] = rec
        if (n + 1) % 50 == 0:
            setup.progress("04_final_eval", f"{mid} {n + 1}/{len(jobs)} | {(time.time() - t0) / 60:.1f} min")
        if (n + 1) % 100 == 0:
            print(f"   {mid} {n + 1}/{len(jobs)} | {(time.time() - t0) / 60:.1f} min")
    if m is not None:
        del m
        D.empty_cache(); D.memory_report(f"{mid} done")
print(f"{len(ANSWERS)} answers ready in {(time.time() - t_all) / 60:.1f} min")'''),
("m", "## Scoring 1 · the v1 keyword scorer (continuity)\n\nThe same `lab.score_answer` used for every v1 number. It is kept so v1 and v2 can be compared on the old ruler too. Unlike the master evaluation, truncated answers are scored here, not dropped."),
("c", '''from src import lab
fidx = lab.fact_index()
QIDX = {(es, q["id"]): q for es, items in EVAL.items() for q in items}
rows = []
for (mid, cond, es, qid), a in ANSWERS.items():
    q = QIDX[(es, qid)]
    s = lab.score_answer(a["answer"], q, fidx)
    rows.append({"model": mid, "condition": cond, "eval_set": es, "question_id": qid, "answerable": q["answerable"],
                 "category": q["category"], "style": q["style"], "answer": a["answer"], "truncated": a.get("truncated", False),
                 "source": a.get("source"), "legacy_correct": s["correct"], "legacy_refused": s["refused"], "legacy_hallucinated": s["hallucinated"]})
R = pd.DataFrame(rows)
print(R.groupby(["eval_set", "source"]).size())'''),
("m", "## Scoring 2 · Gemini as the ruler\n\nFirst the calibration gate (60 answers with known labels; at least 90% agreement or stop). Then every distinct (question, answer) pair is judged once; identical answers share a verdict. For `rag_no_gold`, the question is graded as answerable: refusing or giving the correct value are both safe, and only a wrong value is a hallucination."),
("c", '''from v2lib import judge as J, gemini_io as G
cap = CFG["judge"]["max_api_calls"]["final_eval"]
cal = setup.read_json(V2_ROOT / CFG["data"]["judge_calibration"])
cal_res = J.judge(cal, purpose="judge_calibration", cap=cap)
agree = sum(cal_res[it["id"]]["label"] == it["expected"] for it in cal) / len(cal)
print(f"judge calibration agreement: {agree:.1%}")
assert agree >= CFG["judge"]["calibration_min_agreement"]

uniq = {}
for r in rows:
    q = QIDX[(r["eval_set"], r["question_id"])]
    jid = hashlib.sha256((r["eval_set"] + q["id"] + r["answer"]).encode()).hexdigest()[:20]
    r["jid"] = jid
    if jid not in uniq:
        uniq[jid] = {"id": jid, "question": q["question"], "answerable": q["answerable"],
                     "gold": J.gold_for(F.FIDX[q["fact_id"]]) if q["answerable"] else None,
                     "answer": r["answer"], "truncated": r["truncated"]}
print(f"{len(rows)} answers -> {len(uniq)} distinct (question, answer) pairs to judge")
setup.progress("04_final_eval", f"judging {len(uniq)} distinct answers")
VERDICT = J.judge(list(uniq.values()), purpose="final_eval", cap=cap)
R["label"] = [VERDICT[r["jid"]]["label"] for r in rows]
R["rationale"] = [VERDICT[r["jid"]]["rationale"] for r in rows]
print(G.stats())
print(R["label"].value_counts())'''),
("m", "## Scoreboard (Gemini ruler)\n\nWilson 95% intervals show how much each number could move by chance. With 30–90 questions per cell, a few points' difference is noise."),
("c", '''def wilson(k, n, z=1.96):
    if not n: return (None, None)
    p = k / n; d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d; h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (round(c - h, 3), round(c + h, 3))

def board(df):
    out = []
    for (es, mid, cond), g in df.groupby(["eval_set", "model", "condition"]):
        m = J.metrics(g[["answerable", "label"]].to_dict("records"))
        ans, una = g[g.answerable], g[~g.answerable]
        k_acc = int(ans.label.isin(["correct", "correct_with_unsupported_caveat"]).sum())
        k_ref = int((una.label == "refused").sum())
        row = {"eval_set": es, "model": mid, "condition": cond, "n_ans": len(ans), "n_unans": len(una),
               "accuracy": m["accuracy_answerable"], "acc_95ci": wilson(k_acc, len(ans)),
               "clean_acc": m["clean_accuracy_answerable"], "caveat": m["caveat_rate_answerable"],
               "hallucination": m["hallucination_rate_answerable"], "over_refusal": m["over_refusal_rate"],
               "approp_refusal": m["appropriate_refusal_rate"], "refusal_95ci": wilson(k_ref, len(una)) if len(una) else None,
               "invented_unans": m["invented_rate_unanswerable"], "truncated": m["truncated_rate"],
               "legacy_acc": ans.legacy_correct.mean() if len(ans) else None,
               "legacy_refusal": una.legacy_correct.mean() if len(una) else None}
        if cond in ("engineered", "rag_rerank") and len(una):
            row["meets_bar"] = (row["accuracy"] >= BAR["accuracy_answerable"] and row["hallucination"] <= BAR["hallucination_rate_answerable"]
                                and row["approp_refusal"] >= BAR["appropriate_refusal_rate"] and row["over_refusal"] <= BAR["max_over_refusal"])
        out.append(row)
    return pd.DataFrame(out)

SB = board(R)
order = list(FE["models"])
SB["model"] = pd.Categorical(SB["model"], order, ordered=True)
pd.set_option("display.width", 250)
for es in FE["eval_sets"]:
    print(f"\\n===== {es} =====")
    display(SB[SB.eval_set == es].sort_values(["condition", "model"]).drop(columns="eval_set").round(3))'''),
("c", '''import matplotlib.pyplot as plt
fig, axes = plt.subplots(1, 2, figsize=(12, 3.8), sharey=True)
for ax, es in zip(axes, FE["eval_sets"]):
    s = SB[(SB.eval_set == es) & (SB.condition == "rag_rerank")].set_index("model").reindex(order)
    s[["accuracy", "approp_refusal", "hallucination"]].plot.bar(ax=ax, rot=20, title=f"{es} · rag_rerank")
    ax.axhline(0.8, ls="--", c="grey", lw=1); ax.set_ylim(0, 1.05)
plt.tight_layout()
FIG = V2_ROOT / FE["output_dir"]; FIG.mkdir(parents=True, exist_ok=True)
plt.savefig(FIG / "rag_rerank_summary.png", dpi=130); plt.show()'''),
("m", "## Where refusals succeed or fail: by category\n\nThe v1 weak spots were money and policy near-misses. Each cell shows the correct-refusal rate (n in brackets)."),
("c", '''una = R[~R.answerable]
cat = una.groupby(["eval_set", "category", "condition", "model"]).apply(
    lambda g: f"{(g.label == 'refused').mean():.0%} ({len(g)})", include_groups=False).unstack("model")
display(cat.reindex(columns=[m for m in order if m in cat.columns]))'''),
("m", "## Answer accuracy by phrasing style\n\nv1 broke on typos and on trap words. Rows are style; values are accuracy on answerable questions."),
("c", '''ans = R[R.answerable & R.condition.isin(["engineered", "rag_rerank"])]
sty = ans.groupby(["eval_set", "condition", "style", "model"]).apply(
    lambda g: f"{g.label.isin(['correct', 'correct_with_unsupported_caveat']).mean():.0%} ({len(g)})", include_groups=False).unstack("model")
display(sty.reindex(columns=[m for m in order if m in sty.columns]))'''),
("m", "## Retrieval miss (`rag_no_gold`): safe or hallucinated?\n\nThe right chunk was removed. **Refused** and **correct from memory** are both safe; **wrong value** is the failure that matters."),
("c", '''ng = R[R.condition == "rag_no_gold"]
tab = ng.groupby(["eval_set", "model"]).label.value_counts(normalize=True).unstack(fill_value=0).round(2)
display(tab.reindex(columns=[c for c in ["refused", "correct", "correct_with_unsupported_caveat", "wrong_value", "off_topic", "truncated_incomplete"] if c in tab.columns]))'''),
("m", "## Paired comparison: SFT v1 → SFT v2 on the same questions\n\nFixed = wrong in v1 and right in v2; broke = the reverse. \"Right\" means `correct` for answerable questions and `refused` for unanswerable ones."),
("c", '''def right(label, answerable):
    return label in ("correct", "correct_with_unsupported_caveat") if answerable else label == "refused"
R["right"] = [right(l, a) for l, a in zip(R.label, R.answerable)]
pairs_out = []
for a, b in [("sft_v1", "sft_v2"), ("sft_dpo_v1", "sft_dpo_v2"), ("sft_v2", "sft_dpo_v2")]:
    for (es, cond), g in R.groupby(["eval_set", "condition"]):
        x = g[g.model == a].set_index("question_id"); y = g[g.model == b].set_index("question_id")
        common = x.index.intersection(y.index)
        if not len(common):
            continue
        fixed = [qid for qid in common if not x.loc[qid, "right"] and y.loc[qid, "right"]]
        broke = [qid for qid in common if x.loc[qid, "right"] and not y.loc[qid, "right"]]
        same = int((x.loc[common, "answer"] == y.loc[common, "answer"]).sum())
        pairs_out.append({"from": a, "to": b, "eval_set": es, "condition": cond, "n": len(common), "fixed": len(fixed),
                          "broke": len(broke), "net": len(fixed) - len(broke), "identical_answers": same,
                          "broke_ids": broke[:8]})
PAIRS = pd.DataFrame(pairs_out)
with pd.option_context("display.max_colwidth", 80):
    display(PAIRS)'''),
("m", "## Judge vs the v1 keyword scorer\n\nWhere the two rulers disagree, read the answer. The keyword scorer cannot see wrong-model values that happen to contain the right number, or refusals worded differently."),
("c", '''R["judge_right"] = R["right"]
R["legacy_right"] = R["legacy_correct"]
agree_rate = (R.judge_right == R.legacy_right).mean()
print(f"judge and keyword scorer agree on {agree_rate:.1%} of {len(R)} answers")
dis = R[R.judge_right != R.legacy_right]
with pd.option_context("display.max_colwidth", None):
    display(dis.sample(min(20, len(dis)), random_state=0)[["eval_set", "model", "condition", "question_id", "answer", "label", "legacy_right", "rationale"]])'''),
("m", "## Read the answers yourself\n\nPick any question ID to see every model and condition side by side, with the judge's label."),
("c", '''def inspect(qid, eval_set="dev_v2"):
    q = QIDX[(eval_set, qid)]
    print(f"{qid} · {q['question']}\\nanswerable={q['answerable']} · category={q['category']} · expected={q.get('expected_value')}")
    g = R[(R.eval_set == eval_set) & (R.question_id == qid)][["model", "condition", "label", "answer"]]
    with pd.option_context("display.max_colwidth", None):
        display(g.sort_values(["condition", "model"]))
inspect("dv2_u02"); inspect("dv2_a43")'''),
("m", "## Save everything"),
("c", '''OUT = V2_ROOT / FE["output_dir"]
R.drop(columns=["jid"]).to_json(OUT / "answers_scored.json", orient="records", indent=1, force_ascii=False)
SB.assign(model=SB.model.astype(str)).to_csv(OUT / "scoreboard.csv", index=False)
PAIRS.to_csv(OUT / "paired.csv", index=False)
setup.write_json(OUT / "summary.json", {"scoreboard": json.loads(SB.assign(model=SB.model.astype(str)).to_json(orient="records")),
    "paired": json.loads(PAIRS.to_json(orient="records")), "judge_agreement_with_legacy": agree_rate,
    "judge_calibration": agree, "gemini": G.stats(), "generation": GEN, "answers": len(R),
    "reused_from_master_eval": int((R.source == "master eval").sum()), "saved_at": time.strftime("%Y-%m-%d %H:%M:%S")})
print("saved to", OUT.relative_to(V2_ROOT))'''),
("m", """## How to read these results

- **dev_v2 is the main result.** dev_v1 informed the v2 design, so v2's dev_v1 score is a regression check, not proof.
- **Small samples.** 60 answerable and 80 unanswerable questions in dev_v2 give 95% intervals of roughly ±10 points. Differences inside the interval are not evidence.
- **The judge is a model too.** It passed a 60-item calibration, but read the disagreements above before trusting a borderline number.
- **One more test remains.** `evals/heldout.json` is untouched; run it once, after all choices are fixed."""),
])
print("done")
