"""Direct Gemini REST media adapter. No retries or hidden provider fallback.

Images: generateContent with inlineData reference images and image outputs.
Video: Veo predictLongRunning, fixed-origin polling and authenticated download.
See BUILDCRAFT.md for source documentation and the offline verification boundary.
"""
from __future__ import annotations

import base64
import binascii
import logging
import re
import time
from typing import Any
from urllib.parse import urlsplit

from app import config, media_transport as transport

logger = logging.getLogger("plotline.media.gemini")
BASE = "https://generativelanguage.googleapis.com/v1beta"
IMAGE_MODELS = {"gemini-3.1-flash-image", "gemini-3-pro-image-preview"}
VIDEO_MODELS = {"veo-3.1-generate-preview", "veo-3.1-fast-generate-preview"}
RATIOS = {"1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"}
IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp"}
MAX_IMAGE_BYTES = 12 * 1024 * 1024
MAX_REQUEST_BYTES = 20 * 1024 * 1024


class GeminiError(RuntimeError):
    def __init__(self, message: str, policy: bool = False, safe_to_fallback: bool = False):
        self.policy = policy
        self.safe_to_fallback = safe_to_fallback
        super().__init__(message)


def configured() -> bool:
    return bool(config.GEMINI_API_KEY.strip())


def _headers() -> dict[str, str]:
    if not configured():
        raise GeminiError("GEMINI_API_KEY is not set; use MOCK_MEDIA=1 for a free preview")
    return {"x-goog-api-key": config.GEMINI_API_KEY.strip(), "Content-Type": "application/json"}


def _record_rejection(response) -> None:
    # Never store provider prose, prompt text, signed references or the API key.
    code = "unavailable"
    try:
        candidate = response.json().get("error", {}).get("status")
        if candidate in {"INVALID_ARGUMENT", "UNAUTHENTICATED", "PERMISSION_DENIED", "RESOURCE_EXHAUSTED", "NOT_FOUND"}:
            code = candidate
    except (ValueError, AttributeError):
        pass
    detail = f"Gemini rejected submission: status={response.status_code} code={code}"
    logger.warning("gemini_submit_rejected status=%s code=%s", response.status_code, code)
    try:
        from app.execution import require_execution
        from app import store
        actor = require_execution()
        if actor.thread_id:
            store.log_artifact_activity(actor.thread_id, "media", "provider_rejected", detail)
    except Exception:
        logger.warning("gemini_rejection_audit_unavailable")


def _post(path: str, payload: dict[str, Any]) -> dict[str, Any]:
    headers = _headers()
    # The request ledger retains only a digest, including for inline images.
    transport.before_submit(payload, max_bytes=MAX_REQUEST_BYTES)
    try:
        response = transport.request("POST", BASE + path, headers=headers, json_body=payload,
                                     timeout=60, max_bytes=24 * 1024 * 1024)
        if 400 <= response.status_code < 500:
            transport.rejected()
            _record_rejection(response)
            raise GeminiError("Gemini rejected the request", policy=transport.is_policy(response))
        response.raise_for_status()
        result = response.json()
        if not isinstance(result, dict):
            raise ValueError("response_object_required")
        return result
    except GeminiError:
        raise
    except Exception:
        raise GeminiError("Gemini completion unknown; it may have been charged") from None


def _reference(url: str) -> dict[str, str]:
    from app.media_storage import validate_provider_reference
    from app.safe_network import public_get
    validate_provider_reference(url)
    result = public_get(url, max_bytes=MAX_IMAGE_BYTES, max_seconds=30, media=True)
    if result.content_type not in IMAGE_TYPES:
        raise GeminiError("Gemini references must be PNG, JPEG or WebP images")
    return {"mimeType": result.content_type, "data": base64.b64encode(result.body).decode("ascii")}


def _image(model: str, prompt: str, ratio: str, resolution: str, refs: list[str]) -> dict[str, Any]:
    if model not in IMAGE_MODELS or ratio not in RATIOS or resolution not in {"1K", "2K", "4K"}:
        raise GeminiError("Unsupported Gemini image model, aspect ratio or resolution")
    parts = [{"text": prompt}] + [{"inlineData": _reference(url)} for url in refs]
    body = {"contents": [{"role": "user", "parts": parts}], "generationConfig": {
        "responseModalities": ["TEXT", "IMAGE"],
        "imageConfig": {"aspectRatio": ratio, "imageSize": resolution},
    }}
    response = _post(f"/models/{model}:generateContent", body)
    feedback = response.get("promptFeedback") or {}
    if isinstance(feedback, dict) and feedback.get("blockReason"):
        transport.rejected()
        raise GeminiError("Gemini declined the image request", policy=True)
    candidates = response.get("candidates", [])
    if not isinstance(candidates, list) or any(not isinstance(item, dict) for item in candidates):
        raise GeminiError("Gemini returned malformed candidates; charge status retained")
    for candidate in candidates:
        if candidate.get("finishReason") in {"SAFETY", "IMAGE_SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "RECITATION"}:
            transport.rejected()
            raise GeminiError("Gemini declined the image request", policy=True)
        content = candidate.get("content") or {}
        parts = content.get("parts", []) if isinstance(content, dict) else []
        if not isinstance(parts, list) or any(not isinstance(item, dict) for item in parts):
            raise GeminiError("Gemini returned malformed image parts; charge status retained")
        for part in parts:
            if part.get("thought"):
                continue
            inline = part.get("inlineData") or {}
            if not inline:
                continue
            try:
                content_type = inline["mimeType"]
                if content_type not in IMAGE_TYPES:
                    raise ValueError("invalid_image_type")
                data = base64.b64decode(inline["data"], validate=True)
                if not 0 < len(data) <= MAX_IMAGE_BYTES:
                    raise ValueError("invalid_image_size")
                # Validate actual pixels, rather than accepting a labelled HTML body.
                from io import BytesIO
                from PIL import Image
                with Image.open(BytesIO(data)) as image:
                    if image.format not in {"PNG", "JPEG", "WEBP"} or Image.MIME.get(image.format) != content_type:
                        raise ValueError("invalid_image_format")
                    image.verify()
            except (KeyError, TypeError, ValueError, binascii.Error, OSError):
                raise GeminiError("Gemini returned invalid image data; charge status retained") from None
            transport.completed()
            return {"data": data, "content_type": content_type, "model": f"gemini:{model}",
                    "params": {"aspect_ratio": ratio, "output_resolution": resolution}}
    raise GeminiError("Gemini returned no generated image; charge status retained")


def _download_video(uri: str) -> bytes:
    parsed = urlsplit(uri)
    if (parsed.scheme != "https" or parsed.hostname != "generativelanguage.googleapis.com"
        or parsed.port not in (None, 443) or parsed.username or parsed.password or parsed.fragment
        or not re.fullmatch(r"/(?:v1beta/)?files/[A-Za-z0-9_-]+:download", parsed.path)):
        raise GeminiError("Gemini returned an invalid video download location")
    response = transport.request("GET", uri, headers=_headers(), timeout=60, max_bytes=64 * 1024 * 1024)
    if response.status_code in (301, 302, 303, 307, 308):
        # Signed download redirect: retrieve with NO Gemini credentials and DNS/IP checks.
        from app.safe_network import public_get
        result = public_get(response.headers.get("location", ""), max_bytes=64 * 1024 * 1024,
                            max_seconds=120, media=True)
        if result.content_type != "video/mp4":
            raise GeminiError("Gemini returned a non-video download")
        data = result.body
    else:
        response.raise_for_status()
        if response.headers.get("content-type", "").split(";")[0] != "video/mp4":
            raise GeminiError("Gemini returned a non-video download")
        data = response.content
    if len(data) < 12 or data[4:8] != b"ftyp":
        raise GeminiError("Gemini returned invalid MP4 data")
    return data


def _video(model: str, prompt: str, ratio: str, duration_s: float, refs: list[str]) -> dict[str, Any]:
    if model not in VIDEO_MODELS or ratio not in {"9:16", "16:9"} or len(refs) > 2:
        raise GeminiError("Veo requires portrait/landscape output and at most start/end frames")
    duration = min((4, 6, 8), key=lambda value: (abs(value - duration_s), value))
    instance: dict[str, Any] = {"prompt": prompt}
    if refs:
        instance["image"] = {"inlineData": _reference(refs[0])}
    if len(refs) == 2:
        instance["lastFrame"] = {"inlineData": _reference(refs[1])}
    response = _post(f"/models/{model}:predictLongRunning", {
        "instances": [instance], "parameters": {"aspectRatio": ratio, "durationSeconds": duration,
                                               "resolution": "720p", "sampleCount": 1}})
    name = response.get("name", "")
    if not isinstance(name, str) or not re.fullmatch(r"models/" + re.escape(model) + r"/operations/[A-Za-z0-9_-]{1,100}", name):
        raise GeminiError("Gemini returned an invalid operation name; charge status retained")
    transport.accepted(name.rsplit("/", 1)[1])
    deadline = time.monotonic() + 900
    try:
        while time.monotonic() < deadline:
            poll = transport.request("GET", BASE + "/" + name, headers=_headers(), timeout=30)
            poll.raise_for_status()
            status = poll.json()
            if status.get("done"):
                if status.get("error"):
                    raise GeminiError("Veo generation failed; charge status retained", policy=transport.is_policy(poll))
                samples = status.get("response", {}).get("generateVideoResponse", {}).get("generatedSamples", [])
                if not samples:
                    raise GeminiError("Veo returned no video; charge status retained")
                transport.completed()
                data = _download_video(samples[0].get("video", {}).get("uri", ""))
                return {"data": data, "content_type": "video/mp4", "model": f"gemini:{model}",
                        "params": {"aspect_ratio": ratio, "duration": duration, "resolution": "720p"}}
            time.sleep(5)
    except GeminiError:
        raise
    except Exception:
        raise GeminiError("Veo completion or download unknown; it may have been charged") from None
    raise GeminiError("Veo timed out; it may still complete and be charged")


def generate(kind: str, prompt: str, *, ratio="9:16", duration_s=4.0, tier="final", image_urls=None, resolution=None):
    _headers()  # Fail before downloading any references if credentials are absent.
    refs = list(image_urls or [])
    if kind == "image":
        return _image(config.GEMINI_MODELS[config.media_key(kind, tier)], prompt, ratio,
                      resolution or config.IMAGE_RESOLUTION_DEFAULT, refs)
    if kind == "video":
        return _video(config.GEMINI_MODELS["video"], prompt, ratio, duration_s, refs)
    raise GeminiError("Gemini media adapter supports images and video; audio uses fal")
