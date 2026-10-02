"""Build a deck that mixes cloned reference archetypes with generated slides."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .catalog import clone_slide, drop_shape, set_picture, set_table, set_text, _shape_at
from .models import ContentPlan, ContentSlide, TemplateProfile
from .profile import open_presentation
from .render import RenderError, _remove_all_slides, render_one


class ComposeError(RenderError):
    pass


def _archetype(catalog: dict[str, Any], name: str) -> dict[str, Any]:
    for item in catalog.get("archetypes", []):
        if item["id"] == name:
            return item
    known = ", ".join(item["id"] for item in catalog.get("archetypes", []))
    raise ComposeError(f"unknown archetype {name!r}; catalog has: {known or '(none)'}")


def _check_capacity(archetype: dict[str, Any], slot: dict[str, Any], value: Any, n: int) -> None:
    cap = slot.get("max_chars")
    if cap is None:
        return
    text = "\n".join(str(item) for item in value) if isinstance(value, list) else str(value)
    if len(text) > cap:
        raise ComposeError(
            f"slide {n} ({archetype['id']}.{slot['name']}): {len(text)} characters, "
            f"but this slot in the reference deck holds {cap}"
        )


def render_archetype(
    dest: Any, source_slides: list[Any], catalog: dict[str, Any], content: ContentSlide
) -> None:
    archetype = _archetype(catalog, content.archetype or "")
    number = int(archetype["source_slide"])
    if not 1 <= number <= len(source_slides):
        raise ComposeError(f"{archetype['id']}: source_slide {number} does not exist")

    slots = {slot["name"]: slot for slot in archetype.get("slots", [])}
    unknown = [name for name in content.slots if name not in slots]
    if unknown:
        raise ComposeError(
            f"slide {content.n}: {archetype['id']} has no slot "
            f"{', '.join(sorted(unknown))}; valid slots are {', '.join(sorted(slots))}"
        )

    slide = clone_slide(source_slides[number - 1], dest)
    font = catalog.get("minor_font", "Arial")

    # Resolve every shape up front: deleting as we go would shift later indices.
    planned: list[tuple[Any, dict[str, Any], Any]] = []
    for name, slot in slots.items():
        value = content.slots.get(name)
        if value is not None:
            _check_capacity(archetype, slot, value, content.n)
        planned.append((_shape_at(slide, int(slot["shape"])), slot, value))

    for shape, slot, value in planned:
        kind = slot.get("kind", "text")
        if value is None:
            if slot.get("on_empty", "delete") == "delete":
                drop_shape(shape)
            continue
        if kind == "table":
            set_table(shape, value, font, float(slot.get("font_pt") or 14.0), slot.get("bold"))
        elif kind == "picture":
            set_picture(slide, shape, Path(str(value)).expanduser())
        elif kind in {"text", "empty_text", "shape"}:
            set_text(shape, value, font, float(slot.get("font_pt") or 18.0), slot.get("bold"))
        else:
            raise ComposeError(
                f"slide {content.n}: slot {slot['name']!r} is a {kind}, which cannot be refilled"
            )


def compose_deck(
    template_path: Path,
    profile: TemplateProfile,
    plan: ContentPlan,
    output_path: Path,
    catalog: dict[str, Any] | None = None,
) -> dict[str, Any]:
    dest = open_presentation(template_path)
    source = open_presentation(template_path)
    source_slides = list(source.slides)
    _remove_all_slides(dest)

    fallbacks: list[dict[str, Any]] = []
    used: list[str] = []
    for expected, content in enumerate(plan.slides, start=1):
        if content.n != expected:
            raise ComposeError("content slides must be sequentially numbered from 1")
        if content.kind == "archetype":
            if catalog is None:
                raise ComposeError(
                    f"slide {content.n} uses archetype {content.archetype!r} "
                    "but no catalog was supplied"
                )
            render_archetype(dest, source_slides, catalog, content)
        else:
            fallbacks.extend(render_one(dest, content, profile))
        used.append(f"{content.n}:{content.kind}:{content.label}")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    dest.save(output_path)
    (output_path.parent / "render_fallbacks.json").write_text(
        json.dumps({"count": len(fallbacks), "fallbacks": fallbacks}, indent=2) + "\n",
        encoding="utf-8",
    )
    return {
        "slides": len(plan.slides),
        "cloned": sum(1 for item in used if ":archetype:" in item),
        "generated": sum(1 for item in used if ":type:" in item),
        "fallbacks": fallbacks,
    }
