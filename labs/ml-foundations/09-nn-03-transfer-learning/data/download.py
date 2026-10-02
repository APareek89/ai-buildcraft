"""Verify the real FashionMNIST transfer set and cache MobileNetV3 weights."""
import os
from pathlib import Path
from torchvision import datasets, models

CACHE = Path(__file__).resolve().parents[2] / "_shared_data"
CACHE.mkdir(exist_ok=True)
os.environ["TORCH_HOME"] = str(CACHE / "torch")
train = datasets.FashionMNIST(CACHE, train=True, download=True)
test = datasets.FashionMNIST(CACHE, train=False, download=True)
model = models.mobilenet_v3_small(weights=models.MobileNet_V3_Small_Weights.DEFAULT)
if len(train) != 60_000 or len(test) != 10_000 or not model.features:
    raise RuntimeError("FashionMNIST or pretrained-weight integrity check failed")
print(f"FashionMNIST transfer set and MobileNetV3 weights verified at {CACHE}")
