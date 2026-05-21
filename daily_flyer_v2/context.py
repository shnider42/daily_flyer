from __future__ import annotations

from dataclasses import dataclass
from datetime import date


@dataclass
class FlyerContext:
    product: str
    selected_date: date
    seed: int
    audience: str | None = None
    topic: str | None = None

    @property
    def iso_date(self) -> str:
        return self.selected_date.isoformat()

    @property
    def display_date(self) -> str:
        return self.selected_date.strftime("%A, %B %d, %Y")
