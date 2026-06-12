from __future__ import annotations

import os
import random
from datetime import timedelta

from daily_flyer_v2.context import FlyerContext
from daily_flyer_v2.data.f9_hub import (
    COMMAND_BOARD_PROMPTS,
    F9_LOGO_URL,
    F9_STADIUM_URL,
    GARAGE_ITEMS,
    JIPORADY_BOARD,
    RLCS_DAILY_PROS,
    RL_ESPORTS_NEWS_URL,
    ROCKET_LEAGUE_HISTORY,
    WARMUPS,
    WORKSHOP_MAPS,
)
from daily_flyer_v2.experience import FlyerExperience, FlyerItem


F9_TOURNEY_URL = os.environ.get("F9_TOURNEY_URL", "").strip()
F9_SIGNUP_ENABLED = os.environ.get("F9_SIGNUP_ENABLED", "").strip().lower() in {"1", "true", "yes", "on"}
F9_JIPORADY_URL = os.environ.get("F9_JIPORADY_URL", "").strip()
F9_DISCORD_URL = os.environ.get("F9_DISCORD_URL", "").strip()
F9_LEGAL_NOTE = "F9 Hub is an unofficial Rocket League community project."


def _pick(items, ordinal: int, offset: int = 0):
    return items[(ordinal + offset) % len(items)]


def _tournament_url() -> str:
    return F9_TOURNEY_URL.rstrip("/") if F9_TOURNEY_URL else ""


def _pick_history(selected_date, ordinal: int) -> dict:
    week_start = selected_date - timedelta(days=selected_date.weekday())
    week_days = {(week_start + timedelta(days=offset)).strftime("%m-%d") for offset in range(7)}
    matches = [entry for entry in ROCKET_LEAGUE_HISTORY if entry.get("month_day") in week_days]
    if matches:
        return matches[ordinal % len(matches)]
    return _pick(ROCKET_LEAGUE_HISTORY, selected_date.isocalendar().week, 1)


def _rlcs_daily_payload(ordinal: int, rng: random.Random) -> dict:
    answer = _pick(RLCS_DAILY_PROS, ordinal, 17)
    decoys = [pro["name"] for pro in RLCS_DAILY_PROS if pro["name"] != answer["name"]]
    options = rng.sample(decoys, k=3) + [answer["name"]]
    rng.shuffle(options)
    return {
        "answer": answer["name"],
        "role": answer["role"],
        "clues": answer["clues"],
        "options": options,
        "pool_size": len(RLCS_DAILY_PROS),
    }


def build(context: FlyerContext) -> FlyerExperience:
    selected = context.selected_date
    ordinal = selected.toordinal()
    rng = random.Random(context.seed)

    garage = _pick(GARAGE_ITEMS, ordinal, 2)
    warmup_name, warmup_body = _pick(WARMUPS, ordinal, 11)
    command = _pick(COMMAND_BOARD_PROMPTS, ordinal, 5)
    history = _pick_history(selected, ordinal)
    workshop = _pick(WORKSHOP_MAPS, selected.isocalendar().week, 3)
    jiporady = _pick(JIPORADY_BOARD, selected.isocalendar().week)

    kickoff_call = rng.choice(["LEFT GOES", "CHEAT UP", "FAKE?", "BACK LEFT", "NO DOUBLE COMMIT"])
    playlist = rng.choice(["2v2", "Private Match", "Replay Review", "RLCS Watch", "Freeplay Lab"])

    lead = FlyerItem(
        kind="match_lobby",
        label="Rocket League daily hub",
        title="F9 Hub",
        body="Daily cards, games, garage picks, RLCS history, and community links for the F9 Rocket League crew.",
        data={"boost": 33 + (ordinal % 68), "kickoff_call": kickoff_call, "playlist": playlist},
    )

    sections: list[FlyerItem] = []
    if F9_SIGNUP_ENABLED and _tournament_url():
        sections.append(
            FlyerItem(
                "tournament",
                "F9 2v2 signup hub",
                "Signup fields stay simple: display name, Discord, RL Tracker link, and region.",
                "Queue desk",
                _tournament_url(),
                data={"roster_url": f"{_tournament_url()}/roster.json", "chips": ["event", "2v2", "Discord", "Region"]},
            )
        )

    garage_chips = ["daily"]
    if garage.get("category"):
        garage_chips.append(garage["category"])
    if garage.get("rarity"):
        garage_chips.append(garage["rarity"])

    sections.extend(
        [
            FlyerItem(
                "command_board",
                command["title"],
                command["body"],
                "F9 Command Board",
                command.get("cta_url") or None,
                data={"mode": command["mode"], "chips": ["daily", command["mode"], "community"]},
            ),
            FlyerItem(
                "garage",
                garage["name"],
                garage.get("caption") or garage.get("body") or "",
                "Garage pick",
                garage.get("source_url") or None,
                data={
                    "chips": garage_chips,
                    "image_url": garage.get("image_url", ""),
                    "category": garage.get("category", ""),
                    "rarity": garage.get("rarity", ""),
                    "source_name": garage.get("source_name", ""),
                    "rights_note": garage.get("rights_note", ""),
                },
            ),
            FlyerItem("warmup", warmup_name, warmup_body, "Warmup drill", data={"chips": ["daily", "freeplay", "before ranked"]}),
            FlyerItem(
                "history",
                history["title"],
                history["body"],
                "History card",
                history.get("source_url") or None,
                data={"chips": [history["cadence"], "sourced"], "source_note": history["source_note"], "source_url": history.get("source_url", "")},
            ),
            FlyerItem("workshop", workshop["title"], workshop["body"], "Workshop card", data={"chips": [workshop["cadence"], "manual source"], "source_note": workshop["source_note"]}),
        ]
    )

    actions = [
        FlyerItem("rlcs_daily", "RLCS Daily", "Guess today's pro from clues. One answer, four choices, and a deeper pro pool than the first prototype.", "Daily mini-game", data=_rlcs_daily_payload(ordinal, rng)),
        FlyerItem("jiporady", "Rocket League Jiporady", "Embedded Rocket League Jiporady board pulled into the Hub experience instead of sending people to a source repo.", "Party board", F9_JIPORADY_URL or None, data={"active_category": jiporady, "board": JIPORADY_BOARD}),
        FlyerItem("kickoff_call", "Kickoff Call", f"Tonight's callout is {kickoff_call}. Make the first word useful before the countdown hits one.", "Daily callout", data={"chips": ["daily", "comms"]}),
        FlyerItem("queue_focus", "Queue Focus", f"Playlist focus: {playlist}. Track one repeat mistake across three games and bring it back to Discord.", "Session card", data={"chips": ["daily", "focus"]}),
    ]

    lanes = [
        {"label": "Command", "value": str(command["mode"]).title()},
        {"label": "Featured", "value": "Cards"},
        {"label": "Games", "value": "RLCS + Jiporady"},
        {"label": "Discord", "value": "Join request" if F9_DISCORD_URL else "Set invite"},
    ]
    if F9_SIGNUP_ENABLED and _tournament_url():
        lanes.insert(0, {"label": "Queue", "value": "Signup hub"})

    return FlyerExperience(
        product="f9_hub",
        layout="f9_arena",
        title="F9 Hub",
        subtitle="Rocket League community control center for F9.",
        date_label=selected.strftime("%A • %B %d, %Y"),
        lead=lead,
        sections=sections,
        actions=actions,
        footer="HT 2026",
        data={
            "logo_url": F9_LOGO_URL,
            "stadium_url": F9_STADIUM_URL,
            "signup_enabled": F9_SIGNUP_ENABLED and bool(_tournament_url()),
            "tournament_url": _tournament_url(),
            "jiporady_url": F9_JIPORADY_URL,
            "discord_url": F9_DISCORD_URL,
            "rl_esports_news_url": RL_ESPORTS_NEWS_URL,
            "lanes": lanes,
            "content_card_count": 8,
            "legal_note": F9_LEGAL_NOTE,
        },
    )
