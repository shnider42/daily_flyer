from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class CardItem:
    card_type: str
    eyebrow: str
    title: str
    body: str
    source_url: Optional[str] = None
    image_url: Optional[str] = None
    cadence: str = "daily"   # daily, weekly
    weight: int = 1          # future-friendly for selection logic

@dataclass
class LanguageItem:
    native_text: str
    english: str
    pronunciation: str = ""
    source_url: Optional[str] = None


@dataclass
class ContentItem:
    title: str
    body: str
    source_url: Optional[str] = None


@dataclass
class StoryItem:
    headline: str
    snippet: str
    source_url: Optional[str] = None


@dataclass
class PageContext:
    page_title: str
    header_title: str
    header_subtitle: str
    today_str: str
    cards: list[CardItem]
    footer_text: str
    metadata: dict = field(default_factory=dict)