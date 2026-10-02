"""Download and verify FashionMNIST once in the shared lab cache."""
from pathlib import Path
from torchvision import datasets

CACHE = Path(__file__).resolve().parents[2] / "_shared_data"
CACHE.mkdir(exist_ok=True)
train = datasets.FashionMNIST(CACHE, train=True, download=True)
test = datasets.FashionMNIST(CACHE, train=False, download=True)
if len(train) != 60_000 or len(test) != 10_000:
    raise RuntimeError("FashionMNIST integrity check failed")
print(f"FashionMNIST verified: {len(train):,} train + {len(test):,} test at {CACHE}")
