"""Bounded preparation tests using synthetic fixtures confined to this file.

No fixture is written into the delivered SFT data. The one tokenizer integration
test uses already downloaded local Qwen2 files, runs offline, and never loads
model weights or performs inference. It is skipped when local assets are absent;
when assets exist, Jinja2/chat-template failures fail the test.
"""

from argparse import Namespace
from collections import Counter
from copy import deepcopy
import json
import os
from pathlib import Path
import random
import sys
import tempfile
import unittest
from unittest.mock import patch

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from prepare_esci_sft import (
    LengthFilter, clean_text, get_tokenizer, integrity_check, listwise,
    load_examples, make_record, natural_pointwise, split_queries, train_pointwise,
)


def fixture_row(identifier, query_id, label="E", split="train"):
    """Invented unit-test input, deliberately separate from authentic ESCI files."""
    return {
        "example_id": str(identifier), "query_id": str(query_id),
        "query": f"unit fixture query {query_id}", "product_id": f"product-{identifier}",
        "product_locale": "us", "esci_label": label, "split": split,
        "large_version": 1, "product_title": "unit fixture title",
        "product_brand": "", "product_color": "", "product_bullet_point": "",
        "product_description": "",
    }


def empty_outputs():
    return {name: {"pointwise": [], "listwise": []} for name in ("train", "val", "test")}


class FixedLength:
    """Deterministic unit stub; the real tokenizer is exercised separately below."""

    limits = {"pointwise": 10, "listwise": 10}

    def measure(self, record):
        return 11 if any(value.startswith("too-long") for value in record["meta"]["example_ids"]) else 5


class CleaningAndSplitTests(unittest.TestCase):
    def test_clean_null_html_entities_whitespace_and_caps(self):
        for value in (None, float("nan"), pd.NA):
            self.assertEqual(clean_text(value), "")
        self.assertEqual(clean_text("<b>Blue</b> &amp; white\n\t cotton"), "Blue & white cotton")
        self.assertEqual(clean_text("Keep<script>discard()</script><style>discard</style>text"), "Keep text")
        self.assertEqual(clean_text("&lt;b&gt;Blue&lt;/b&gt;"), "Blue")
        self.assertEqual(clean_text("  abcdefghij  ", 5), "abcde")
        self.assertEqual(clean_text("x" * 400, 300), "x" * 300)
        self.assertEqual(clean_text("x" * 700, 600), "x" * 600)

    def test_query_split_keeps_official_test_and_whole_query_groups(self):
        rows = [fixture_row(f"train-{q}-{i}", f"q-{q}") for q in range(10) for i in range(2)]
        rows += [fixture_row(f"test-{q}-{i}", f"test-q-{q}", split="test") for q in range(3) for i in range(2)]
        frame = pd.DataFrame(rows)
        parts, audit = split_queries(frame, seed=42, val_fraction=0.2)
        again, _ = split_queries(frame, seed=42, val_fraction=0.2)
        query_ids = {name: set(part.query_id) for name, part in parts.items()}
        for left, right in (("train", "val"), ("train", "test"), ("val", "test")):
            self.assertFalse(query_ids[left] & query_ids[right])
        self.assertEqual(len(query_ids["val"]), 2)
        self.assertEqual(set(parts["test"].example_id), set(frame.loc[frame.split.eq("test"), "example_id"]))
        for name, part in parts.items():
            self.assertTrue(part.groupby("query_id").size().eq(2).all())
            self.assertEqual(part.example_id.tolist(), again[name].example_id.tolist())
            self.assertEqual(audit[name]["rows"], len(part))

    def test_source_filter_and_overlap_quarantine_precede_splitting(self):
        rows = [fixture_row("keep", "train-query"),
                fixture_row("overlap-train", "shared"),
                fixture_row("overlap-test", "shared", split="test"),
                fixture_row("foreign", "foreign-query"),
                fixture_row("not-large", "small-query")]
        rows[0]["query"] = None
        rows[3]["product_locale"] = "es"
        rows[4]["large_version"] = 0
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "unit-examples.parquet"
            pd.DataFrame(rows).to_parquet(path, index=False)
            frame, audit = load_examples(path)
        self.assertEqual(set(frame.example_id), {"keep", "overlap-test"})
        self.assertEqual(frame.loc[frame.example_id.eq("keep"), "query"].iloc[0], "")
        self.assertEqual(audit["official_query_id_overlap"], 1)
        self.assertEqual(audit["quarantined_official_training_rows"], 1)


class SamplingTests(unittest.TestCase):
    def test_training_feasible_class_quotas_and_three_pair_cap(self):
        rows = [fixture_row(f"{q}-{label}-{i}", f"q-{q}", label)
                for q in range(10) for label in "ESIC" for i in range(2)]
        used = set()
        records, lengths, audit = train_pointwise(pd.DataFrame(rows), 20, used, FixedLength(), random.Random(42))
        counts = Counter(record["meta"]["labels"][0] for record in records)
        self.assertEqual(counts, {"Exact": 8, "Substitute": 6, "Irrelevant": 4, "Complement": 2})
        query_counts = Counter(record["meta"]["query_id"] for record in records)
        self.assertLessEqual(max(query_counts.values()), 3)
        self.assertEqual(len(used), 20)
        self.assertEqual(len(lengths), 20)
        self.assertEqual(audit["shortfall"], 0)

    def test_training_cap_remains_binding_when_pool_is_too_small(self):
        rows = [fixture_row(f"a-{i}", "only-a", "E") for i in range(8)]
        rows += [fixture_row(f"b-{i}", "only-b", "S") for i in range(8)]
        records, _, audit = train_pointwise(pd.DataFrame(rows), 12, set(), FixedLength(), random.Random(42))
        self.assertEqual(len(records), 6)
        self.assertEqual(Counter(record["meta"]["query_id"] for record in records), {"only-a": 3, "only-b": 3})
        self.assertEqual(audit["shortfall"], 6)

    def test_scarce_complement_keeps_available_row_and_fills_remaining_budget(self):
        rows = [fixture_row("sole-complement", "complement-query", "C")]
        rows += [fixture_row(f"{label}-{i}", f"{label}-q-{i // 2}", label)
                 for label in "ESI" for i in range(12)]
        records, _, audit = train_pointwise(pd.DataFrame(rows), 20, set(), FixedLength(), random.Random(42))
        counts = Counter(record["meta"]["labels"][0] for record in records)
        self.assertEqual(len(records), 20)
        self.assertEqual(counts["Complement"], 1)
        self.assertEqual(audit["complement_quota_shortfall"], 1)
        self.assertEqual(audit["shortfall"], 0)
        self.assertLessEqual(max(Counter(record["meta"]["query_id"] for record in records).values()), 3)

    def test_overlength_rows_are_excluded_from_records_and_used_ids(self):
        rows = [fixture_row("too-long-row", "long-query")]
        rows += [fixture_row(f"short-{i}", f"short-query-{i}") for i in range(5)]
        for builder in (train_pointwise, natural_pointwise):
            with self.subTest(builder=builder.__name__):
                used = set()
                records, lengths, audit = builder(pd.DataFrame(rows), 6, used, FixedLength(), random.Random(42))
                self.assertEqual(len(records), 5)
                self.assertNotIn("too-long-row", used)
                self.assertEqual(audit["length_filtered"], 1)
                self.assertTrue(all(value <= 10 for value in lengths))

    def test_listwise_uses_remaining_distinct_products_and_diverse_labels(self):
        rows = [fixture_row(str(i), "one-query", "E" if i < 2 else "S") for i in range(8)]
        used = {"0"}
        records, _, audit = listwise(pd.DataFrame(rows), 1, used, FixedLength(), random.Random(42))
        self.assertEqual(len(records), 1)
        meta = records[0]["meta"]
        self.assertNotIn("0", meta["example_ids"])
        self.assertGreaterEqual(len(meta["product_ids"]), 4)
        self.assertLessEqual(len(meta["product_ids"]), 8)
        self.assertEqual(len(meta["product_ids"]), len(set(meta["product_ids"])))
        self.assertEqual(set(meta["labels"]), {"Exact", "Substitute"})
        self.assertEqual(audit["groups_with_at_least_two_labels"], 1)


class IntegrityTests(unittest.TestCase):
    def test_repeated_original_id_is_rejected_across_formats(self):
        rows = [fixture_row(str(i), "shared-query", "E" if i < 2 else "S") for i in range(4)]
        outputs = empty_outputs()
        outputs["train"]["pointwise"] = [make_record([rows[0]], "pointwise")]
        outputs["train"]["listwise"] = [make_record(rows, "listwise")]
        with self.assertRaisesRegex(AssertionError, "source example ID"):
            integrity_check(outputs)

    def test_pointwise_malformed_or_gold_mismatched_assistant_is_rejected(self):
        for assistant in ("E", "Exact because it matches", "Irrelevant"):
            with self.subTest(assistant=assistant):
                outputs = empty_outputs()
                record = make_record([fixture_row("a", "query")], "pointwise")
                record["messages"][-1]["content"] = assistant
                outputs["train"]["pointwise"] = [record]
                with self.assertRaises(AssertionError):
                    integrity_check(outputs)

    def test_listwise_wrong_keys_or_labels_are_rejected(self):
        rows = [fixture_row(str(i), "query", "E") for i in range(4)]
        for assistant in ('{"1":"Exact"}', '{"1":"Unknown","2":"Exact","3":"Exact","4":"Exact"}', 'not-json'):
            with self.subTest(assistant=assistant):
                outputs = empty_outputs()
                record = make_record(rows, "listwise")
                record["messages"][-1]["content"] = assistant
                outputs["train"]["listwise"] = [record]
                with self.assertRaises((AssertionError, json.JSONDecodeError)):
                    integrity_check(outputs)

    def test_identical_text_from_distinct_source_ids_is_reported_and_retained(self):
        outputs = empty_outputs()
        first = make_record([fixture_row("a", "query")], "pointwise")
        second = deepcopy(first)
        second["meta"]["example_ids"] = ["b"]
        second["meta"]["product_ids"] = ["different-genuine-product"]
        outputs["train"]["pointwise"] = [first, second]
        report = integrity_check(outputs)
        self.assertEqual(report["duplicate_message_records_with_distinct_source_ids"], 1)
        self.assertEqual(report["unique_original_example_ids_used"], 2)


class LocalTokenizerIntegrationTests(unittest.TestCase):
    def test_qwen2_full_chat_length_and_exact_limit_boundary_offline(self):
        tokenizer_path = ROOT / ".cache/tokenizers/Qwen2.5-3B"
        if not tokenizer_path.is_dir():
            self.skipTest("Local Qwen2 tokenizer assets are absent; this integration check is offline only")
        args = Namespace(tokenizer_path=tokenizer_path, model="Qwen/Qwen2.5-3B", revision=None,
                         pointwise_max_tokens=768, listwise_max_tokens=1536)
        with patch.dict(os.environ, {"HF_HUB_OFFLINE": "1", "TRANSFORMERS_OFFLINE": "1"}):
            tokenizer, template, provenance = get_tokenizer(args)
            record = make_record([fixture_row("integration", "unit-query")], "pointwise")
            length = LengthFilter(tokenizer, template, 768, 1536)
            full_length = length.measure(record)
            expected_ids = tokenizer.apply_chat_template(record["messages"], chat_template=template,
                                                         tokenize=True, add_generation_prompt=False)
            prompt_ids = tokenizer.apply_chat_template(record["messages"][:-1], chat_template=template,
                                                       tokenize=True, add_generation_prompt=False)
            self.assertEqual(full_length, len(expected_ids))
            self.assertGreater(full_length, len(prompt_ids))
            self.assertGreater(full_length, 0)
            self.assertIn("including gold assistant", provenance["length_policy"])
            frame = pd.DataFrame([fixture_row("integration", "unit-query")])
            accepted, _, _ = train_pointwise(
                frame, 1, set(), LengthFilter(tokenizer, template, full_length, 1536), random.Random(42))
            rejected, _, audit = train_pointwise(
                frame, 1, set(), LengthFilter(tokenizer, template, full_length - 1, 1536), random.Random(42))
            self.assertEqual(len(accepted), 1)
            self.assertEqual(rejected, [])
            self.assertEqual(audit["length_filtered"], 1)


if __name__ == "__main__":
    unittest.main()
