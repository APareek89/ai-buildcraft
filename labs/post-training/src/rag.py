"""Local, inspectable BGE + PostgreSQL/pgvector retrieval. No network on import.

Notebook 11 copies these definitions verbatim so its visible steps and this
reusable module have the same implementation. Only ingestion mutates the index.
"""
from pathlib import Path
import copy
import glob
import hashlib
import json
import math
import re
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
_TOKENIZERS = {}
_MODELS = {}
_STATS = {
    "api_calls": 0, "uncached_batches": 0,
    "embedding_batches": 0, "rerank_batches": 0,
    "embedding_input_tokens": 0, "rerank_input_tokens": 0,
    "embedding_cache_hits": 0, "embedding_cache_misses": 0,
    "rerank_cache_hits": 0, "rerank_cache_misses": 0,
    "embedding_seconds": 0.0, "rerank_seconds": 0.0,
    "search_seconds": 0.0,
}

# -- Configuration and small helpers

def _hash(value):
    text = value if isinstance(value, str) else json.dumps(value, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _path(value, cfg):
    path = Path(value).expanduser()
    return path if path.is_absolute() else Path(cfg.get("_root", ROOT)) / path


def load_config(path=None):
    """Load YAML settings. Relative corpus/cache paths are project-relative."""
    import yaml
    config_path = Path(path).expanduser().resolve() if path else ROOT / "configs/rag.yaml"
    cfg = yaml.safe_load(config_path.read_text())
    cfg["_root"] = str(ROOT)
    cfg["_config_path"] = str(config_path)
    _table_name(cfg)
    emb, rerank = cfg["embedding"], cfg["rerank"]
    for name, section in (("embedding", emb), ("rerank", rerank)):
        if not re.fullmatch(r"[0-9a-f]{40}", section["revision"]):
            raise ValueError(f"{name}.revision must be an immutable 40-character commit SHA")
        if int(section["max_input_tokens"]) < 1:
            raise ValueError(f"{name}.max_input_tokens must be positive")
        if int(section["batch_size"]) < 1:
            raise ValueError(f"{name}.batch_size must be positive")
    if emb["pooling"] != "cls" or not emb["normalize"]:
        raise ValueError("This BGE pipeline requires CLS pooling and L2 normalization")
    if int(emb["dimensions"]) < 1:
        raise ValueError("embedding.dimensions must be positive")
    chunk = cfg["chunking"]
    if chunk["strategy"] not in {"heading", "fixed_tokens"}:
        raise ValueError("chunking.strategy must be heading or fixed_tokens")
    if not 0 <= int(chunk["overlap_tokens"]) < int(chunk["chunk_tokens"]):
        raise ValueError("Require 0 <= overlap_tokens < chunk_tokens")
    retrieval = cfg["retrieval"]
    if not 1 <= int(retrieval["top_k"]) <= int(retrieval["top_n_candidates"]):
        raise ValueError("Require 1 <= top_k <= top_n_candidates")
    if int(retrieval["hybrid"]["rrf_k"]) <= 0:
        raise ValueError("hybrid.rrf_k must be positive")
    if not rerank["enabled"] and retrieval.get("min_rerank_score") is not None:
        raise ValueError("min_rerank_score requires rerank.enabled=true")
    if int(cfg["cache"]["max_uncached_batches"]) < 0:
        raise ValueError("cache.max_uncached_batches must be nonnegative")
    return cfg


def _tokenizer(kind, cfg):
    """Load tokenizer files only; this never loads model weights or downloads."""
    from transformers import AutoTokenizer
    if kind == "approximation":
        configured = cfg["chunking"].get("approximation_tokenizer")
        if configured:
            model_id = str(_path(configured, cfg))
        else:  # null means: the base model configured in configs/config.yaml
            from src import lab
            model_id = lab.cfg()["model"]["base_path"]
        revision = None
    else:
        model_id, revision = cfg[kind]["model_id"], cfg[kind]["revision"]
    key = (model_id, revision)
    if key not in _TOKENIZERS:
        _TOKENIZERS[key] = AutoTokenizer.from_pretrained(
            model_id, revision=revision, local_files_only=True, trust_remote_code=False,
        )
    tokenizer = _TOKENIZERS[key]
    if kind != "approximation":
        # Most published tokenizers declare their positional ceiling. Some use
        # an enormous sentinel instead; inspect local config in that case.
        ceiling = int(tokenizer.model_max_length)
        if ceiling > 1_000_000:
            from transformers import AutoConfig
            model_config = AutoConfig.from_pretrained(
                model_id, revision=revision, local_files_only=True, trust_remote_code=False,
            )
            ceiling = getattr(model_config, "max_position_embeddings", None)
            if ceiling is None:
                raise ValueError("Cannot establish this model's input ceiling from local tokenizer/config")
            if model_config.model_type in {"roberta", "xlm-roberta"}:
                ceiling -= (model_config.pad_token_id or 0) + 1
        if int(cfg[kind]["max_input_tokens"]) > ceiling:
            raise ValueError(f"{kind}.max_input_tokens exceeds the actual tokenizer/model ceiling ({ceiling})")
    return tokenizer


def _check_chunk_limits(text, cfg):
    """Qwen counts are descriptive; actual BGE tokenizers enforce hard limits."""
    embed_tok, rank_tok = _tokenizer("embedding", cfg), _tokenizer("rerank", cfg)
    embed_count = len(embed_tok.encode(text, add_special_tokens=True))
    rank_doc_count = len(rank_tok.encode(text, add_special_tokens=False))
    reserve = int(cfg["rerank"]["query_token_reserve"])
    rank_count = rank_doc_count + reserve + rank_tok.num_special_tokens_to_add(pair=True)
    if reserve < 1 or embed_count > cfg["embedding"]["max_input_tokens"] or rank_count > cfg["rerank"]["max_input_tokens"]:
        raise ValueError(
            f"Chunk exceeds tokenizer budget: embedding={embed_count}/"
            f"{cfg['embedding']['max_input_tokens']}; reranker document+reserved query+specials="
            f"{rank_count}/{cfg['rerank']['max_input_tokens']}. Reduce chunk size; no truncation is allowed."
        )
    return embed_count, rank_count

# -- Source-aware chunks and canonical fact labels

def _markdown_sections(text, fallback_title):
    """Keep the introduction and split at level-two headings; keep lower headings."""
    title, heading, lines, sections = fallback_title, "Introduction", [], []
    for line in text.splitlines():
        if line.startswith("# ") and not sections and heading == "Introduction":
            title = line[2:].strip()
        elif line.startswith("## "):
            if "\n".join(lines).strip():
                sections.append((heading, "\n".join(lines).strip()))
            heading, lines = line[3:].strip(), []
        else:
            lines.append(line)
    if "\n".join(lines).strip():
        sections.append((heading, "\n".join(lines).strip()))
    return title, sections


def _table_pieces(text):
    """Emit prose blocks and individual Markdown table rows with their header."""
    lines, pieces, prose, i = text.splitlines(), [], [], 0
    while i < len(lines):
        if i + 1 < len(lines) and lines[i].strip().startswith("|") and re.fullmatch(r"[\s|:\-]+", lines[i + 1]):
            if "\n".join(prose).strip():
                pieces.append("\n".join(prose).strip())
            prose = []
            header, separator = lines[i], lines[i + 1]
            i += 2
            while i < len(lines) and lines[i].strip().startswith("|"):
                pieces.append("\n".join((header, separator, lines[i])))
                i += 1
        else:
            prose.append(lines[i])
            i += 1
    if "\n".join(prose).strip():
        pieces.append("\n".join(prose).strip())
    return pieces


def _fact_evidence(fact, title, heading, text):
    """Recognize a full, exact canonical statement, never an isolated number."""
    model, attribute, value = fact["model"], fact["attribute"], fact["value"]
    lines = [line.strip().removeprefix("- ") for line in text.splitlines()]
    numeric = str(value)
    expected = {
        "battery_kwh": ("Powertrain", f"Battery capacity: {numeric} kWh"),
        "motor_kw": ("Powertrain", f"Peak motor power: {numeric} kW"),
        "range_km": ("Powertrain", f"Certified range on a full charge: {numeric} km"),
        "top_speed_kmph": ("Powertrain", f"Top speed: {numeric} km/h"),
        "charge_time_hours": ("Charging", f"Full charge on the standard charger: {numeric} hours"),
        "kerb_weight_kg": ("Body", f"Kerb weight: {numeric} kg"),
        "boot_litres": ("Body", f"Under-seat storage: {numeric} litres"),
        "colours": ("Body", f"Available colours: {value}"),
    }
    if attribute.startswith("price_"):
        city = attribute.split("_")[1].title()
        expected[attribute] = ("On-road pricing", f"{city}: Rs {int(value):,}")
    if attribute == "fast_charge_minutes":
        statement = "Fast charging: Not supported on this model" if value == 0 else f"Fast charging: {value} minutes to 80 percent on the Meridian fast charger"
        expected[attribute] = ("Charging", statement)
    if fact["source_doc"] == "spec_sheet":
        if title != f"{model} — Specification Sheet":
            return False
        if attribute == "launch_year":
            return heading == "Introduction" and any(re.search(rf"\bLaunched {re.escape(str(value))}$", line) for line in lines)
        expected_heading, statement = expected.get(attribute, (None, None))
        return heading == expected_heading and statement in lines
    if fact["source_doc"] == "warranty_policy" and title == "Meridian Motors — Warranty and Service Policy" and heading == "Coverage at a glance":
        columns = {"warranty_years": (1, "years"), "battery_warranty_km": (2, "km"), "service_interval_km": (3, "km")}
        if attribute not in columns:
            return False
        column, unit = columns[attribute]
        header = "| Model | Vehicle warranty | Battery warranty distance | Service interval |"
        if header not in lines:
            return False
        for line in lines:
            cells = [cell.strip() for cell in line.strip("|").split("|")]
            if len(cells) == 4 and cells[0] == model:
                formatted = f"{int(value):,}" if unit == "km" else str(value)
                return cells[column] == f"{formatted} {unit}"
    return False


def _dedupe_chunks(chunks):
    """Same embedded text is one vector; preserve every source reference."""
    unique = {}
    for chunk in sorted(chunks, key=lambda item: item["chunk_id"]):
        digest = chunk["content_sha256"]
        ref = {key: chunk[key] for key in ("chunk_id", "doc_id", "source_path", "heading_path")}
        if digest not in unique:
            unique[digest] = dict(chunk, source_refs=[])
        target = unique[digest]
        target["source_refs"].extend(chunk.get("source_refs", [ref]))
        target["fact_ids"] = sorted(set(target["fact_ids"]) | set(chunk["fact_ids"]))
    return sorted(unique.values(), key=lambda item: (item["source_path"], item["chunk_id"]))


def chunk_corpus(cfg):
    """Read configured Markdown only, label exact evidence, enforce both limits."""
    paths = sorted({Path(p).resolve() for pattern in cfg["corpus"]["paths"] for p in glob.glob(str(_path(pattern, cfg)), recursive=True)})
    if not paths:
        raise ValueError("corpus.paths matched no files")
    fact_path = cfg["corpus"].get("fact_labels")
    facts = json.loads(_path(fact_path, cfg).read_text())["facts"] if fact_path else []
    if facts and (len(facts) != 48 or len({f["id"] for f in facts}) != 48):
        raise ValueError("The canonical Meridian label file must contain 48 distinct facts; use fact_labels: null for another corpus")
    approx = _tokenizer("approximation", cfg)
    chunks = []
    for path in paths:
        if not path.is_file() or path.suffix.lower() != ".md":
            raise ValueError(f"Expected a Markdown document: {path}")
        root = Path(cfg.get("_root", ROOT))
        source = str(path.relative_to(root)) if path.is_relative_to(root) else str(path)
        doc_id = _hash(source)[:16]
        title, sections = _markdown_sections(path.read_text(), path.stem)
        # Table distance limits need their time-or-distance qualification alongside them.
        qualifier = ""
        if title == "Meridian Motors — Warranty and Service Policy":
            terms = dict(sections).get("Terms", "")
            first_paragraph = terms.split("\n\n")[0].strip()
            if "whichever comes first" in first_paragraph:
                qualifier = first_paragraph
        for section_index, (heading, text) in enumerate(sections):
            for piece_index, piece in enumerate(_table_pieces(text)):
                if qualifier and piece.startswith("| Model | Vehicle warranty |"):
                    piece += "\n\n" + qualifier
                pieces = [piece]
                if cfg["chunking"]["strategy"] == "fixed_tokens":
                    size = int(cfg["chunking"]["chunk_tokens"])
                    stride = size - int(cfg["chunking"]["overlap_tokens"])
                    ids = approx.encode(piece, add_special_tokens=False)
                    pieces = []
                    for start in range(0, len(ids), stride):
                        pieces.append(approx.decode(ids[start:start + size], skip_special_tokens=False))
                        if start + size >= len(ids):
                            break
                for window_index, body in enumerate(pieces):
                    header = f"{title} > {heading}"
                    embedded = f"{header}\n\n{body}" if cfg["chunking"]["add_context_header"] else body
                    _check_chunk_limits(embedded, cfg)
                    chunk_id = f"{doc_id}:{section_index:03d}:{piece_index:03d}:{window_index:03d}"
                    chunks.append({
                        "chunk_id": chunk_id, "doc_id": doc_id, "source_path": source,
                        "heading_path": header, "chunk_text": body, "embed_text": embedded,
                        "token_count": len(approx.encode(embedded, add_special_tokens=False)),
                        "fact_ids": [f["id"] for f in facts if _fact_evidence(f, title, heading, body)],
                        "content_sha256": _hash(embedded),
                    })
    chunks = _dedupe_chunks(chunks)
    missing = {f["id"] for f in facts} - {f for chunk in chunks for f in chunk["fact_ids"]}
    if missing:
        raise ValueError(f"Facts lack complete, exact chunk evidence: {sorted(missing)}. Check chunk boundaries/source text; labels are never guessed.")
    return chunks

# -- Local models, content-addressed caches, and embeddings

def _embedding_signature(cfg):
    names = ("model_id", "revision", "dimensions", "normalize", "pooling", "query_instruction", "max_input_tokens")
    return {name: cfg["embedding"][name] for name in names}


def _cache_path(kind, key, cfg):
    directory = _path(cfg["cache"]["directory"], cfg) / kind
    directory.mkdir(parents=True, exist_ok=True)
    return directory / f"{_hash(key)}.json"


def _write_cache(path, value):
    temporary = path.with_name(path.name + "." + uuid.uuid4().hex + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, allow_nan=False))
    temporary.replace(path)


def _reserve_batches(count, cfg):
    maximum = int(cfg["cache"]["max_uncached_batches"])
    if _STATS["uncached_batches"] + count > maximum:
        raise RuntimeError(f"Local uncached batch cap ({maximum}) would be exceeded; reuse the cache or deliberately raise it")


def _model(kind, cfg):
    import torch
    from transformers import AutoModel, AutoModelForSequenceClassification
    section = cfg[kind]
    from src import lab
    device = lab.resolve_device(section.get("device", "auto"))
    key = (kind, section["model_id"], section["revision"], device)
    if key not in _MODELS:
        cls = AutoModel if kind == "embedding" else AutoModelForSequenceClassification
        model = cls.from_pretrained(
            section["model_id"], revision=section["revision"],
            local_files_only=True, trust_remote_code=False, use_safetensors=True,
        ).to(device).eval()
        _MODELS[key] = model
    return _MODELS[key]


def embed_texts(texts, cfg, input_type="document"):
    """CLS + L2-normalized BGE vectors. Only queries receive the instruction."""
    import torch
    if input_type not in {"document", "query"}:
        raise ValueError("input_type must be document or query")
    texts = list(texts)
    if any(not isinstance(text, str) or not text.strip() for text in texts):
        raise ValueError("Embedding inputs must be nonempty strings")
    if not texts:
        return []
    tok, settings = _tokenizer("embedding", cfg), cfg["embedding"]
    prepared = [settings["query_instruction"] + text if input_type == "query" else text for text in texts]
    lengths = [len(tok.encode(text, add_special_tokens=True)) for text in prepared]
    if max(lengths) > settings["max_input_tokens"]:
        raise ValueError(f"Embedding input has {max(lengths)} tokens; limit is {settings['max_input_tokens']}. No truncation is allowed.")
    results, missing = [None] * len(texts), {}
    for index, text in enumerate(texts):
        key = dict(_embedding_signature(cfg), input_type=input_type, text=text, tag=cfg["cache"]["tag"])
        path = _cache_path("embeddings", key, cfg)
        if path.exists():
            vector = json.loads(path.read_text())["vector"]
            if len(vector) != settings["dimensions"] or not all(math.isfinite(v) for v in vector):
                raise ValueError(f"Invalid cached embedding: {path}")
            results[index] = vector
            _STATS["embedding_cache_hits"] += 1
        else:
            missing.setdefault(str(path), {"path": path, "indices": [], "text": prepared[index], "tokens": lengths[index]})["indices"].append(index)
            _STATS["embedding_cache_misses"] += 1
    pending, batch_size = list(missing.values()), int(settings["batch_size"])
    _reserve_batches(math.ceil(len(pending) / batch_size), cfg)
    if pending:
        model = _model("embedding", cfg)
        for start in range(0, len(pending), batch_size):
            batch = pending[start:start + batch_size]
            inputs = tok([item["text"] for item in batch], padding=True, truncation=False, return_tensors="pt").to(model.device)
            before = time.perf_counter()
            _STATS["uncached_batches"] += 1
            _STATS["embedding_batches"] += 1
            with torch.inference_mode():
                vectors = model(**inputs).last_hidden_state[:, 0]
                vectors = torch.nn.functional.normalize(vectors, p=2, dim=1).cpu().float().tolist()
            _STATS["embedding_seconds"] += time.perf_counter() - before
            _STATS["embedding_input_tokens"] += sum(item["tokens"] for item in batch)
            for item, vector in zip(batch, vectors):
                if len(vector) != settings["dimensions"] or not all(math.isfinite(v) for v in vector):
                    raise ValueError("Embedding output is nonfinite or its dimension does not match the configured index")
                _write_cache(item["path"], {"vector": vector, "input_tokens": item["tokens"]})
                for index in item["indices"]:
                    results[index] = vector
    return results


def rerank_candidates(question, candidates, cfg):
    """Cross-encode complete query/document pairs; scores are raw logits."""
    import torch
    if not candidates:
        return []
    tok, settings = _tokenizer("rerank", cfg), cfg["rerank"]
    pairs = [(question, candidate["embed_text"]) for candidate in candidates]
    lengths = [len(tok(q, text, add_special_tokens=True, truncation=False)["input_ids"]) for q, text in pairs]
    if max(lengths) > settings["max_input_tokens"]:
        raise ValueError(f"Reranker question+chunk pair has {max(lengths)} tokens; limit is {settings['max_input_tokens']}. No truncation is allowed.")
    key = {
        "model_id": settings["model_id"], "revision": settings["revision"],
        "max_input_tokens": settings["max_input_tokens"], "score_type": "raw_logit",
        "question": question, "candidate_hashes": [_hash(c["embed_text"]) for c in candidates],
        "tag": cfg["cache"]["tag"],
    }
    path = _cache_path("reranks", key, cfg)
    if path.exists():
        scores = json.loads(path.read_text())["scores"]
        _STATS["rerank_cache_hits"] += 1
    else:
        _STATS["rerank_cache_misses"] += 1
        batch_size = int(settings["batch_size"])
        _reserve_batches(math.ceil(len(pairs) / batch_size), cfg)
        model, scores = _model("rerank", cfg), []
        for start in range(0, len(pairs), batch_size):
            batch = pairs[start:start + batch_size]
            inputs = tok([q for q, _ in batch], [text for _, text in batch], padding=True, truncation=False, return_tensors="pt").to(model.device)
            before = time.perf_counter()
            _STATS["uncached_batches"] += 1
            _STATS["rerank_batches"] += 1
            with torch.inference_mode():
                logits = model(**inputs).logits
                if logits.shape[-1] != 1:
                    raise ValueError("This reranker must return one relevance logit per query/document pair")
                scores.extend(logits.flatten().cpu().float().tolist())
            _STATS["rerank_seconds"] += time.perf_counter() - before
            _STATS["rerank_input_tokens"] += sum(lengths[start:start + batch_size])
        _write_cache(path, {"scores": scores, "input_tokens": sum(lengths)})
    if len(scores) != len(candidates) or not all(math.isfinite(score) for score in scores):
        raise ValueError("Invalid reranker scores")
    ranked = sorted([dict(candidate, rerank_score=float(score)) for candidate, score in zip(candidates, scores)], key=lambda item: (-item["rerank_score"], item["chunk_id"]))
    for rank, item in enumerate(ranked, 1):
        item["rerank_rank"] = rank
    return ranked

# -- PostgreSQL schema and safe incremental ingestion

def _table_name(cfg):
    index = cfg["index_name"]
    if not isinstance(index, str) or not re.fullmatch(r"[a-z][a-z0-9_]{0,39}", index):
        raise ValueError("index_name must start with a lowercase letter and contain at most 40 lowercase letters/digits/underscores")
    return "rag_" + index


def _connect(cfg):
    import psycopg
    from psycopg.rows import dict_row
    return psycopg.connect(cfg["database"]["dsn"], row_factory=dict_row)


def _check_index_signature(connection, cfg):
    table = "public." + _table_name(cfg)
    row = connection.execute("SELECT obj_description(%s::regclass, 'pg_class') AS metadata", (table,)).fetchone()
    expected = {"format_version": 1, "embedding": _embedding_signature(cfg)}
    try:
        actual = json.loads(row["metadata"] or "null")
    except (TypeError, json.JSONDecodeError):
        actual = None
    if actual != expected:
        raise ValueError("Index metadata is missing or incompatible with these embedding settings. Choose a new index_name; do not mix embedding spaces.")


def ensure_table(cfg):
    """Create this index if absent; reject incompatible existing embedding spaces."""
    from psycopg import sql
    name = _table_name(cfg)
    table = sql.Identifier("public", name)
    dimensions = int(cfg["embedding"]["dimensions"])
    hnsw = cfg["database"]["hnsw"]
    m, construction = int(hnsw["m"]), int(hnsw["ef_construction"])
    if dimensions < 1 or not 2 <= m <= 100 or construction < 2 * m:
        raise ValueError("Invalid vector dimension or HNSW settings (ef_construction must be >= 2*m)")
    with _connect(cfg) as connection:
        connection.execute("CREATE EXTENSION IF NOT EXISTS vector")
        exists = connection.execute("SELECT to_regclass(%s) AS name", ("public." + name,)).fetchone()["name"]
        if not exists:
            connection.execute(sql.SQL("""CREATE TABLE {} (
                chunk_id text PRIMARY KEY, doc_id text NOT NULL, source_path text NOT NULL,
                heading_path text NOT NULL, chunk_text text NOT NULL, embed_text text NOT NULL,
                token_count integer NOT NULL, fact_ids text[] NOT NULL,
                content_sha256 text NOT NULL UNIQUE, source_refs jsonb NOT NULL,
                tsv tsvector GENERATED ALWAYS AS (to_tsvector('english'::regconfig, embed_text)) STORED,
                embedding vector({}) NOT NULL
            )""").format(table, sql.Literal(dimensions)))
            metadata = json.dumps({"format_version": 1, "embedding": _embedding_signature(cfg)}, sort_keys=True)
            connection.execute(sql.SQL("COMMENT ON TABLE {} IS {}").format(table, sql.Literal(metadata)))
        _check_index_signature(connection, cfg)
        connection.execute(sql.SQL("CREATE INDEX IF NOT EXISTS {} ON {} USING hnsw (embedding vector_cosine_ops) WITH (m = {}, ef_construction = {})").format(sql.Identifier(name + "_hnsw"), table, sql.Literal(m), sql.Literal(construction)))
        connection.execute(sql.SQL("CREATE INDEX IF NOT EXISTS {} ON {} USING gin (tsv)").format(sql.Identifier(name + "_tsv"), table))
    return name


def _vector_literal(vector):
    if not vector or not all(math.isfinite(float(number)) for number in vector):
        raise ValueError("Vector must contain finite numbers")
    return "[" + ",".join(str(float(number)) for number in vector) + "]"


def ingest(chunks, cfg):
    """Embed first, then atomically replace stale content and update source metadata."""
    from psycopg import sql
    from psycopg.types.json import Jsonb
    chunks = _dedupe_chunks(chunks)
    if not chunks:
        raise ValueError("Refusing empty ingestion; check the corpus before removing an entire index")
    if len({chunk["chunk_id"] for chunk in chunks}) != len(chunks):
        raise ValueError("chunk_id values must be unique")
    for chunk in chunks:
        if chunk["content_sha256"] != _hash(chunk["embed_text"]):
            raise ValueError("content_sha256 must hash the exact embed_text")
        _check_chunk_limits(chunk["embed_text"], cfg)
    ensure_table(cfg)
    table = sql.Identifier("public", _table_name(cfg))
    with _connect(cfg) as connection:
        _check_index_signature(connection, cfg)
        existing = {row["content_sha256"] for row in connection.execute(sql.SQL("SELECT content_sha256 FROM {}").format(table))}
    new_chunks = [chunk for chunk in chunks if chunk["content_sha256"] not in existing]
    vectors = embed_texts([chunk["embed_text"] for chunk in new_chunks], cfg, input_type="document")
    new_vectors = {chunk["content_sha256"]: vector for chunk, vector in zip(new_chunks, vectors)}
    desired = [chunk["content_sha256"] for chunk in chunks]
    # No deletion occurs before all new embeddings and limit checks have succeeded.
    with _connect(cfg) as connection:
        connection.execute(sql.SQL("LOCK TABLE {} IN EXCLUSIVE MODE").format(table))
        _check_index_signature(connection, cfg)
        current = {row["content_sha256"] for row in connection.execute(sql.SQL("SELECT content_sha256 FROM {}").format(table))}
        if current != existing:
            raise RuntimeError("Index changed during embedding. Retry ingestion; no rows were changed.")
        connection.execute(sql.SQL("DELETE FROM {} WHERE NOT (content_sha256 = ANY(%s::text[]))").format(table), (desired,))
        # Temporary unique IDs avoid primary-key collisions when content moves between sections.
        connection.execute(sql.SQL("UPDATE {} SET chunk_id = 'pending:' || content_sha256").format(table))
        for chunk in chunks:
            values = tuple(chunk[key] for key in ("chunk_id", "doc_id", "source_path", "heading_path", "chunk_text", "embed_text", "token_count", "fact_ids")) + (Jsonb(chunk["source_refs"]), chunk["content_sha256"])
            if chunk["content_sha256"] in existing:
                connection.execute(sql.SQL("UPDATE {} SET chunk_id=%s, doc_id=%s, source_path=%s, heading_path=%s, chunk_text=%s, embed_text=%s, token_count=%s, fact_ids=%s, source_refs=%s WHERE content_sha256=%s").format(table), values)
            else:
                connection.execute(sql.SQL("INSERT INTO {} (chunk_id,doc_id,source_path,heading_path,chunk_text,embed_text,token_count,fact_ids,source_refs,content_sha256,embedding) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::vector)").format(table), values + (_vector_literal(new_vectors[chunk["content_sha256"]]),))
    counts = {"added": len(new_chunks), "unchanged": len(chunks) - len(new_chunks), "removed": len(existing - set(desired)), "total": len(chunks)}
    print("Index:", ", ".join(f"{name}={value}" for name, value in counts.items()))
    return counts

# -- Candidate search, optional rank fusion, and final context selection

def search_candidates(question, cfg):
    """Top-n cosine candidates, optionally fused with top-n full-text candidates."""
    from psycopg import sql
    if not isinstance(question, str) or not question.strip():
        raise ValueError("question must be a nonempty string")
    vector = _vector_literal(embed_texts([question], cfg, input_type="query")[0])
    table, n = sql.Identifier("public", _table_name(cfg)), int(cfg["retrieval"]["top_n_candidates"])
    fields = "chunk_id,doc_id,source_path,heading_path,chunk_text,embed_text,token_count,fact_ids,content_sha256,source_refs"
    before = time.perf_counter()
    with _connect(cfg) as connection:
        _check_index_signature(connection, cfg)
        ef_search = int(cfg["database"]["hnsw"]["ef_search"])
        if ef_search < n:
            raise ValueError("hnsw.ef_search must be at least top_n_candidates")
        connection.execute("SELECT set_config('hnsw.ef_search', %s, true)", (str(ef_search),))
        # Keep the inner ORDER BY as the raw distance operator for HNSW.
        # WITH TIES lets the outer deterministic chunk_id order break cutoffs.
        vector_rows = connection.execute(sql.SQL(
            "SELECT " + fields + ", 1 - distance AS similarity_score FROM (SELECT " + fields +
            ", embedding <=> %s::vector AS distance FROM {} "
            "ORDER BY embedding <=> %s::vector FETCH FIRST %s ROWS WITH TIES) AS nearest "
            "ORDER BY distance, chunk_id LIMIT %s"
        ).format(table), (vector, vector, n, n)).fetchall()
        for rank, row in enumerate(vector_rows, 1):
            row.update(vector_rank=rank, lexical_rank=None, rerank_score=None, rerank_rank=None)
        rows = vector_rows
        if cfg["retrieval"]["hybrid"]["enabled"]:
            lexical_rows = connection.execute(sql.SQL("SELECT " + fields + ", 1 - (embedding <=> %s::vector) AS similarity_score, ts_rank_cd(tsv, plainto_tsquery('english', %s)) AS lexical_score FROM {} WHERE tsv @@ plainto_tsquery('english', %s) ORDER BY lexical_score DESC, chunk_id LIMIT %s").format(table), (vector, question, question, n)).fetchall()
            union = {row["chunk_id"]: row for row in vector_rows}
            for rank, row in enumerate(lexical_rows, 1):
                if row["chunk_id"] not in union:
                    union[row["chunk_id"]] = dict(row, vector_rank=None, rerank_score=None, rerank_rank=None)
                union[row["chunk_id"]].update(lexical_rank=rank, lexical_score=row["lexical_score"])
            k = int(cfg["retrieval"]["hybrid"]["rrf_k"])
            for row in union.values():
                row["rrf_score"] = sum(1 / (k + row[rank]) for rank in ("vector_rank", "lexical_rank") if row.get(rank) is not None)
            rows = sorted(union.values(), key=lambda row: (-row["rrf_score"], row["chunk_id"]))[:n]
    for rank, row in enumerate(rows, 1):
        row["candidate_rank"] = rank
    _STATS["search_seconds"] += time.perf_counter() - before
    return rows


def retrieve(question, cfg):
    """Return top-k contexts; an optional raw-logit threshold can return []."""
    candidates = search_candidates(question, cfg)
    if cfg["rerank"]["enabled"]:
        candidates = rerank_candidates(question, candidates, cfg)
        threshold = cfg["retrieval"].get("min_rerank_score")
        if threshold is not None and (not candidates or candidates[0]["rerank_score"] < float(threshold)):
            return []
    elif cfg["retrieval"].get("min_rerank_score") is not None:
        raise ValueError("A reranker threshold cannot be used when reranking is disabled")
    result = candidates[:int(cfg["retrieval"]["top_k"])]
    for rank, row in enumerate(result, 1):
        row["retrieval_rank"] = rank
    return result


def all_chunks(cfg):
    """Read source/evidence metadata, without transferring stored vectors."""
    from psycopg import sql
    with _connect(cfg) as connection:
        _check_index_signature(connection, cfg)
        return connection.execute(sql.SQL("SELECT chunk_id,doc_id,source_path,heading_path,chunk_text,embed_text,token_count,fact_ids,content_sha256,source_refs FROM {} ORDER BY source_path,chunk_id").format(sql.Identifier("public", _table_name(cfg)))).fetchall()

# -- Accounting and releasing accelerator memory

def stats():
    """Process-local counters: input tokens count uncached model work, excluding pad."""
    return copy.deepcopy(_STATS)


def release_models():
    """Free BGE weights before loading a Qwen answer model; retain tokenizers/cache."""
    import gc
    import torch
    _MODELS.clear()
    gc.collect()
    if torch.backends.mps.is_available():
        torch.mps.empty_cache()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
