from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


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
    word: LanguageItem
    phrase: LanguageItem
    history: ContentItem
    sport: ContentItem
    trivia: ContentItem
    top_story: StoryItem
    footer_text: str
    metadata: dict = field(default_factory=dict)