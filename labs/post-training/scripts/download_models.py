"""Download the base model and the two retrieval models (same as notebooks/00a_download_models.ipynb).

Usage:
    python scripts/download_models.py              # base model + retrieval models
    python scripts/download_models.py --base-only  # skip the ~1.2 GB retrieval models

A Hugging Face token is not needed for these public models. If you switch to a gated model,
set HF_TOKEN in your environment or in .env (see docs/SETUP.md). The token is never printed.
"""
import argparse, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from huggingface_hub import snapshot_download
from src import lab, rag


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base-only", action="store_true", help="skip the retrieval models")
    args = parser.parse_args()
    cfg, token = lab.cfg(), lab.hf_token()
    print("Hugging Face token found in env/.env:", token is not None)

    base_dir = Path(cfg["model"]["base_path"])
    if (base_dir / "config.json").is_file() and any(base_dir.glob("*.safetensors")):
        print("base model already present:", base_dir)
    else:
        snapshot_download(repo_id=cfg["model"]["hf_id"], local_dir=str(base_dir), token=token,
                          allow_patterns=["*.json", "*.safetensors", "*.txt", "LICENSE", "README.md"])
        print("base model downloaded:", base_dir)

    if not args.base_only:
        rag_cfg = rag.load_config()
        for section in ("embedding", "rerank"):
            s = rag_cfg[section]
            path = snapshot_download(repo_id=s["model_id"], revision=s["revision"], token=token,
                                     allow_patterns=["config.json", "*.safetensors", "model.safetensors.index.json",
                                                     "tokenizer.json", "tokenizer_config.json", "special_tokens_map.json",
                                                     "vocab.txt", "sentencepiece.bpe.model"])
            print(f"{section}: {s['model_id']} @ {s['revision'][:10]} -> {path}")


if __name__ == "__main__":
    main()
