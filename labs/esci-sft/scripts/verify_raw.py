#!/usr/bin/env python3
"""Validate authentic ESCI raw files and record their byte-level provenance.

No sample contents or labels are printed. Parquet is opened with pandas using
one projected column, while PyArrow checks the complete schema and row count.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile
from typing import Any

REPOSITORY = "https://github.com/amazon-science/esci-data"
RELATIVE_DIRECTORY = "shopping_queries_dataset"
EXPECTED_COLUMNS = {
    "shopping_queries_dataset_examples.parquet": {
        "example_id", "query", "query_id", "product_id", "product_locale",
        "esci_label", "small_version", "large_version", "split",
    },
    "shopping_queries_dataset_products.parquet": {
        "product_id", "product_title", "product_description", "product_bullet_point",
        "product_brand", "product_color", "product_locale",
    },
    "shopping_queries_dataset_sources.csv": {"query_id", "source"},
}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_file(path: Path, name: str | None = None) -> dict[str, Any]:
    """Require a readable complete format and expected schema, without samples."""
    import pandas as pd
    import pyarrow.parquet as pq

    name = name or path.name
    if name not in EXPECTED_COLUMNS:
        raise ValueError(f"Unknown ESCI file name: {name}")
    if not path.is_file() or path.stat().st_size == 0:
        raise ValueError(f"Missing or empty raw file: {name}")
    with path.open("rb") as stream:
        prefix = stream.read(256)
    if prefix.startswith(b"version https://git-lfs.github.com/spec/v1"):
        raise ValueError(f"Git LFS pointer text is not dataset content: {name}")
    if name.endswith(".parquet"):
        if not prefix.startswith(b"PAR1"):
            raise ValueError(f"Not a Parquet file (possibly an HTML response): {name}")
        parquet = pq.ParquetFile(path)
        columns = parquet.schema_arrow.names
        missing = EXPECTED_COLUMNS[name] - set(columns)
        if missing:
            raise ValueError(f"Missing columns in {name}: {sorted(missing)}")
        rows = parquet.metadata.num_rows
        # Read actual column data with pandas, rather than accepting a footer alone.
        # A locale projection avoids materializing multi-GB product descriptions.
        probe = pd.read_parquet(path, columns=["product_locale"], engine="pyarrow")
        if len(probe) != rows:
            raise ValueError(f"Pandas/Parquet row count mismatch: {name}")
        del probe
        parquet.close()
    else:
        header = pd.read_csv(path, nrows=0)
        columns = list(header.columns)
        missing = EXPECTED_COLUMNS[name] - set(columns)
        if missing:
            raise ValueError(f"Missing columns in {name}: {sorted(missing)}")
        rows = 0
        for chunk in pd.read_csv(path, usecols=["query_id", "source"],
                                 dtype="string", chunksize=100_000):
            if chunk["query_id"].isna().any() or chunk["source"].isna().any():
                raise ValueError(f"Missing query_id/source values: {name}")
            rows += len(chunk)
    if rows < 1:
        raise ValueError(f"No data rows found: {name}")
    return {"filename": name, "bytes": path.stat().st_size,
            "sha256": sha256_file(path), "rows": rows, "columns": columns,
            "verified_at": datetime.now(timezone.utc).isoformat()}


def verify_revision(metadata: dict[str, Any], revision: str, directory: Path) -> str:
    """Match actual bytes to immutable official LFS metadata or a regular blob.

    A branch revision observed by ls-remote alone is not enough to establish the
    identity of a subsequent main-branch download. This check closes that gap.
    """
    if not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise ValueError("Official revision must be a full 40-character commit SHA.")
    url = (f"https://raw.githubusercontent.com/amazon-science/esci-data/{revision}/"
           f"{RELATIVE_DIRECTORY}/{metadata['filename']}")
    with tempfile.TemporaryDirectory(prefix=".verify-official-", dir=directory) as temp:
        reference = Path(temp) / "official-blob"
        subprocess.run(["curl", "--fail", "--location", "--silent", "--show-error",
                        "--retry", "2", "--max-time", "180", "--output", str(reference), url],
                       check=True)
        with reference.open("rb") as stream:
            prefix = stream.read(1024)
        if prefix.startswith(b"version https://git-lfs.github.com/spec/v1"):
            pointer = prefix.decode("ascii")
            oid = re.search(r"^oid sha256:([0-9a-f]{64})$", pointer, re.MULTILINE)
            size = re.search(r"^size ([0-9]+)$", pointer, re.MULTILINE)
            if not oid or not size:
                raise ValueError("Malformed official LFS pointer.")
            expected_hash, expected_bytes = oid.group(1), int(size.group(1))
        else:
            expected_hash, expected_bytes = sha256_file(reference), reference.stat().st_size
        if metadata["sha256"] != expected_hash or metadata["bytes"] != expected_bytes:
            raise ValueError(f"Downloaded bytes do not match official revision: {metadata['filename']}")
    return url


def record_metadata(root: Path, metadata: dict[str, Any], args: argparse.Namespace) -> None:
    manifest_path = root / "data/raw/source_manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {
        "schema_version": 1, "repository": REPOSITORY, "files": {}, "licenses": {},
    }
    existing = manifest["files"].get(metadata["filename"], {})
    if args.method == "existing" and existing.get("sha256") == metadata["sha256"]:
        # Preserve the original successful source method/URL instead of relabeling it.
        entry = {**existing, **metadata}
    else:
        entry = {**metadata, "download_method": args.method or "existing-unattributed",
                 "original_url": args.original_url or None,
                 "final_url": args.final_url or None, "repo_revision": None}
    entry["path"] = f"data/raw/{metadata['filename']}"
    if args.revision:
        entry["repo_revision"] = args.revision
        entry["revision_verified"] = True
        entry["immutable_metadata_url"] = args.immutable_metadata_url
    manifest["files"][metadata["filename"]] = entry
    manifest["updated_at"] = datetime.now(timezone.utc).isoformat()
    licenses = root / "licenses"
    for name in ("LICENSE", "NOTICE"):
        path = licenses / name
        if path.is_file():
            manifest["licenses"][name] = {
                "path": f"licenses/{name}", "sha256": sha256_file(path),
                "bytes": path.stat().st_size,
                "repo_revision": (licenses / "REVISION").read_text().strip()
                if (licenses / "REVISION").is_file() else None,
            }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = manifest_path.with_suffix(".json.part")
    temporary.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    temporary.replace(manifest_path)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--file", type=Path)
    parser.add_argument("--name", choices=sorted(EXPECTED_COLUMNS))
    parser.add_argument("--quiet", action="store_true")
    parser.add_argument("--record", action="store_true")
    parser.add_argument("--method", choices=["curl-direct", "git-lfs", "existing"])
    parser.add_argument("--original-url", default="")
    parser.add_argument("--final-url", default="")
    parser.add_argument("--revision", default="")
    args = parser.parse_args()
    root = args.root.resolve()
    paths = [(args.file, args.name)] if args.file else [
        (root / "data/raw" / name, name) for name in EXPECTED_COLUMNS]
    for path, name in paths:
        metadata = verify_file(path, name)
        args.immutable_metadata_url = None
        if args.revision:
            args.immutable_metadata_url = verify_revision(metadata, args.revision, root / "data/raw")
        if args.record:
            record_metadata(root, metadata, args)
        if not args.quiet:
            print(f"Verified {metadata['filename']}: {metadata['rows']:,} rows, {metadata['bytes']:,} bytes")
            print("Columns: " + ", ".join(metadata["columns"]))
            print("SHA-256: " + metadata["sha256"])


if __name__ == "__main__":
    main()
