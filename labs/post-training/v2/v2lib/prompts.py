"""The exact serving format used by the main lab's master evaluation (notebook 13), so training matches evaluation.

system = ENGINEERED                                   (engineered: no documents)
system = ENGINEERED + SEPARATOR + format_chunks(...)  (rag_rerank / oracle / rag_no_gold)
user   = the question
"""
from __future__ import annotations

import hashlib
import json

from v2lib import setup

_C = setup.cfg()["prompts"]
ENGINEERED = _C["engineered"]
assert hashlib.sha256(ENGINEERED.encode()).hexdigest() == _C["engineered_sha256"], "ENGINEERED prompt drifted"
SEPARATOR = _C["separator"]
assert SEPARATOR == "\n\n=== MERIDIAN OFFICIAL DOCUMENTS ===\n"
CHUNK_FIELDS = ["chunk_id", "doc_id", "source_path", "heading_path", "chunk_text", "embed_text",
                "token_count", "fact_ids", "content_sha256", "source_refs"]


def canonical_chunk(chunk: dict) -> dict:
    return {key: chunk[key] for key in CHUNK_FIELDS}


def format_chunks(chunks: list[dict]) -> str:
    # Identical to format_chunks in the main lab's master evaluation (notebook 13).
    return "\n\n".join(f"[chunk {c['chunk_id']} | {c['doc_id']}]\n{c['embed_text']}" for c in chunks)


def system_prompt(chunks: list[dict] | None) -> str:
    if not chunks:
        return ENGINEERED
    return ENGINEERED + SEPARATOR + format_chunks(chunks)


def messages(question: str, chunks: list[dict] | None) -> list[dict]:
    return [{"role": "system", "content": system_prompt(chunks)},
            {"role": "user", "content": question}]


def sha(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()
