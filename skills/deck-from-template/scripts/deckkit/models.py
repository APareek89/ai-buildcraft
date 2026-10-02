"""Plain dataclasses replacing the original pydantic schemas (no extra deps)."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

SLIDE_TYPES = [
    "title",
    "section",
    "big_numbers",
    "cards_2",
    "cards_3",
    "cards_4",
    "chart_insight",
    "table",
    "ranked_list",
    "flow",
    "closing",
]

CHART_TYPES = {"column", "bar", "line", "stacked_bar", "scatter", "waterfall"}


@dataclass
class SlotProfile:
    name: str
    max_chars: int
    font_pt: float
    font_steps: list[float]
    left: int
    top: int
    width: int
    height: int
    ph_idx: int | None = None
    font_weight: str = "regular"
    font_color: str | None = None


@dataclass
class SlideTypeProfile:
    id: str
    label: str
    layout_index: int
    slots: list[SlotProfile]
    supports_chart: bool = False
    origin: str = "component"


@dataclass
class SlideSize:
    w_emu: int
    h_emu: int


@dataclass
class ThemeProfile:
    major_font: str
    minor_font: str
    font_available: dict[str, bool]
    colors: dict[str, str]


@dataclass
class TemplateProfile:
    source: str
    slide_size: SlideSize
    theme: ThemeProfile
    slide_types: list[SlideTypeProfile]
    missing_types: list[str] = field(default_factory=list)

    def slide_type(self, type_id: str) -> SlideTypeProfile:
        for item in self.slide_types:
            if item.id == type_id:
                return item
        raise KeyError(f"unknown slide type: {type_id}")

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "TemplateProfile":
        return cls(
            source=data["source"],
            slide_size=SlideSize(**data["slide_size"]),
            theme=ThemeProfile(**data["theme"]),
            slide_types=[
                SlideTypeProfile(
                    id=item["id"],
                    label=item["label"],
                    layout_index=item["layout_index"],
                    slots=[SlotProfile(**slot) for slot in item["slots"]],
                    supports_chart=item.get("supports_chart", False),
                    origin=item.get("origin", "component"),
                )
                for item in data["slide_types"]
            ],
            missing_types=data.get("missing_types", []),
        )


@dataclass
class ContentSlide:
    """One slide of content.

    Exactly one of `archetype` (clone a real slide from the reference deck and
    refill it) or `slide_type` (compose one from measured house geometry) is set.
    """

    n: int
    slots: dict[str, Any]
    slide_type: str | None = None
    archetype: str | None = None
    notes: str = ""

    @property
    def kind(self) -> str:
        return "archetype" if self.archetype else "type"

    @property
    def label(self) -> str:
        return self.archetype or self.slide_type or "?"


@dataclass
class ContentPlan:
    slides: list[ContentSlide]

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ContentPlan":
        slides = data["slides"] if isinstance(data, dict) else data
        parsed = []
        for index, item in enumerate(slides, start=1):
            type_id = item.get("slide_type")
            archetype = item.get("archetype")
            if bool(type_id) == bool(archetype):
                raise ValueError(
                    f"slide {index}: set exactly one of slide_type or archetype"
                )
            if type_id and type_id not in SLIDE_TYPES:
                raise ValueError(f"slide {index}: unknown slide_type {type_id!r}")
            parsed.append(
                ContentSlide(
                    n=int(item.get("n", index)),
                    slots=item.get("slots", {}),
                    slide_type=type_id,
                    archetype=archetype,
                    notes=item.get("notes", ""),
                )
            )
        return cls(slides=parsed)
