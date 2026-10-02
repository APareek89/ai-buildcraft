#!/usr/bin/env python3
"""Score saved ESCI predictions without training or calling any model.

Usage: python scripts/score.py --predictions predictions.jsonl \
    --test-file data/test_pointwise.jsonl [--output scores.json]

Prediction records have ``id`` and ``prediction`` fields. A pointwise ID is
``str(meta.example_ids[0])``. A listwise ID is ``listwise:`` followed by the first
16 hex characters of SHA-256 over newline-joined example IDs in candidate order.
``record_id`` implements this contract. An explicit top-level test-record ``id``
overrides the derived ID when present; the supplied dataset builder uses no
top-level ID. Unknown or duplicate prediction IDs are errors. Missing IDs remain
in all scoring denominators as invalid predictions.

Pointwise parsing takes the first whole label word, case-insensitively.
Listwise parsing requires strict JSON, without Markdown-fence removal. Values
must be full label names, case-insensitively, with optional outer whitespace.
Missing keys or invalid values make those items invalid while preserving other
valid entries. Extra keys, duplicate keys, and non-object JSON invalidate the
whole response. Duplicate keys are syntactically JSON, but fail schema checks.
JSON parse and full-schema-valid rates both use all expected listwise records,
including missing responses. Gold labels come from ``meta.labels``.
"""

from __future__ import annotations

import argparse
from collections import Counter
from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
import re
import sys
from typing import Any, Iterable

LABELS = ("Exact", "Substitute", "Complement", "Irrelevant")
INVALID = "INVALID"
_NORMALIZED = {label.casefold(): label for label in LABELS}
_LABEL_WORD = re.compile(r"\b(Exact|Substitute|Complement|Irrelevant)\b", re.IGNORECASE)


def _identifier(value: Any, context: str) -> str:
    if isinstance(value, bool) or not isinstance(value, (str, int)) or not str(value):
        raise ValueError(f"{context} must be a nonempty string or integer")
    return str(value)


def record_id(record: dict[str, Any]) -> str:
    """Return the stable prediction ID; candidate order is significant in listwise."""
    if "id" in record:
        return _identifier(record["id"], "Top-level test id")
    meta = record.get("meta")
    if not isinstance(meta, dict):
        raise ValueError("Test record must have a meta object")
    ids = meta.get("example_ids")
    if not isinstance(ids, list) or not ids:
        raise ValueError("meta.example_ids must be a nonempty list")
    canonical = [_identifier(value, "Example ID") for value in ids]
    if meta.get("format") == "pointwise":
        if len(canonical) != 1:
            raise ValueError("A pointwise record needs exactly one example ID")
        return canonical[0]
    if meta.get("format") == "listwise":
        digest = hashlib.sha256("\n".join(canonical).encode("utf-8")).hexdigest()[:16]
        return "listwise:" + digest
    raise ValueError("meta.format must be pointwise or listwise")


def normalize_label(value: Any) -> str | None:
    """Normalize only an entire full label name; single-letter codes are invalid."""
    return _NORMALIZED.get(value.strip().casefold()) if isinstance(value, str) else None


def parse_pointwise(value: Any) -> str | None:
    """Take the first whole label word, as specified for pointwise evaluation."""
    if not isinstance(value, str):
        return None
    match = _LABEL_WORD.search(value)
    return _NORMALIZED[match.group(1).casefold()] if match else None


@dataclass(frozen=True)
class ListwiseParse:
    predictions: tuple[str | None, ...]
    json_parsed: bool
    schema_valid: bool
    issues: tuple[str, ...]


def _reject_constant(value: str) -> None:
    raise ValueError(f"Nonstandard JSON constant: {value}")


def parse_listwise(value: Any, count: int) -> ListwiseParse:
    """Parse one response; return exactly one prediction for each expected item."""
    if count < 1:
        raise ValueError("A listwise record must contain at least one item")
    invalid = (None,) * count
    if not isinstance(value, str):
        return ListwiseParse(invalid, False, False, ("missing_or_nontext_response",))
    duplicates: list[str] = []

    def object_hook(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        output = {}
        for key, item in pairs:
            if key in output:
                duplicates.append(key)
            output[key] = item
        return output

    try:
        parsed = json.loads(value, object_pairs_hook=object_hook, parse_constant=_reject_constant)
    except (ValueError, TypeError, RecursionError):
        return ListwiseParse(invalid, False, False, ("invalid_json",))
    if duplicates:
        return ListwiseParse(invalid, True, False, ("duplicate_keys",))
    if not isinstance(parsed, dict):
        return ListwiseParse(invalid, True, False, ("not_an_object",))
    expected = {str(index) for index in range(1, count + 1)}
    actual = set(parsed)
    if actual - expected:
        return ListwiseParse(invalid, True, False, ("extra_keys",))
    predictions = tuple(normalize_label(parsed.get(str(index))) for index in range(1, count + 1))
    issues = []
    if expected - actual:
        issues.append("missing_keys")
    if any(normalize_label(value) is None for value in parsed.values()):
        issues.append("invalid_label_values")
    return ListwiseParse(predictions, True, not issues, tuple(issues))


def _strict_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    output = {}
    for key, value in pairs:
        if key in output:
            raise ValueError(f"Duplicate JSON object key: {key}")
        output[key] = value
    return output


def read_jsonl(path: Path) -> Iterable[tuple[int, dict[str, Any]]]:
    """Read object records, retaining line numbers for actionable input errors."""
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, 1):
            if not line.strip():
                continue
            try:
                row = json.loads(line, object_pairs_hook=_strict_object, parse_constant=_reject_constant)
                if not isinstance(row, dict):
                    raise ValueError("Each JSONL line must be an object")
            except (ValueError, TypeError, RecursionError) as error:
                raise ValueError(f"{path}:{line_number}: {error}") from error
            yield line_number, row


@dataclass(frozen=True)
class TestRecord:
    id: str
    format: str
    labels: tuple[str, ...]


def load_test(path: Path) -> dict[str, TestRecord]:
    output: dict[str, TestRecord] = {}
    seen_examples: set[str] = set()
    for line_number, row in read_jsonl(path):
        try:
            meta = row.get("meta")
            if not isinstance(meta, dict) or meta.get("format") not in {"pointwise", "listwise"}:
                raise ValueError("Each test record needs meta.format = pointwise or listwise")
            ids, labels = meta.get("example_ids"), meta.get("labels")
            if not isinstance(ids, list) or not ids or not isinstance(labels, list) or len(ids) != len(labels):
                raise ValueError("meta.example_ids and meta.labels must be nonempty, equally sized lists")
            canonical = [_identifier(value, "Example ID") for value in ids]
            if len(set(canonical)) != len(canonical) or seen_examples.intersection(canonical):
                raise ValueError("Duplicate example IDs in test data; every item must appear once")
            if meta["format"] == "pointwise" and len(ids) != 1:
                raise ValueError("Pointwise records need exactly one example and one gold label")
            gold = tuple(normalize_label(value) for value in labels)
            if any(value is None for value in gold):
                raise ValueError("Gold labels must be full Exact/Substitute/Complement/Irrelevant names")
            identifier = record_id(row)
            if identifier in output:
                raise ValueError(f"Duplicate test record ID: {identifier}")
            output[identifier] = TestRecord(identifier, meta["format"], gold)
            seen_examples.update(canonical)
        except (ValueError, TypeError, KeyError) as error:
            raise ValueError(f"{path}:{line_number}: {error}") from error
    if not output:
        raise ValueError(f"{path}: test file contains no records")
    return output


def load_predictions(path: Path, expected_ids: set[str]) -> dict[str, Any]:
    output = {}
    for line_number, row in read_jsonl(path):
        try:
            if "id" not in row:
                raise ValueError("Prediction record is missing its id field")
            identifier = _identifier(row["id"], "Prediction id")
            if identifier not in expected_ids:
                raise ValueError(f"Unknown prediction ID: {identifier}; use record_id(test_record)")
            if identifier in output:
                raise ValueError(f"Duplicate prediction ID: {identifier}; keep exactly one response per ID")
            output[identifier] = row.get("prediction")
        except (ValueError, TypeError) as error:
            raise ValueError(f"{path}:{line_number}: {error}") from error
    return output


def classification_metrics(gold: list[str], predictions: list[str | None]) -> dict[str, Any]:
    """Manual fixed-four-class metrics, preserving every invalid item as wrong."""
    if not gold or len(gold) != len(predictions):
        raise ValueError("Supply equally sized, nonempty gold and prediction vectors")
    if any(label not in LABELS for label in gold):
        raise ValueError("Gold vectors must contain canonical full label names")
    columns = (*LABELS, INVALID)
    counts = [[0 for _ in columns] for _ in LABELS]
    for actual, guessed in zip(gold, predictions):
        normalized = guessed if guessed in LABELS else INVALID
        counts[LABELS.index(actual)][columns.index(normalized)] += 1
    per_class = {}
    for index, label in enumerate(LABELS):
        true_positive = counts[index][index]
        support = sum(counts[index])
        predicted = sum(row[index] for row in counts)
        precision = true_positive / predicted if predicted else 0.0
        recall = true_positive / support if support else 0.0
        f1 = 2 * true_positive / (support + predicted) if support + predicted else 0.0
        per_class[label] = {"precision": precision, "recall": recall, "f1": f1, "support": support}
    invalid_count = sum(row[-1] for row in counts)
    return {
        "items": len(gold),
        "accuracy": sum(counts[index][index] for index in range(4)) / len(gold),
        "macro_f1": sum(item["f1"] for item in per_class.values()) / 4,
        "invalid_items": invalid_count,
        "invalid_item_rate": invalid_count / len(gold),
        "per_class": per_class,
        "confusion": {"gold_rows": list(LABELS), "prediction_columns": list(columns), "counts": counts},
    }


def score_files(predictions_path: Path, test_path: Path) -> dict[str, Any]:
    """Align saved outputs by ID, then score each present format independently."""
    test = load_test(test_path)
    predictions = load_predictions(predictions_path, set(test))
    report: dict[str, Any] = {
        "expected_records": len(test), "received_prediction_records": len(predictions),
        "missing_prediction_records": len(test) - len(predictions), "formats": {},
        "parsing_policy": {
            "pointwise": "first case-insensitive whole label word",
            "listwise": "strict JSON object; case-insensitive full label values; no Markdown-fence stripping",
            "listwise_missing_keys": "missing items INVALID; valid present items retained",
            "listwise_extra_or_duplicate_keys": "entire response INVALID",
            "listwise_rate_denominator": "all expected listwise records, including missing predictions",
        },
    }
    for mode in ("pointwise", "listwise"):
        records = [record for record in test.values() if record.format == mode]
        if not records:
            continue
        gold: list[str] = []
        guessed: list[str | None] = []
        parsed_count = schema_count = 0
        issues: Counter[str] = Counter()
        for record in records:
            raw = predictions.get(record.id)
            gold.extend(record.labels)
            if mode == "pointwise":
                guessed.append(parse_pointwise(raw))
            else:
                result = parse_listwise(raw, len(record.labels))
                guessed.extend(result.predictions)
                parsed_count += int(result.json_parsed)
                schema_count += int(result.schema_valid)
                issues.update(result.issues)
        group = {
            "records": len(records),
            "received_prediction_records": sum(record.id in predictions for record in records),
            "missing_prediction_records": sum(record.id not in predictions for record in records),
            **classification_metrics(gold, guessed),
        }
        if mode == "listwise":
            group.update(
                json_parsed_records=parsed_count, json_parse_rate=parsed_count / len(records),
                schema_valid_records=schema_count, schema_valid_rate=schema_count / len(records),
                record_issue_counts=dict(sorted(issues.items())),
            )
        report["formats"][mode] = group
    return report


def print_report(report: dict[str, Any]) -> None:
    """Readable terminal tables without optional formatting dependencies."""
    print(
        f"Expected records: {report['expected_records']} | "
        f"Received: {report['received_prediction_records']} | "
        f"Missing: {report['missing_prediction_records']}"
    )
    for mode, result in report["formats"].items():
        print(f"\n{mode.upper()} — {result['items']} items in {result['records']} records")
        print(
            f"Accuracy: {result['accuracy']:.4f} | Macro-F1 (four classes): {result['macro_f1']:.4f} | "
            f"Invalid items: {result['invalid_items']}/{result['items']}"
        )
        if mode == "listwise":
            print(
                f"JSON parsed: {result['json_parsed_records']}/{result['records']} "
                f"({result['json_parse_rate']:.2%}) | "
                f"Schema valid: {result['schema_valid_records']}/{result['records']} "
                f"({result['schema_valid_rate']:.2%})"
            )
            if result["record_issue_counts"]:
                print("Record issues: " + ", ".join(f"{key}={value}" for key, value in result["record_issue_counts"].items()))
        print(f"{'Class':<14}{'Precision':>11}{'Recall':>11}{'F1':>11}{'Support':>11}")
        for label in LABELS:
            item = result["per_class"][label]
            print(f"{label:<14}{item['precision']:>11.4f}{item['recall']:>11.4f}{item['f1']:>11.4f}{item['support']:>11}")
        print("Confusion: gold rows, predicted columns")
        print(f"{'Gold / Pred':<14}" + "".join(f"{label:>13}" for label in (*LABELS, INVALID)))
        for label, row in zip(LABELS, result["confusion"]["counts"]):
            print(f"{label:<14}" + "".join(f"{count:>13}" for count in row))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--predictions", type=Path, required=True)
    parser.add_argument("--test-file", type=Path, required=True)
    parser.add_argument("--output", type=Path, help="Optional JSON metrics report")
    args = parser.parse_args()
    try:
        if args.output and args.output.resolve() in {args.predictions.resolve(), args.test_file.resolve()}:
            raise ValueError("--output must differ from both input files")
        report = score_files(args.predictions, args.test_file)
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print_report(report)
    except (ValueError, OSError) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
