"""Idempotently cache MovieLens 100k under the lab's shared data folder."""
from pathlib import Path
from urllib.request import urlopen
from zipfile import ZipFile
from io import BytesIO

URL = "https://files.grouplens.org/datasets/movielens/ml-100k.zip"
MIRROR = "https://huggingface.co/datasets/includeno/movielens-100k/resolve/main/u.data"
ROOT = Path(__file__).resolve().parents[2]
TARGET = ROOT / "_shared_data" / "ml-100k"
RATINGS = TARGET / "u.data"


def valid() -> bool:
    return RATINGS.exists() and sum(1 for _ in RATINGS.open("rb")) == 100_000


if valid():
    print(f"MovieLens 100k already verified at {RATINGS}")
else:
    print(f"Downloading {URL}")
    shared = ROOT / "_shared_data"
    shared.mkdir(exist_ok=True)
    try:
        archive = ZipFile(BytesIO(urlopen(URL, timeout=45).read()))
        members = [name for name in archive.namelist() if name.startswith("ml-100k/") and ".." not in Path(name).parts]
        for name in members:
            archive.extract(name, shared)
    except Exception as exc:
        print(f"Primary archive unavailable ({type(exc).__name__}); using the read-only dataset mirror.")
        TARGET.mkdir(parents=True, exist_ok=True)
        RATINGS.write_bytes(urlopen(MIRROR, timeout=45).read())
    if not valid():
        raise RuntimeError("MovieLens integrity check failed: expected exactly 100,000 rating rows")
    print(f"Downloaded and verified 100,000 ratings at {RATINGS}")
