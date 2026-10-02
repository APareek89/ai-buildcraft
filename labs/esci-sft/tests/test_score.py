"""Scorer arithmetic and parsing fixtures; no model training or inference."""

from contextlib import redirect_stdout
import hashlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from score import (
    LABELS, classification_metrics, parse_listwise, parse_pointwise,
    print_report, record_id, score_files,
)


def test_record(mode, ids, labels):
    content = labels[0] if mode == "pointwise" else json.dumps({str(i + 1): label for i, label in enumerate(labels)})
    return {
        "messages": [{"role": "system", "content": "fixture"},
                     {"role": "user", "content": "fixture"},
                     {"role": "assistant", "content": content}],
        "meta": {"format": mode, "query_id": "query", "query": "fixture",
                 "product_ids": [f"product-{value}" for value in ids],
                 "labels": labels, "example_ids": ids},
    }


class ParserTests(unittest.TestCase):
    def test_pointwise_first_word_and_boundaries(self):
        self.assertEqual(parse_pointwise("I choose SUBSTITUTE, not Exact."), "Substitute")
        self.assertEqual(parse_pointwise("inexact; then Exact"), "Exact")
        self.assertIsNone(parse_pointwise("inexact"))
        self.assertIsNone(parse_pointwise("E"))
        self.assertIsNone(parse_pointwise(None))

    def test_listwise_strict_json_and_case_insensitive_values(self):
        result = parse_listwise('{"1":" exact ","2":"SUBSTITUTE"}', 2)
        self.assertTrue(result.json_parsed)
        self.assertTrue(result.schema_valid)
        self.assertEqual(result.predictions, ("Exact", "Substitute"))
        self.assertFalse(parse_listwise('```json\n{"1":"Exact"}\n```', 1).json_parsed)
        self.assertFalse(parse_listwise('{"1":NaN}', 1).json_parsed)

    def test_missing_keys_get_item_level_invalid(self):
        result = parse_listwise('{"1":"Exact"}', 2)
        self.assertTrue(result.json_parsed)
        self.assertFalse(result.schema_valid)
        self.assertEqual(result.predictions, ("Exact", None))
        self.assertIn("missing_keys", result.issues)

    def test_invalid_value_gets_item_level_invalid(self):
        result = parse_listwise('{"1":"Exact","2":"S"}', 2)
        self.assertEqual(result.predictions, ("Exact", None))
        self.assertIn("invalid_label_values", result.issues)

    def test_extra_keys_reject_entire_response(self):
        result = parse_listwise('{"1":"Exact","2":"Substitute","3":"Exact"}', 2)
        self.assertTrue(result.json_parsed)
        self.assertFalse(result.schema_valid)
        self.assertEqual(result.predictions, (None, None))
        self.assertIn("extra_keys", result.issues)

    def test_duplicate_keys_are_json_but_invalid_schema(self):
        result = parse_listwise('{"1":"Exact","1":"Irrelevant"}', 1)
        self.assertTrue(result.json_parsed)
        self.assertFalse(result.schema_valid)
        self.assertEqual(result.predictions, (None,))
        self.assertIn("duplicate_keys", result.issues)

    def test_nonobject_json_is_parsed_but_invalid(self):
        for value in ('["Exact"]', '"Exact"', 'null'):
            result = parse_listwise(value, 1)
            self.assertTrue(result.json_parsed)
            self.assertFalse(result.schema_valid)
            self.assertEqual(result.predictions, (None,))

    def test_id_contract_and_candidate_order(self):
        point = test_record("pointwise", [123], ["Exact"])
        self.assertEqual(record_id(point), "123")
        group = test_record("listwise", ["2", "1"], ["Exact", "Substitute"])
        expected = "listwise:" + hashlib.sha256(b"2\n1").hexdigest()[:16]
        self.assertEqual(record_id(group), expected)
        group["meta"]["example_ids"].reverse()
        self.assertNotEqual(record_id(group), expected)
        group["id"] = "explicit"
        self.assertEqual(record_id(group), "explicit")


class MetricTests(unittest.TestCase):
    def test_invalid_stays_in_all_item_denominators(self):
        result = classification_metrics(list(LABELS), ["Exact", "Substitute", "Complement", None])
        self.assertEqual(result["accuracy"], 0.75)
        self.assertEqual(result["macro_f1"], 0.75)
        self.assertEqual(result["confusion"]["counts"][3], [0, 0, 0, 0, 1])
        self.assertEqual(result["per_class"]["Irrelevant"]["recall"], 0)

    def test_macro_f1_always_averages_four_classes(self):
        result = classification_metrics(["Exact", "Exact"], ["Exact", "Exact"])
        self.assertEqual(result["accuracy"], 1)
        self.assertEqual(result["macro_f1"], 0.25)

    def test_false_positive_and_false_negative_arithmetic(self):
        result = classification_metrics(["Exact", "Substitute", "Irrelevant"], ["Exact", "Exact", None])
        self.assertEqual(result["per_class"]["Exact"]["precision"], 0.5)
        self.assertEqual(result["per_class"]["Exact"]["recall"], 1)
        self.assertAlmostEqual(result["per_class"]["Exact"]["f1"], 2 / 3)
        self.assertEqual(result["accuracy"], 1 / 3)


class FileAlignmentTests(unittest.TestCase):
    def score(self, test_rows, prediction_rows):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            test_path, pred_path = root / "test.jsonl", root / "predictions.jsonl"
            for path, rows in ((test_path, test_rows), (pred_path, prediction_rows)):
                path.write_text("".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")
            return score_files(pred_path, test_path)

    def test_missing_prediction_ids_count_invalid(self):
        rows = [test_record("pointwise", [str(i)], [label]) for i, label in enumerate(LABELS)]
        result = self.score(rows, [{"id": "0", "prediction": "Exact"}])
        self.assertEqual(result["missing_prediction_records"], 3)
        self.assertEqual(result["formats"]["pointwise"]["items"], 4)
        self.assertEqual(result["formats"]["pointwise"]["accuracy"], 0.25)
        self.assertEqual(result["formats"]["pointwise"]["invalid_items"], 3)

    def test_mixed_files_and_parse_rates_include_missing_records(self):
        point = test_record("pointwise", ["p"], ["Exact"])
        first = test_record("listwise", ["a", "b"], ["Exact", "Substitute"])
        second = test_record("listwise", ["c", "d"], ["Complement", "Irrelevant"])
        result = self.score([point, first, second], [
            {"id": "p", "prediction": "Exact"},
            {"id": record_id(first), "prediction": '{"1":"Exact"}'},
        ])
        self.assertEqual(set(result["formats"]), {"pointwise", "listwise"})
        group = result["formats"]["listwise"]
        self.assertEqual(group["json_parse_rate"], 0.5)
        self.assertEqual(group["schema_valid_rate"], 0)
        self.assertEqual(group["accuracy"], 0.25)
        self.assertEqual(group["invalid_items"], 3)
        with redirect_stdout(io.StringIO()) as output:
            print_report(result)
        self.assertIn("Confusion", output.getvalue())
        self.assertIn("INVALID", output.getvalue())

    def test_duplicate_prediction_ids_fail(self):
        row = test_record("pointwise", ["p"], ["Exact"])
        with self.assertRaisesRegex(ValueError, "Duplicate prediction ID"):
            self.score([row], [{"id": "p", "prediction": "Exact"}] * 2)

    def test_unknown_prediction_ids_fail(self):
        row = test_record("pointwise", ["p"], ["Exact"])
        with self.assertRaisesRegex(ValueError, "Unknown prediction ID"):
            self.score([row], [{"id": "wrong", "prediction": "Exact"}])

    def test_empty_prediction_file_counts_every_item_invalid(self):
        group = test_record("listwise", ["a", "b"], ["Exact", "Substitute"])
        result = self.score([group], [])
        self.assertEqual(result["formats"]["listwise"]["invalid_items"], 2)
        self.assertEqual(result["formats"]["listwise"]["accuracy"], 0)

    def test_duplicate_test_example_ids_fail(self):
        row = test_record("pointwise", ["p"], ["Exact"])
        with self.assertRaisesRegex(ValueError, "Duplicate example IDs"):
            self.score([row, row], [])


if __name__ == "__main__":
    unittest.main()
