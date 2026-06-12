from __future__ import annotations

from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class FlyerContext:
    product: str
    selected_date: date
    seed: int
