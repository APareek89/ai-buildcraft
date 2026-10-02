#!/usr/bin/env python3
"""Build authentic ESCI pointwise/listwise chat JSONL; tokenize only, never train.

Example: python scripts/prepare_esci_sft.py --small \
    --tokenizer-path .cache/tokenizers/Qwen2.5-3B

All sampling is seeded. Product Parquet is streamed and projected before a
locale-and-product-ID join, so descriptions do not require loading every product.
"""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import hashlib
from html import unescape
from html.parser import HTMLParser
import json
from pathlib import Path
import random
import re
from typing import Any

import pandas as pd
import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.dataset as ds
import pyarrow.parquet as pq
from transformers import AutoTokenizer


ROOT = Path(__file__).resolve().parents[1]
LABEL_WORDS = {"E": "Exact", "S": "Substitute", "C": "Complement", "I": "Irrelevant"}
LABEL_ORDER = ("Exact", "Substitute", "Complement", "Irrelevant")
MODELS = ("Qwen/Qwen2.5-3B", "Qwen/Qwen3-4B-Base")
MODEL_REVISIONS = {MODELS[0]: "3aab1f1954e9cc14eb9509a215f9e5ca08227a9b",
                   MODELS[1]: "906bfd4b4dc7f14ee4320094d8b41684abff8539"}
RUBRIC = "\n".join([
    "Exact: The product satisfies the query's intent and requested attributes.",
    "Substitute: The product serves the same intended purpose but does not fully match the requested product or attributes.",
    "Complement: The product is an accessory or companion used with the requested product; it does not replace it.",
    "Irrelevant: The product neither satisfies the query nor serves as a useful substitute or complement.",
])
POINTWISE_SYSTEM = RUBRIC + "\nAnswer with exactly one word: Exact, Substitute, Complement, or Irrelevant."
LISTWISE_SYSTEM = RUBRIC + (
    '\nAnswer with only a JSON object mapping each numbered product to one label: '
    'Exact, Substitute, Complement, or Irrelevant. Use double-quoted numeric keys '
    'and double-quoted label values, with no extra text.'
)
CHATML_TEMPLATE = (
    "{% for message in messages %}{{ '<|im_start|>' + message['role'] + '\\n' + "
    "message['content'] + '<|im_end|>\\n' }}{% endfor %}"
    "{% if add_generation_prompt %}{{ '<|im_start|>assistant\\n' }}{% endif %}"
)
DEFAULT_COUNTS = {"train": {"pointwise": 8000, "listwise": 1000},
                  "val": {"pointwise": 600, "listwise": 100},
                  "test": {"pointwise": 2000, "listwise": 300}}
SMALL_COUNTS = {"train": {"pointwise": 800, "listwise": 100},
                "val": {"pointwise": 100, "listwise": 20},
                "test": {"pointwise": 300, "listwise": 50}}
EXAMPLE_COLUMNS = ["example_id", "query_id", "query", "product_id", "product_locale",
                   "esci_label", "split", "large_version"]
PRODUCT_COLUMNS = ["product_id", "product_locale", "product_title", "product_brand",
                   "product_color", "product_bullet_point", "product_description"]
OUTPUT_NAMES = ["train.jsonl", "val.jsonl", "test_pointwise.jsonl", "test_listwise.jsonl",
                "stats.json", "README.md"]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(4 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def semantic_hash(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"),
                                     ensure_ascii=False).encode("utf-8")).hexdigest()


def named_rng(seed: int, name: str) -> random.Random:
    """Independent streams keep one split's sampling out of another split's RNG."""
    value = int(hashlib.sha256(f"{seed}\n{name}".encode()).hexdigest(), 16)
    return random.Random(value)


class PlainText(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.hidden = 0

    def handle_starttag(self, tag: str, attrs: Any) -> None:
        if tag in {"script", "style"}:
            self.hidden += 1
        self.parts.append(" ")

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style"} and self.hidden:
            self.hidden -= 1
        self.parts.append(" ")

    def handle_data(self, data: str) -> None:
        if not self.hidden:
            self.parts.append(data)


def clean_text(value: Any, max_chars: int | None = None) -> str:
    """Remove HTML, decode entities, collapse whitespace, then cap characters."""
    if value is None or pd.isna(value):
        return ""
    text = unescape(str(value))
    if "<" in text:
        parser = PlainText()
        parser.feed(text)
        parser.close()
        text = "".join(parser.parts)
    text = " ".join(text.split())
    return text[:max_chars].strip() if max_chars is not None else text


def load_examples(path: Path) -> tuple[pd.DataFrame, dict[str, int]]:
    schema = pq.read_schema(path)
    missing = set(EXAMPLE_COLUMNS) - set(schema.names)
    if missing:
        raise ValueError(f"Examples Parquet is missing columns: {sorted(missing)}")
    # Filtering occurs before any product data is loaded or merged.
    predicate = (ds.field("product_locale") == "us") & (ds.field("large_version") == 1)
    frame = ds.dataset(path, format="parquet").to_table(
        columns=EXAMPLE_COLUMNS, filter=predicate).to_pandas()
    before = len(frame)
    required = ["example_id", "query_id", "product_id", "split", "esci_label"]
    if frame[required].isna().any().any():
        raise ValueError("Filtered examples have missing IDs, splits, or gold labels.")
    for column in required + ["product_locale"]:
        frame[column] = frame[column].map(str)
    # Clean each distinct query once, rather than parsing it for every product.
    frame["query"] = frame["query"].fillna("").map(str)
    query_text = {value: clean_text(value) for value in frame["query"].unique()}
    frame["query"] = frame["query"].map(query_text)
    if frame[required].eq("").any().any():
        raise ValueError("Filtered examples contain empty required fields.")
    if frame.example_id.duplicated().any():
        raise ValueError("Source example IDs are not unique; refusing ambiguous supervision.")
    if not set(frame.esci_label).issubset(LABEL_WORDS):
        raise ValueError("Source has a gold label outside E/S/C/I.")
    if not set(frame.split).issubset({"train", "test"}):
        raise ValueError("Only the official train/test split names are supported.")
    consistency = frame.groupby(["split", "query_id"])["query"].nunique()
    if consistency.gt(1).any():
        raise ValueError("An official query ID has multiple query strings.")
    train_ids = set(frame.loc[frame.split.eq("train"), "query_id"])
    test_ids = set(frame.loc[frame.split.eq("test"), "query_id"])
    overlap = train_ids & test_ids
    quarantine = frame.split.eq("train") & frame.query_id.isin(overlap)
    audit = {"us_large_examples": before, "official_query_id_overlap": len(overlap),
             "quarantined_official_training_rows": int(quarantine.sum())}
    # Keep the official test unchanged; remove implicated complete train groups.
    return frame.loc[~quarantine].reset_index(drop=True), audit


def join_products(examples: pd.DataFrame, path: Path) -> tuple[pd.DataFrame, dict[str, int]]:
    """Stream only relevant US products, clean/cap text before retaining it."""
    source = pq.ParquetFile(path)
    missing = set(PRODUCT_COLUMNS) - set(source.schema_arrow.names)
    if missing:
        raise ValueError(f"Products Parquet is missing columns: {sorted(missing)}")
    wanted = pa.array(sorted(examples.product_id.unique().tolist()), type=pa.string())
    pieces: list[pd.DataFrame] = []
    for batch in source.iter_batches(batch_size=32768, columns=PRODUCT_COLUMNS):
        table = pa.Table.from_batches([batch])
        mask = pc.and_(pc.equal(table["product_locale"], "us"),
                       pc.is_in(table["product_id"], value_set=wanted))
        table = table.filter(mask)
        if not len(table):
            continue
        part = table.to_pandas()
        for column, limit in [("product_title", 300), ("product_bullet_point", 600),
                              ("product_description", 600), ("product_brand", None),
                              ("product_color", None)]:
            part[column] = part[column].map(lambda value, cap=limit: clean_text(value, cap))
        pieces.append(part)
    if not pieces:
        raise ValueError("No relevant US products were found.")
    products = pd.concat(pieces, ignore_index=True)
    del pieces
    if products.duplicated(["product_id", "product_locale"]).any():
        raise ValueError("Product metadata has duplicate locale/product keys.")
    merged = examples.merge(products, on=["product_id", "product_locale"], how="left",
                            validate="many_to_one", indicator=True, sort=False)
    unmatched = int(merged["_merge"].ne("both").sum())
    if unmatched:
        raise ValueError(f"{unmatched} examples have no locale-and-ID-matched product metadata.")
    merged = merged.drop(columns="_merge")
    empty = merged.product_title.eq("")
    audit = {"matched_unique_products": len(products), "unmatched_product_rows": unmatched,
             "dropped_empty_title_rows": int(empty.sum())}
    return merged.loc[~empty].reset_index(drop=True), audit


def split_queries(frame: pd.DataFrame, seed: int, val_fraction: float) -> tuple[dict[str, pd.DataFrame], dict[str, Any]]:
    train_ids = sorted(frame.loc[frame.split.eq("train"), "query_id"].unique().tolist())
    random.Random(seed).shuffle(train_ids)
    val_count = int(len(train_ids) * val_fraction)
    if val_fraction > 0 and len(train_ids) >= 2:
        val_count = max(1, min(val_count, len(train_ids) - 1))
    val_ids = set(train_ids[:val_count])
    official_train = frame.split.eq("train")
    subsets = {
        "train": frame.loc[official_train & ~frame.query_id.isin(val_ids)].reset_index(drop=True),
        "val": frame.loc[official_train & frame.query_id.isin(val_ids)].reset_index(drop=True),
        "test": frame.loc[frame.split.eq("test")].reset_index(drop=True),
    }
    query_sets = {name: set(part.query_id) for name, part in subsets.items()}
    assert not (query_sets["train"] & query_sets["val"])
    assert not (query_sets["train"] & query_sets["test"])
    assert not (query_sets["val"] & query_sets["test"])
    audit = {name: {"rows": len(part), "query_ids": len(query_sets[name]),
                    "sorted_query_ids_sha256": semantic_hash(sorted(query_sets[name]))}
             for name, part in subsets.items()}
    return subsets, audit


def product_text(row: dict[str, Any], pointwise: bool) -> str:
    fields = [("Title", "product_title"), ("Brand", "product_brand"), ("Color", "product_color")]
    if pointwise:
        fields += [("Bullets", "product_bullet_point"), ("Description", "product_description")]
    return "\n".join(f"{label}: {row[key]}" for label, key in fields if row.get(key, ""))


def make_record(rows: list[dict[str, Any]], format_name: str) -> dict[str, Any]:
    query = rows[0]["query"]
    labels = [LABEL_WORDS[row["esci_label"]] for row in rows]
    if format_name == "pointwise":
        assert len(rows) == 1
        system = POINTWISE_SYSTEM
        user = f"Query: {query}\nProduct:\n{product_text(rows[0], True)}"
        assistant = labels[0]
    else:
        assert 4 <= len(rows) <= 8
        assert len({row["query_id"] for row in rows}) == 1
        assert len({row["product_id"] for row in rows}) == len(rows)
        system = LISTWISE_SYSTEM
        user = f"Query: {query}\nProducts:\n" + "\n\n".join(
            f"{index}.\n{product_text(row, False)}" for index, row in enumerate(rows, 1))
        assistant = json.dumps({str(index): label for index, label in enumerate(labels, 1)},
                               ensure_ascii=False, separators=(",", ":"))
    return {
        "messages": [{"role": "system", "content": system},
                     {"role": "user", "content": user},
                     {"role": "assistant", "content": assistant}],
        "meta": {"format": format_name, "query_id": str(rows[0]["query_id"]), "query": query,
                 "product_ids": [str(row["product_id"]) for row in rows], "labels": labels,
                 "example_ids": [str(row["example_id"]) for row in rows]},
    }


class LengthFilter:
    def __init__(self, tokenizer: Any, template: str, pointwise_max: int, listwise_max: int) -> None:
        self.tokenizer, self.template = tokenizer, template
        self.limits = {"pointwise": pointwise_max, "listwise": listwise_max}

    def measure(self, record: dict[str, Any]) -> int:
        # Include the complete gold assistant turn and every chat special token.
        ids = self.tokenizer.apply_chat_template(record["messages"], chat_template=self.template,
                                                tokenize=True, add_generation_prompt=False)
        return len(ids)


def train_pointwise(frame: pd.DataFrame, requested: int, used: set[str], length: LengthFilter,
                    rng: random.Random) -> tuple[list[dict[str, Any]], list[int], dict[str, Any]]:
    weights = {"E": .4, "S": .3, "I": .2, "C": .1}
    quotas = {label: int(requested * weight) for label, weight in weights.items()}
    residual = requested - sum(quotas.values())
    priorities = sorted(weights, key=lambda label: -(requested * weights[label] - quotas[label]))
    for label in priorities[:residual]:
        quotas[label] += 1
    records, lengths = [], []
    counts: Counter[str] = Counter()
    per_query: Counter[str] = Counter()
    attempted: set[int] = set()
    dropped = 0

    def consider(index: int) -> bool:
        nonlocal dropped
        if index in attempted:
            return False
        attempted.add(index)
        row = frame.iloc[index].to_dict()
        if row["example_id"] in used or per_query[row["query_id"]] >= 3:
            return False
        record = make_record([row], "pointwise")
        tokens = length.measure(record)
        if tokens > length.limits["pointwise"]:
            dropped += 1
            return False
        records.append(record)
        lengths.append(tokens)
        used.add(row["example_id"])
        per_query[row["query_id"]] += 1
        counts[row["esci_label"]] += 1
        return True

    # Reserve scarce Complement examples first; other labels cannot consume all
    # three slots of their query before they get a chance to enter the sample.
    for label in ("C", "I", "S", "E"):
        candidates = frame.index[frame.esci_label.eq(label)].tolist()
        rng.shuffle(candidates)
        for index in candidates:
            if counts[label] >= quotas[label]:
                break
            consider(index)
    # If any quota is infeasible, fill from the remaining authentic eligible pool.
    remainder = frame.index.tolist()
    rng.shuffle(remainder)
    for index in remainder:
        if len(records) >= requested:
            break
        consider(index)
    return records, lengths, {
        "requested": requested, "actual": len(records), "shortfall": requested - len(records),
        "length_filtered": dropped, "attempted_source_rows": len(attempted),
        "target_label_counts": {LABEL_WORDS[key]: value for key, value in quotas.items()},
        "complement_quota_shortfall": max(0, quotas["C"] - counts["C"]),
        "max_pairs_per_query": max(per_query.values(), default=0),
        "fill_rule": "Keep feasible class quotas, then fill from remaining rows with the same length and max-three rules.",
    }


def natural_pointwise(frame: pd.DataFrame, requested: int, used: set[str], length: LengthFilter,
                      rng: random.Random) -> tuple[list[dict[str, Any]], list[int], dict[str, Any]]:
    groups = frame.groupby("query_id", sort=True).indices
    queries = list(groups)
    rng.shuffle(queries)
    records, lengths = [], []
    dropped, attempted = 0, 0
    for query_id in queries:
        # Whole query blocks are traversed without label stratification. Only
        # the final selected block can be shortened to hit an exact row budget.
        indices = list(groups[query_id])
        rng.shuffle(indices)
        for index in indices:
            if len(records) >= requested:
                break
            row = frame.iloc[index].to_dict()
            if row["example_id"] in used:
                continue
            attempted += 1
            record = make_record([row], "pointwise")
            tokens = length.measure(record)
            if tokens > length.limits["pointwise"]:
                dropped += 1
                continue
            records.append(record)
            lengths.append(tokens)
            used.add(row["example_id"])
        if len(records) >= requested:
            break
    return records, lengths, {"requested": requested, "actual": len(records),
                              "shortfall": requested - len(records), "length_filtered": dropped,
                              "attempted_source_rows": attempted, "stratified": False}


def listwise(frame: pd.DataFrame, requested: int, used: set[str], length: LengthFilter,
             rng: random.Random) -> tuple[list[dict[str, Any]], list[int], dict[str, Any]]:
    groups = frame.groupby("query_id", sort=True).indices
    queries = list(groups)
    rng.shuffle(queries)
    records, lengths = [], []
    dropped, insufficient, attempted, diverse, duplicate_products = 0, 0, 0, 0, 0
    signatures: set[tuple[str, ...]] = set()
    for query_id in queries:
        if len(records) >= requested:
            break
        group = frame.iloc[groups[query_id]]
        group = group.loc[~group.example_id.isin(used)]
        before = len(group)
        group = group.drop_duplicates("product_id", keep="first")
        duplicate_products += before - len(group)
        candidates = group.to_dict("records")
        if len(candidates) < 4:
            insufficient += 1
            continue
        rng.shuffle(candidates)
        size = rng.randint(4, min(8, len(candidates)))
        by_label: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in candidates:
            by_label[row["esci_label"]].append(row)
        chosen: list[dict[str, Any]] = []
        if len(by_label) >= 2:
            classes = sorted(by_label)
            rng.shuffle(classes)
            chosen = [by_label[classes[0]][0], by_label[classes[1]][0]]
        chosen_ids = {row["example_id"] for row in chosen}
        chosen += [row for row in candidates if row["example_id"] not in chosen_ids][:size - len(chosen)]
        rng.shuffle(chosen)
        signature = tuple(sorted(row["example_id"] for row in chosen))
        if signature in signatures:
            continue
        signatures.add(signature)
        attempted += 1
        record = make_record(chosen, "listwise")
        tokens = length.measure(record)
        if tokens > length.limits["listwise"]:
            dropped += 1
            continue  # Replenish from the next unused query block.
        records.append(record)
        lengths.append(tokens)
        used.update(row["example_id"] for row in chosen)
        diverse += int(len(set(record["meta"]["labels"])) >= 2)
    return records, lengths, {
        "requested": requested, "actual": len(records), "shortfall": requested - len(records),
        "length_filtered": dropped, "attempted_query_groups": attempted,
        "groups_with_fewer_than_four_remaining_unique_products": insufficient,
        "duplicate_product_rows_ignored": duplicate_products,
        "groups_with_at_least_two_labels": diverse,
        "candidate_pool": "One randomly sized 4–8-product candidate per remaining eligible query; continue to the next query after a length drop.",
    }


def token_stats(lengths: list[int]) -> dict[str, int | float | None]:
    if not lengths:
        return {"p50": None, "p95": None, "max": None}
    values = pd.Series(lengths)
    return {"p50": float(values.quantile(.50)), "p95": float(values.quantile(.95)),
            "max": int(values.max())}


def integrity_check(outputs: dict[str, dict[str, list[dict[str, Any]]]]) -> dict[str, Any]:
    seen_ids: set[str] = set()
    seen_records: set[str] = set()
    duplicate_messages = 0
    queries: dict[str, set[str]] = {name: set() for name in outputs}
    for split, formats in outputs.items():
        for format_name, records in formats.items():
            for record in records:
                assert set(record) == {"messages", "meta"}
                meta, messages = record["meta"], record["messages"]
                assert [message["role"] for message in messages] == ["system", "user", "assistant"]
                assert meta["format"] == format_name
                assert len(meta["example_ids"]) == len(set(meta["example_ids"]))
                assert len(meta["example_ids"]) == len(meta["labels"]) == len(meta["product_ids"])
                assert set(meta["labels"]).issubset(LABEL_ORDER)
                assert not seen_ids.intersection(meta["example_ids"]), "A source example ID was used more than once."
                seen_ids.update(meta["example_ids"])
                queries[split].add(meta["query_id"])
                assistant = messages[-1]["content"]
                if format_name == "pointwise":
                    assert len(meta["example_ids"]) == 1 and assistant in LABEL_ORDER
                    assert assistant == meta["labels"][0]
                else:
                    assert 4 <= len(meta["example_ids"]) <= 8
                    assert len(set(meta["product_ids"])) == len(meta["product_ids"])
                    parsed = json.loads(assistant)
                    assert parsed == {str(index): label for index, label in enumerate(meta["labels"], 1)}
                fingerprint = semantic_hash(messages)
                # Different authentic catalog IDs can collapse to identical text
                # after cleaning/capping. Audit that fact; do not relabel or abort.
                duplicate_messages += int(fingerprint in seen_records)
                seen_records.add(fingerprint)
    for left, right in (("train", "val"), ("train", "test"), ("val", "test")):
        assert not queries[left].intersection(queries[right]), "Query IDs leak between splits."
    training_counts = Counter(record["meta"]["query_id"] for record in outputs["train"]["pointwise"])
    assert max(training_counts.values(), default=0) <= 3, "Training pointwise exceeds three pairs per query."
    return {"zero_query_id_overlap": True, "globally_unique_original_example_ids": True,
            "duplicate_message_records_with_distinct_source_ids": duplicate_messages,
            "assistant_outputs_valid": True,
            "training_pointwise_max_three_per_query": True,
            "unique_original_example_ids_used": len(seen_ids)}


def get_tokenizer(args: argparse.Namespace) -> tuple[Any, str, dict[str, Any]]:
    location = str(args.tokenizer_path) if args.tokenizer_path else args.model
    options: dict[str, Any] = {"use_fast": True, "trust_remote_code": False}
    if args.tokenizer_path:
        options["local_files_only"] = True
    else:
        options["revision"] = args.revision or MODEL_REVISIONS[args.model]
    tokenizer = AutoTokenizer.from_pretrained(location, **options)
    provenance_path = args.tokenizer_path / "provenance.json" if args.tokenizer_path else None
    provenance = json.loads(provenance_path.read_text()) if provenance_path and provenance_path.exists() else {}
    recorded_model = provenance.get("model", provenance.get("repo_id"))
    if recorded_model and recorded_model != args.model:
        raise ValueError("Local tokenizer provenance is for a different --model.")
    revision = args.revision or provenance.get("revision") or tokenizer.init_kwargs.get("_commit_hash")
    if not args.tokenizer_path:
        revision = revision or MODEL_REVISIONS[args.model]
    if args.revision and provenance.get("revision") and args.revision != provenance["revision"]:
        raise ValueError("Local tokenizer provenance differs from --revision.")
    try:
        template = tokenizer.get_chat_template()
        origin = "native tokenizer chat_template"
    except ValueError:
        if args.model not in MODELS:
            raise ValueError("Tokenizer has no chat template and is not a supported Qwen base model.")
        required = {"<|im_start|>", "<|im_end|>"}
        if not required.issubset(tokenizer.get_vocab()):
            raise ValueError("Qwen ChatML fallback requires the standard im_start/im_end special tokens.")
        template, origin = CHATML_TEMPLATE, "explicit standard Qwen ChatML fallback"
    if not isinstance(template, str) or not template.strip():
        raise ValueError("A nonempty resolved chat template is required.")
    local_files = {}
    if args.tokenizer_path:
        local_files = {path.name: sha256_file(path) for path in sorted(args.tokenizer_path.iterdir())
                       if path.is_file() and path.name != "provenance.json"}
    return tokenizer, template, {
        "model": args.model, "revision": revision, "local_tokenizer_file_sha256": local_files,
        "chat_template_origin": origin, "chat_template": template,
        "native_empty_thinking_wrapper": args.model == MODELS[1] and "<think>" in template,
        "chat_template_sha256": hashlib.sha256(template.encode()).hexdigest(),
        "length_policy": "apply_chat_template(tokenize=True, add_generation_prompt=False), including gold assistant",
        "pointwise_max_tokens": args.pointwise_max_tokens, "listwise_max_tokens": args.listwise_max_tokens,
    }


def source_provenance(args: argparse.Namespace, examples: Path, products: Path) -> tuple[dict[str, Any], bool, str | None]:
    """Bind local bytes to the downloader's verified revision without new network."""
    path = args.data_dir / "source_manifest.json"
    manifest = json.loads(path.read_text()) if path.exists() else {}
    files, all_verified = {}, bool(manifest)
    sources = [(examples, "shopping_queries_dataset_examples.parquet"),
               (products, "shopping_queries_dataset_products.parquet")]
    csv = args.data_dir / "shopping_queries_dataset_sources.csv"
    if csv.exists():
        sources.append((csv, csv.name))
    revisions = {manifest.get("files", {}).get(name, {}).get("repo_revision") for _, name in sources}
    inferred_revision = next(iter(revisions)) if len(revisions) == 1 and None not in revisions else None
    revision = args.source_revision or inferred_revision
    for source, canonical_name in sources:
        actual = {"bytes": source.stat().st_size, "sha256": sha256_file(source)}
        expected = manifest.get("files", {}).get(canonical_name)
        if expected is not None:
            if any(actual[key] != expected.get(key) for key in ("bytes", "sha256")):
                raise ValueError(f"Source bytes differ from verified download manifest: {canonical_name}")
            if args.source_revision and expected.get("repo_revision") and expected["repo_revision"] != args.source_revision:
                raise ValueError(f"Source revision differs from --source-revision: {canonical_name}")
            verified = bool(revision and expected.get("revision_verified") and expected.get("repo_revision") == revision)
            actual.update({key: expected.get(key) for key in (
                "original_url", "final_url", "immutable_metadata_url", "repo_revision")})
        else:
            verified = False
        actual["revision_verified"] = verified
        files[canonical_name] = actual
        all_verified = all_verified and verified
    return files, all_verified, revision


def readme(stats: dict[str, Any]) -> str:
    counts = stats["requested_and_actual"]
    count_lines = "\n".join(f"- {split}/{format_name}: requested {info['requested']}, wrote {info['actual']}, "
                            f"length drops {info['length_filtered']}, shortfall {info['shortfall']}."
                            for split, formats in counts.items() for format_name, info in formats.items())
    sources = "\n".join(f"- `{name}`: {info['bytes']} bytes; SHA-256 `{info['sha256']}`."
                        for name, info in stats["source_files"].items())
    return f"""# ESCI supervised fine-tuning data

Generated from authentic US, `large_version == 1` Amazon Science ESCI examples.
No labels were synthesized, no model was trained, and no inference was run.

## Source and license

[Official repository](https://github.com/amazon-science/esci-data), revision
`{stats['source_revision'] or 'unknown'}`. Revision verification:
{'actual source bytes match the downloader manifest and its immutable official revision verification' if stats['source_revision_verified'] else 'UNVERIFIED: local bytes lack matching official-revision provenance; any provided revision is a user declaration only'}.
Source files remain under Apache-2.0; preserve the
upstream LICENSE and NOTICE. Cite Reddy et al., *Shopping Queries Dataset:
A Large-Scale ESCI Benchmark for Improving Product Search*, 2022,
[arXiv:2206.06588](https://arxiv.org/abs/2206.06588). No Amazon endorsement is implied.

{sources}

## Files and schema

`train.jsonl` and `val.jsonl` mix pointwise and listwise records and are shuffled
after mixing. `test_pointwise.jsonl` and `test_listwise.jsonl` remain separate.
Each line has only `messages` and `meta`. `messages` contains system, user, and
gold assistant turns. `meta` retains format, query ID/text, product IDs, expanded
gold labels, and original example IDs. Metadata is not part of model prompts.

Pointwise prediction IDs are the original `meta.example_ids[0]` string. Listwise
IDs are `listwise:` plus the first 16 hex characters of SHA-256 of the ordered
example IDs joined by a newline. Product numbering follows metadata order.

## Exact pointwise system rubric

```text
{POINTWISE_SYSTEM}
```

## Exact listwise system rubric

```text
{LISTWISE_SYSTEM}
```

Pointwise user content is `Query: ...`, then `Product:`, then Title, Brand,
Color, Bullets, and Description lines, omitting empty values. The assistant
returns a single expanded label word. Listwise user content has one query and
4–8 numbered products with title, brand, and color only. Its assistant returns
a strict JSON object mapping string indices `"1"` through `"N"` to label words.

## Build recipe

Seed: {stats['seed']}. Validation fraction: {stats['validation_fraction']}.
Filter US/large examples before merging. Stream projected product Parquet
batches and join on both locale and product ID. Remove HTML and collapse
whitespace; cap title at 300 characters, bullets at 600, and description at 600;
drop rows with an empty cleaned title. Keep only authentic gold labels.

Quarantine complete official-training query IDs also present in official test.
Shuffle sorted surviving official-training query IDs with `random.Random(seed)`;
take floor(query_count × validation_fraction) for validation (at least one when
possible). The official test split stays test. Splits are disjoint by query ID.

Training pointwise targets 40% Exact, 30% Substitute, 20% Irrelevant, and 10%
Complement, with at most three pairs per query. Complement is sampled first;
if any quota is infeasible, fill the remainder from other eligible rows, keeping
the cap. Validation/test pointwise sample random query blocks with no class
stratification; only the final block can be partial to meet the row budget.

Pointwise records are selected first. Listwise records use remaining original
example IDs, 4–8 distinct products from one query, and at least two labels when
available. One random listwise candidate is formed per eligible query; if too
long, continue to the next query until the requested count or pool exhaustion.
No source example ID appears twice, including across formats. Consequently
these are disjoint format-specific test samples, not the same test rows rendered
twice. Counts may fall short when eligibility or length limits exhaust the pool.
Different authentic source products can have identical cleaned/truncated text.
Such records retain their distinct original IDs; their count is reported rather
than silently changing natural validation/test distributions.

The tokenizer is `{stats['tokenizer']['model']}`, revision
`{stats['tokenizer']['revision']}`. Only the tokenizer is loaded on CPU. Token
length includes the exact rendered system, user, gold assistant, and special
tokens via `apply_chat_template`; limits are {stats['tokenizer']['pointwise_max_tokens']}
for pointwise and {stats['tokenizer']['listwise_max_tokens']} for listwise.
Template source: {stats['tokenizer']['chat_template_origin']}.
Template SHA-256: `{stats['tokenizer']['chat_template_sha256']}`.
The exact template and local tokenizer file hashes are recorded in `stats.json`.
{'The native Qwen3 base template adds an empty thinking wrapper when rendering a complete assistant turn. Those wrapper tokens are counted; JSONL assistant content remains exactly the label or JSON, with no generated reasoning.' if stats['tokenizer']['native_empty_thinking_wrapper'] else 'The tokenizer uses its recorded native chat template without replacing it.'}

### Exact tokenizer chat template

```jinja
{stats['tokenizer']['chat_template']}
```

{count_lines}

`stats.json` records requested/actual counts, natural resulting label counts,
token p50/p95/max, length drops, query split fingerprints, source checksums,
and integrity assertions. Re-run the recorded CLI arguments with the same
source bytes, tokenizer files, and dependency versions to reproduce the data.
"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=ROOT / "data/raw")
    parser.add_argument("--examples", type=Path)
    parser.add_argument("--products", type=Path)
    parser.add_argument("--output-dir", type=Path, default=ROOT / "data/sft")
    parser.add_argument("--model", choices=MODELS, default=MODELS[0])
    parser.add_argument("--tokenizer-path", type=Path)
    parser.add_argument("--revision", help="Immutable tokenizer commit; local provenance is used when omitted")
    parser.add_argument("--source-revision", help="Optional expected source commit; normally inferred from the verified download manifest")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--val-fraction", type=float, default=.05)
    parser.add_argument("--pointwise-max-tokens", type=int, default=768)
    parser.add_argument("--listwise-max-tokens", type=int, default=1536)
    parser.add_argument("--small", action="store_true")
    parser.add_argument("--overwrite", action="store_true", help="Replace only this script's named output files")
    for split in ("train", "val", "test"):
        for format_name in ("pointwise", "listwise"):
            parser.add_argument(f"--{split}-{format_name}", type=int)
    args = parser.parse_args()
    if not 0 < args.val_fraction < 1:
        parser.error("--val-fraction must be strictly between zero and one")
    if min(args.pointwise_max_tokens, args.listwise_max_tokens) <= 0:
        parser.error("Token limits must be positive")
    if args.revision and not re.fullmatch(r"[0-9a-f]{40}", args.revision):
        parser.error("--revision must be an immutable 40-character commit")
    counts = {split: dict(formats) for split, formats in (SMALL_COUNTS if args.small else DEFAULT_COUNTS).items()}
    for split, formats in counts.items():
        for format_name in formats:
            override = getattr(args, f"{split}_{format_name}")
            if override is not None:
                if override < 0:
                    parser.error("Requested counts cannot be negative")
                counts[split][format_name] = override
    collisions = [name for name in OUTPUT_NAMES if (args.output_dir / name).exists()]
    if collisions and not args.overwrite:
        parser.error(f"Outputs already exist: {collisions}. Use a new --output-dir or deliberate --overwrite.")
    examples_path = args.examples or args.data_dir / "shopping_queries_dataset_examples.parquet"
    products_path = args.products or args.data_dir / "shopping_queries_dataset_products.parquet"
    for path in (examples_path, products_path):
        if not path.is_file():
            parser.error(f"Source missing: {path}. Run the downloader first.")
    source_files, source_revision_verified, source_revision = source_provenance(args, examples_path, products_path)
    tokenizer, template, tokenizer_meta = get_tokenizer(args)
    length = LengthFilter(tokenizer, template, args.pointwise_max_tokens, args.listwise_max_tokens)
    print("Reading US large-version examples and streaming relevant product fields...", flush=True)
    examples, example_audit = load_examples(examples_path)
    joined, product_audit = join_products(examples, products_path)
    del examples
    subsets, split_audit = split_queries(joined, args.seed, args.val_fraction)
    del joined
    outputs: dict[str, dict[str, list[dict[str, Any]]]] = {}
    length_values: dict[str, dict[str, list[int]]] = {}
    audits: dict[str, Any] = {}
    used: set[str] = set()
    for split, frame in subsets.items():
        print(f"Building {split} pointwise and listwise records...", flush=True)
        point_builder = train_pointwise if split == "train" else natural_pointwise
        points, point_lengths, point_audit = point_builder(
            frame, counts[split]["pointwise"], used, length, named_rng(args.seed, split + "/pointwise"))
        lists, list_lengths, list_audit = listwise(
            frame, counts[split]["listwise"], used, length, named_rng(args.seed, split + "/listwise"))
        outputs[split] = {"pointwise": points, "listwise": lists}
        length_values[split] = {"pointwise": point_lengths, "listwise": list_lengths}
        audits[split] = {"pointwise": point_audit, "listwise": list_audit}
    checks = integrity_check(outputs)
    stats = {
        "seed": args.seed, "small": args.small, "validation_fraction": args.val_fraction,
        "source_revision": source_revision, "source_revision_verified": source_revision_verified,
        "source_files": source_files,
        "source_audit": {**example_audit, **product_audit}, "query_split_pools": split_audit,
        "tokenizer": tokenizer_meta, "requested_and_actual": audits,
        "label_distribution": {split: {format_name: {
            label: sum(record["meta"]["labels"].count(label) for record in records)
            for label in LABEL_ORDER} for format_name, records in formats.items()}
            for split, formats in outputs.items()},
        "label_distribution_unit": "Product decisions; a listwise record contributes 4–8 labels.",
        "token_lengths_by_split": {split: token_stats(formats["pointwise"] + formats["listwise"])
                                   for split, formats in length_values.items()},
        "token_lengths_by_split_format": {split: {format_name: token_stats(values)
                                                  for format_name, values in formats.items()}
                                          for split, formats in length_values.items()},
        "integrity": checks,
        "cli_arguments": {key: str(value) if isinstance(value, Path) else value for key, value in vars(args).items()},
        "rubrics": {"pointwise": POINTWISE_SYSTEM, "listwise": LISTWISE_SYSTEM},
    }
    args.output_dir.mkdir(parents=True, exist_ok=True)
    files: dict[str, list[dict[str, Any]]] = {}
    for split in ("train", "val"):
        mixed = outputs[split]["pointwise"] + outputs[split]["listwise"]
        named_rng(args.seed, split + "/mixed-order").shuffle(mixed)
        files[f"{split}.jsonl"] = mixed
    files["test_pointwise.jsonl"] = outputs["test"]["pointwise"]
    files["test_listwise.jsonl"] = outputs["test"]["listwise"]
    for name, records in files.items():
        with (args.output_dir / name).open("w" if args.overwrite else "x", encoding="utf-8") as stream:
            for record in records:
                stream.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")
    stats["output_files"] = {name: {"rows": len(records), "sha256": sha256_file(args.output_dir / name)}
                             for name, records in files.items()}
    (args.output_dir / "stats.json").write_text(json.dumps(stats, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (args.output_dir / "README.md").write_text(readme(stats), encoding="utf-8")
    print(json.dumps({"requested_and_actual": audits, "token_lengths_by_split": stats["token_lengths_by_split"],
                      "label_distribution": stats["label_distribution"], "integrity": checks}, indent=2))
    for format_name in ("pointwise", "listwise"):
        examples_to_show = [record for split in ("train", "val", "test")
                            for record in outputs[split][format_name]][:2]
        print(f"\n{format_name}: {len(examples_to_show)} authentic output examples")
        for record in examples_to_show:
            print(json.dumps(record, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
