from __future__ import annotations

import random
from typing import Optional


FACTS = [
    {
        "title": "Thin Lizzy",
        "body": "Formed in Dublin in 1969, Thin Lizzy became one of Ireland’s most influential rock bands, blending hard rock with storytelling.",
    },
    {
        "title": "The Smiths",
        "body": "Morrissey’s mother was Irish, part of a wider Irish cultural influence across British music in the 1980s.",
    },
    {
        "title": "Oasis",
        "body": "The Gallagher brothers have Irish parents, reflecting the deep Irish roots behind many British rock bands.",
    },
    {
        "title": "Halloween",
        "body": "Halloween traces back to the Irish festival of Samhain, marking the end of the harvest season.",
    },
    {
        "title": "Guinness Harp",
        "body": "The Guinness harp faces the opposite direction of the official Irish state harp.",
    },
    {
        "title": "Newgrange",
        "body": "Newgrange is older than both Stonehenge and the Egyptian pyramids.",
    },
]


def fetch_irish_connection(rng: random.Random) -> dict[str, Optional[str]]:
    fact = rng.choice(FACTS)
    return {
        "title": fact["title"],
        "body": fact["body"],
        "source_url": None,
    }