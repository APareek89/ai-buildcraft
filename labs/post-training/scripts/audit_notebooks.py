"""Static repository checks. Never executes notebook code or loads a model.

- every notebook's code cells parse as Python
- no saved outputs or execution counts (notebooks are shipped as clean skeletons)
- a generic kernelspec, so the notebook opens with whatever environment you select
- no key-like strings anywhere in tracked files (API keys, tokens, private keys)

Usage: python scripts/audit_notebooks.py        (exit code 1 if anything fails)
"""
import ast, json, re, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
SKIP_DIRS = {".git", ".venv", "runs", "adapters", "models", "outputs", "__pycache__", ".ipynb_checkpoints"}
SKIP_FILES = {".env"}  # your local, git-ignored keys file
KEY_PATTERNS = {
    "AWS access key": r"AKIA[0-9A-Z]{16}",
    "OpenAI-style key": r"sk-[A-Za-z0-9_-]{20,}",
    "Google API key": r"AIza[0-9A-Za-z_-]{30,}",
    "Hugging Face token": r"hf_[A-Za-z0-9]{30,}",
    "GitHub token": r"gh[pousr]_[A-Za-z0-9]{30,}",
    "private key": r"-----BEGIN [A-Z ]*PRIVATE KEY-----",
}


def main() -> int:
    problems, notebooks = [], sorted([*(ROOT / "notebooks").glob("*.ipynb"), *(ROOT / "v2/notebooks").glob("*.ipynb")])
    for p in notebooks:
        nb = json.loads(p.read_text())
        if nb.get("metadata", {}).get("kernelspec", {}).get("name") != "python3":
            problems.append(f"{p.name}: kernelspec should be the generic python3")
        for i, c in enumerate(nb["cells"]):
            if c["cell_type"] != "code":
                continue
            if c.get("outputs") or c.get("execution_count") is not None:
                problems.append(f"{p.name} cell {i}: saved output or execution count; clear outputs before committing")
            try:
                ast.parse("".join(c["source"]))
            except SyntaxError as e:
                problems.append(f"{p.name} cell {i}: syntax error: {e}")
    scanned = 0
    for f in ROOT.rglob("*"):
        rel = f.relative_to(ROOT)
        if not f.is_file() or set(rel.parts) & SKIP_DIRS or f.name in SKIP_FILES:
            continue
        if f.suffix in {".safetensors", ".bin", ".png", ".jpg", ".pdf"}:
            continue
        text = f.read_text(errors="ignore"); scanned += 1
        for label, pattern in KEY_PATTERNS.items():
            if re.search(pattern, text):
                problems.append(f"{rel}: contains something that looks like a {label}")
    print(f"notebooks checked: {len(notebooks)} | files scanned for secrets: {scanned}")
    for line in problems:
        print("FAIL", line)
    print("PASS" if not problems else f"{len(problems)} problem(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
