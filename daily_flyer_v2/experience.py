from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class FlyerItem:
    kind: str
    title: str
    body: str
    label: str = ""
    url: str | None = None
    image: str | None = None
    data: dict = field(default_factory=dict)


@dataclass
class FlyerExperience:
    product: str
    layout: str
    title: str
    subtitle: str
    date_label: str
    lead: FlyerItem
    sections: list[FlyerItem]
    actions: list[FlyerItem] = field(default_factory=list)
    footer: str = ""
    data: dict = field(default_factory=dict)
