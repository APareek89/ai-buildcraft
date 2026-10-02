# Setup, keys and optional components

The core path, notebooks 00a–08, needs only Python and an internet connection for the first model download.
Everything else on this page is optional and switched on only when you need it.

| Component | Needed by | Required? |
|---|---|---|
| Python environment | everything | yes |
| Base model download | everything | yes, once |
| Hugging Face token | gated models only | no |
| `GEMINI_API_KEY` | notebook 03, optional cell in 09 | no |
| `OPENAI_API_KEY` | optional API rows in notebooks 10 and 12 | no |
| PostgreSQL + pgvector | notebooks 11, 12, 13 | only for retrieval |
| MLX | notebook 07 | Apple Silicon only |

## 1. Python environment

```bash
python3.13 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
pip install -r requirements-optional.txt   # only if you want Gemini, OpenAI or MLX
```

`requirements.txt` pins the versions the reference results were produced with. The exact macOS arm64
environment is in `requirements-lock-macos-arm64.txt`.

Start Jupyter from the activated environment (`jupyter lab`), or open the folder in VS Code and choose the
`.venv` interpreter as the kernel.

## 2. Models and the Hugging Face token

Run `notebooks/00a_download_models.ipynb`, or from a terminal:

```bash
python scripts/download_models.py              # base model + retrieval models
python scripts/download_models.py --base-only
```

The base model is saved to `models/Qwen2.5-0.5B-Instruct/`. The retrieval models go to the standard
Hugging Face cache at the pinned revisions in `configs/rag.yaml`.

**You do not need a Hugging Face token for the default models.** A token matters only for a gated model
(Llama, Gemma and similar: accept the licence on its model page first) or if you hit download rate limits.
Create a **read** token at huggingface.co → Settings → Access Tokens, then provide it in one of these ways:

- `HF_TOKEN=...` in `.env`, or
- `export HF_TOKEN=...` before starting Jupyter, or
- `hf auth login` once in a terminal.

Already have the model somewhere else? Set `PTL_BASE_MODEL_PATH=/path/to/model` in your shell or in `.env`.

## 3. API keys (Gemini, OpenAI)

Only notebooks 03, 09 (one optional cell), 10 and 12 can call an API, and only when you select an API
model or run those cells. To provide keys:

```bash
cp .env.example .env
# then edit .env:
GEMINI_API_KEY=...
OPENAI_API_KEY=...
```

Or export them as environment variables; an environment variable takes precedence over `.env`.

How the lab handles keys:

- `src/lab.py` reads a key only when a cell needs it (`lab.load_secret("GEMINI_API_KEY")`).
- Values are never printed. Setup cells report only key **names** (`lab.list_secret_names()`).
- `.env` is git-ignored. `python scripts/audit_notebooks.py` fails if anything that looks like a key appears
  in a tracked file.
- Never paste a key into a notebook cell: saved notebooks keep cell text, and outputs can leak into git.
- API notebooks cap uncached calls (`max_api_calls` in their YAML). Provider charges are yours; nothing here
  estimates cost unless you fill in the price fields.

If a key was ever committed or shared, revoke it with the provider and create a new one. Deleting the file is
not enough.

## 4. PostgreSQL and pgvector (retrieval notebooks 11–13)

Retrieval stores chunk embeddings in a local PostgreSQL database with the
[pgvector](https://github.com/pgvector/pgvector) extension.

macOS with Homebrew:

```bash
brew install postgresql@16 pgvector
brew services start postgresql@16
createdb meridian_rag
```

On Linux, install PostgreSQL 16 and pgvector from your distribution or the
[pgvector installation guide](https://github.com/pgvector/pgvector#installation), start the service,
and create the `meridian_rag` database. Notebook 11 enables the extension inside that database
(`CREATE EXTENSION IF NOT EXISTS vector`).

The connection string is `database.dsn` in `configs/rag.yaml`. The default, `postgresql:///meridian_rag`,
connects over the local socket as your user, with no password. For a hosted database, keep the password out
of the YAML: use the `PGPASSWORD` environment variable or a `~/.pgpass` file, which PostgreSQL reads
automatically.

Stop the service when you are done: `brew services stop postgresql@16`.

## 5. Device and precision

`device.torch: auto` in `configs/config.yaml` picks CUDA, then Apple MPS, then CPU. Every notebook uses
float32; that is the tested precision, and MPS is unreliable with bf16 on some operations. On a CUDA GPU you
can experiment with bf16, but reference numbers were not produced that way.

## 6. MLX (notebook 07)

Notebook 07 quantises with [MLX](https://github.com/ml-explore/mlx), which runs on Apple Silicon only.
Install it with `pip install -r requirements-optional.txt`. On other hardware, skip notebook 07; the rest of
the lab does not depend on it.

## 7. Check everything

```bash
python scripts/smoke_test.py          # model, LoRA, one DPO step, optional retrieval
python scripts/audit_notebooks.py     # clean notebooks and no secrets, before you commit
```
