"""Bounded Gemini image generation and reference-image editing.

Only product cleanup and guide mascots use this module. Text/speech routing is
unchanged. Mock mode never opens a connection. Provider errors never expose raw
bodies, prompts, image bytes, signed URLs or credentials.
"""
from __future__ import annotations

import base64
import io
import json
import logging
import math
import re
import time
from dataclasses import dataclass
from pathlib import Path

import httpx
from PIL import Image

from .. import config, usage

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models"
MAX_IMAGE_BYTES = 12 * 1024 * 1024
MAX_JSON_BYTES = 18 * 1024 * 1024
MAX_PIXELS = 20_000_000
PROVIDER_SECONDS = 100
LOG = logging.getLogger("uvicorn.error")


class MediaError(RuntimeError):
    """Fixed, safe error category for the caller's local-art fallback."""


class SafetyRefusal(MediaError):
    """A safety refusal is terminal and must not trigger another provider."""


class RequestRejected(MediaError):
    """An unclassified invalid request must not be resubmitted elsewhere."""


def _safety_rejected(value, depth=0):
    """Read only bounded machine codes; never expose a provider's raw message."""
    if depth > 4: return False
    if isinstance(value, list): return any(_safety_rejected(v, depth+1) for v in value[:20])
    if not isinstance(value, dict): return False
    if value.get("NSFWContent") is True: return True
    codes = {"contentpolicyviolation", "safetyviolation", "contentfilter", "contentfiltered",
             "contentblocked", "safetyblocked", "unsafeprompt", "unsafeimage", "nsfwcontent"}
    for key in ("code", "type", "reason", "reasonCode"):
        code = value.get(key)
        if isinstance(code, str) and len(code) < 100 and re.sub(r"[^a-z]", "", code.lower()) in codes:
            return True
    return any(_safety_rejected(value[key], depth+1) for key in ("errors", "error", "data") if key in value)


@dataclass(frozen=True)
class ImageResult:
    png: bytes
    provider: str
    model: str
    usd: float | None = None
    credits: float | None = None
    mocked: bool = False

    def metadata(self):
        result = {"provider": self.provider, "model": self.model, "mock": self.mocked}
        if self.usd is not None: result["cost_usd"] = self.usd
        if self.credits is not None: result["credits"] = self.credits
        return result


def _number(value):
    if isinstance(value, bool) or not isinstance(value, (float, int)):
        return None
    return float(value) if math.isfinite(value) and value >= 0 else None


def _png(raw: bytes) -> bytes:
    if not raw or len(raw) > MAX_IMAGE_BYTES:
        raise MediaError("image_size_rejected")
    try:
        with Image.open(io.BytesIO(raw)) as image:
            if image.width * image.height > MAX_PIXELS or image.width < 1 or image.height < 1:
                raise MediaError("image_dimensions_rejected")
            if getattr(image, "is_animated", False):
                raise MediaError("animated_output_rejected")
            output = io.BytesIO()
            image.convert("RGBA").save(output, format="PNG")
            value = output.getvalue()
            if len(value) > MAX_IMAGE_BYTES:
                raise MediaError("image_size_rejected")
            return value
    except MediaError:
        raise
    except Exception:
        raise MediaError("invalid_image_output") from None


def _input(path: Path | None):
    if path is None: return None
    if path.stat().st_size > MAX_IMAGE_BYTES: raise MediaError("reference_image_too_large")
    return _png(path.read_bytes())


def _read(client, method, url, *, deadline, limit, **kwargs):
    remaining = deadline - time.monotonic()
    if remaining <= 0: raise MediaError("provider_deadline_exceeded")
    with client.stream(method, url, timeout=min(remaining, 45), **kwargs) as response:
        # Redirects are never followed, including authenticated prediction URLs.
        if not 200 <= response.status_code < 300:
            raw = bytearray()
            for chunk in response.iter_bytes(chunk_size=65536):
                if len(raw)+len(chunk) > 65536 or time.monotonic() >= deadline: break
                raw.extend(chunk)
            try: error = json.loads(raw)
            except (ValueError, UnicodeError, RecursionError): error = None
            if _safety_rejected(error): raise SafetyRefusal("image_safety_refusal")
            # Provider error schemas can vary. Unknown request rejections fail
            # closed too, rather than potentially bypassing a content refusal.
            if response.status_code in {400, 422}: raise RequestRejected("provider_request_rejected")
            raise MediaError("provider_http_failure")
        total = 0; chunks = []
        for chunk in response.iter_bytes():
            total += len(chunk)
            if total > limit: raise MediaError("provider_response_too_large")
            if time.monotonic() >= deadline: raise MediaError("provider_deadline_exceeded")
            chunks.append(chunk)
        return b"".join(chunks)


def _json(client, method, url, *, deadline, **kwargs):
    try:
        value = json.loads(_read(client, method, url, deadline=deadline, limit=MAX_JSON_BYTES, **kwargs))
    except (ValueError, UnicodeError):
        raise MediaError("invalid_provider_json") from None
    if not isinstance(value, dict): raise MediaError("invalid_provider_json")
    return value


def _gemini(client, prompt, reference, aspect):
    if not config.GEMINI_API_KEY: raise MediaError("provider_not_configured")
    model = config.GEMINI_IMAGE_MODEL
    if not re.fullmatch(r"[a-zA-Z0-9._-]+", model): raise MediaError("invalid_image_model")
    parts = [{"text": prompt}]
    if reference:
        parts.append({"inlineData": {"mimeType": "image/png", "data": base64.b64encode(reference).decode()}})
    value = _json(client, "POST", f"{GEMINI_URL}/{model}:generateContent",
                  deadline=time.monotonic()+PROVIDER_SECONDS,
                  headers={"x-goog-api-key": config.GEMINI_API_KEY},
                  json={"contents": [{"role": "user", "parts": parts}],
                        "generationConfig": {"responseModalities": ["TEXT", "IMAGE"],
                                             "imageConfig": {"aspectRatio": aspect}}})
    if value.get("promptFeedback", {}).get("blockReason"):
        raise SafetyRefusal("image_safety_refusal")
    candidates = value.get("candidates", [])
    if not isinstance(candidates, list) or not candidates: raise MediaError("missing_image_output")
    for candidate in candidates:
        if not isinstance(candidate, dict): raise MediaError("unexpected_provider_result")
        if candidate.get("finishReason") in {"SAFETY", "IMAGE_SAFETY", "PROHIBITED_CONTENT", "RECITATION", "BLOCKLIST"}:
            raise SafetyRefusal("image_safety_refusal")
        if candidate.get("finishReason") not in {None, "STOP"}: raise MediaError("incomplete_image_output")
        for part in candidate.get("content", {}).get("parts", []):
            if part.get("thought"): continue
            inline = part.get("inlineData", {})
            if inline.get("mimeType") not in {"image/png", "image/jpeg", "image/webp"}: continue
            encoded = inline.get("data")
            if not isinstance(encoded, str) or len(encoded) > MAX_JSON_BYTES: raise MediaError("missing_image_output")
            try: raw = base64.b64decode(encoded, validate=True)
            except ValueError: raise MediaError("invalid_image_output") from None
            # No fabricated currency cost: Gemini reports token usage, not a charge.
            return ImageResult(_png(raw), "gemini", model)
    raise MediaError("missing_image_output")


def generate(prompt: str, *, reference: Path | None = None, aspect="1:1") -> ImageResult:
    if not isinstance(prompt, str) or not 1 <= len(prompt) <= 6000 or aspect not in {"1:1", "4:3"}:
        raise MediaError("invalid_image_request")
    image = _input(reference)
    if config.MOCK_LLM:
        if image is None:
            output = io.BytesIO();Image.new("RGB", (32, 32), "#e6e6e6").save(output, format="PNG");image=output.getvalue()
        return ImageResult(image, "mock", "local-fixture", usd=0, mocked=True)
    with httpx.Client(follow_redirects=False, trust_env=False) as client:
        for provider in config.MEDIA_PROVIDER_ORDER:
            try:
                result = {"gemini": _gemini}[provider](client, prompt, image, aspect)
                LOG.info("[media-provider] %s", json.dumps({"provider": provider, "status": "success"}))
                # Record only a provider-reported currency cost.
                if result.usd is not None: usage.record(provider+"-image", result.model, usd=result.usd)
                return result
            except SafetyRefusal:
                LOG.info("[media-provider] %s", json.dumps({"provider": provider, "status": "refused"}))
                raise
            except RequestRejected:
                LOG.info("[media-provider] %s", json.dumps({"provider": provider, "status": "rejected"}))
                raise
            except Exception as exc:
                reason = str(exc) if isinstance(exc, MediaError) else "provider_transport_failure"
                LOG.info("[media-provider] %s", json.dumps({"provider": provider, "status": "fallback", "reason": reason}))
    raise MediaError("image_providers_unavailable")
