"""Download and verify the real FashionMNIST segmentation source images."""
from pathlib import Path
from torchvision import datasets

CACHE = Path(__file__).resolve().parents[2] / "_shared_data"
CACHE.mkdir(exist_ok=True)
train = datasets.FashionMNIST(CACHE, train=True, download=True)
if len(train) != 60_000 or train.data.shape[1:] != (28, 28):
    raise RuntimeError("FashionMNIST image integrity check failed")
foreground = (train.data[:100] > 30).float().mean().item()
if not 0.05 < foreground < 0.8:
    raise RuntimeError("Derived foreground-mask sanity check failed")
print(f"Verified 60,000 real images and deterministic masks at {CACHE}")
