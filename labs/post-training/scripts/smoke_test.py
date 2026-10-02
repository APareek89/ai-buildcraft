"""A few-minute end-to-end check of the lab's plumbing on your machine.

1. load the base model and generate once
2. attach LoRA and run one forward/backward pass
3. run one DPO step on two chat-format pairs, switch to eval mode, generate again
4. (optional) query the retrieval index, if notebook 11 has built it and Postgres is running

Training artifacts go to a temporary folder and are deleted. Retrieval may write its cache under runs/.
Usage: python scripts/smoke_test.py [--skip-rag]
"""
import argparse, sys, tempfile
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from src import lab


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--skip-rag", action="store_true")
    args = parser.parse_args()

    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer
    from peft import LoraConfig, get_peft_model
    cfg = lab.cfg()
    device, path = cfg["device"]["torch"], cfg["model"]["base_path"]
    assert (Path(path) / "config.json").is_file(), f"Base model missing at {path}: run notebooks/00a_download_models.ipynb"
    print("device:", device, "| base model:", path)
    tok = AutoTokenizer.from_pretrained(path)
    model = AutoModelForCausalLM.from_pretrained(path, dtype=torch.float32).to(device).eval()

    def ask(m, question):
        messages = [{"role": "system", "content": "You are a helpful assistant."}, {"role": "user", "content": question}]
        text = tok.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        inputs = tok(text, return_tensors="pt").to(device)
        with torch.no_grad():
            out = m.generate(**inputs, max_new_tokens=24, do_sample=False, pad_token_id=tok.eos_token_id)
        return tok.decode(out[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True).strip()

    print("1. generation:", ask(model, "What is the capital of France?"))

    lc = cfg["training"]["lora"]
    m = get_peft_model(model, LoraConfig(r=lc["r"], lora_alpha=lc["alpha"], lora_dropout=lc["dropout"],
                                         target_modules=lc["target_modules"], task_type="CAUSAL_LM"))
    batch = tok(["The Meridian Volt X has a battery capacity of 4.6 kWh."], return_tensors="pt").to(device)
    loss = m(**batch, labels=batch["input_ids"]).loss
    loss.backward()
    with_grad = sum(p.grad is not None for n, p in m.named_parameters() if "lora_" in n)
    print(f"2. LoRA forward/backward: loss {loss.item():.3f} | {with_grad} LoRA tensors received gradients")
    m.zero_grad(set_to_none=True)

    from datasets import Dataset
    from trl import DPOConfig, DPOTrainer
    system = "You are the customer assistant for Meridian Motors."
    rows = [("Could you tell me the battery capacity for the Meridian Volt X?",
             "The Meridian Volt X has a battery capacity of 4.6 kWh.", "The Meridian Volt X has a battery capacity of 6.2 kWh."),
            ("Can I fit a phone holder to the Meridian Arc 110?",
             "I don't have that information in Meridian's official documents.", "Yes, every Arc 110 ships with a holder.")]
    data = Dataset.from_list([{"prompt": [{"role": "system", "content": system}, {"role": "user", "content": p}],
                               "chosen": [{"role": "assistant", "content": c}],
                               "rejected": [{"role": "assistant", "content": r}]} for p, c, r in rows])
    with tempfile.TemporaryDirectory() as tmp:
        dpo_args = DPOConfig(output_dir=tmp, max_steps=1, per_device_train_batch_size=1, gradient_accumulation_steps=1,
                             learning_rate=5e-6, beta=0.1, logging_steps=1, save_strategy="no", report_to=[],
                             gradient_checkpointing=False, bf16=False)
        DPOTrainer(model=m, args=dpo_args, train_dataset=data, processing_class=tok).train()
    m.eval()
    assert not m.training
    answer = ask(m, "What is the capital of France?")
    print("3. DPO step, then eval-mode generation:", answer)
    assert "paris" in answer.lower(), "generation after the DPO step looks broken"
    del m, model
    lab.empty_cache()

    if args.skip_rag:
        print("4. retrieval: skipped (--skip-rag)")
    else:
        from src import rag
        try:
            hits = rag.retrieve("What is the battery capacity of the Meridian Volt X?", rag.load_config())
            top = hits[0] if isinstance(hits, list) else hits
            label = top.get("heading_path") or top.get("chunk_id") if isinstance(top, dict) else top
            print("4. retrieval top chunk:", label)
        except Exception as error:  # the index is optional
            print(f"4. retrieval: not available ({type(error).__name__}: {str(error)[:140]}). "
                  "Build it with notebook 11 after starting PostgreSQL; see docs/SETUP.md.")
        finally:
            rag.release_models()
    print("smoke test passed")


if __name__ == "__main__":
    main()
