#!/usr/bin/env python3
"""Build the versioned question bank from a pinned OpenTDB export and reviewed additions.

No model or network call is made during generation. Rarity is never randomized.
Run from any directory: python games/ball-knowledge/scripts/build_question_bank.py
"""
from __future__ import annotations

import collections
import hashlib
import html
import json
from pathlib import Path
import re
import unicodedata
import urllib.parse

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
VERSION = "2026-11-25.v1"
LICENSE_URL = "https://creativecommons.org/licenses/by-sa/4.0/"
RARITIES = ("common", "uncommon", "obscure", "epic", "legendary", "one-of-one")
WORDING_REWRITES = {
    "In relation to the British Occupation in Ireland, what does the IRA stand for.":
        "In Irish history, what does the acronym IRA stand for?",
}
CATEGORIES = {
    "General Knowledge": ("general", "General knowledge"),
    "Entertainment: Books": ("books", "Books & literature"),
    "Entertainment: Film": ("film", "Film"),
    "Entertainment: Music": ("music", "Music"),
    "Entertainment: Musicals & Theatres": ("theatre", "Theatre"),
    "Entertainment: Television": ("television", "Television"),
    "Entertainment: Video Games": ("video-games", "Video games"),
    "Entertainment: Board Games": ("board-games", "Board games"),
    "Science & Nature": ("science", "Science & nature"),
    "Science: Computers": ("technology", "Computers & technology"),
    "Science: Mathematics": ("mathematics", "Mathematics"),
    "Mythology": ("mythology", "Mythology"),
    "Sports": ("sports", "Sports"),
    "Geography": ("geography", "Geography"),
    "History": ("history", "History"),
    "Politics": ("politics", "Politics & society"),
    "Art": ("art", "Art"),
    "Celebrities": ("people", "Famous people"),
    "Animals": ("animals", "Animals"),
    "Vehicles": ("vehicles", "Vehicles"),
    "Entertainment: Comics": ("comics", "Comics"),
    "Science: Gadgets": ("gadgets", "Gadgets & inventions"),
    "Entertainment: Japanese Anime & Manga": ("anime", "Anime & manga"),
    "Entertainment: Cartoon & Animations": ("animation", "Animation"),
}

# These are editorial exclusions, not assertions that every matching question is wrong.
# Losing a usable question is preferable to including a stale or subjective answer.
REVIEW_RULES = [
    ("time-sensitive wording", r"\b(current(?:ly)?|today|latest|most recent|to date|so far|yet to be)\b"),
    ("subjective ranking", r"\b(critically regarded|widely considered|greatest of all time|most difficult|best film|best movie|most famous|most popular|most successful)\b"),
    ("unbounded popularity or price record", r"\b(most[- ](?:subscribed|followed|viewed|downloaded)|highest[- ]grossing|most expensive|best[- ]selling|world record|all[- ]time)\b"),
    ("ambiguous broad historical start", r"when did the french revolution begin"),
    ("religious answer options overlap", r"big bang theory.*religious ideology"),
    ("imprecise vitamin answer", r"folic acid is the synthetic form"),
    ("incorrect character hair colour", r"real hair colo(?:u)?r.*daredevil"),
    ("misleading Canadian confederation premise", r"canada leave the confederation"),
    ("unreliable painting completion date", r"what year was the mona lisa finished"),
    ("superseded US presidential exclusivity", r"only.*president.*non.consecutive"),
    ("unqualified historical capital claim", r"last colony.*end of the british empire"),
    ("incorrect rebellion date", r"eureka rebellion.*1856"),
    ("incorrect geographical coordinate", r"cities has a 4.*east longitude"),
    ("unqualified Greek mythology uniqueness", r"who was the daughter of king minos"),
    ("incorrect globe organism or anatomy simplification", r"pantheon in rome was used to worship"),
    ("unqualified network topology", r"physical typologies.*ethernet"),
    ("multiple-founder ambiguity", r"who is the founder of palantir"),
    ("imprecise number-position question", r"what is the fourth digit of"),
    ("species-specific taste ambiguity", r"rarest form of colo(?:u)?r blindness"),
    ("incorrect tail/coma equivalence", r"gaseous envelope.*creates the tail"),
    ("unqualified claim about first repeated spaceflight", r"first man to travel into outer space twice"),
    ("incorrect chromosome count", r"how many chromosomes are in your body cells"),
    ("incorrect UN membership count", r"how many sovereign states are members of the united nations"),
    ("outdated unbounded city ranking", r"largest city in the us state tennessee"),
    ("unqualified freshwater lake measurement", r"which is the largest freshwater lake in the world"),
    ("unqualified cloning first", r"when was the first mammal successfully cloned"),
    ("ambiguous baseball foul rule", r"in baseball, how many fouls are an out"),
    ("imprecise called-ball rule", r"pitched outside of the strike zone before the batter is walked"),
    ("unbounded sport record", r"most (?:games played|stanley cups|nba grand finals)"),
    ("unbounded commercial count", r"most (?:locations globally|trappist breweries)"),
    ("incorrect mobile OS market claim", r"mobile os held the largest market share in 2012"),
    ("ambiguous stored-versus-effective significand", r"bits make up the significand portion"),
    ("unqualified universal programming claim", r"in any programming language.*most common way"),
    ("unsupported superlative usage claim", r"most (?:commonly used noun|preferred image format)"),
    ("unbounded mortality estimate", r"(?:dictator|conflict) killed the most people"),
    ("missing sport from question", r"^when was the first official international game played"),
    ("unqualified cloned-system hardware capability", r"computer components can be built using only nand gates"),
    ("incorrect population risk phrasing", r"one in how many americans die annually due to smoking"),
    ("possible alternative nickname among options", r"security vulnerability found in bash in 2014"),
    ("unqualified measure of national size", r"largest muslim country in the world"),
    ("unqualified body anatomy count", r"^how many bones are in the human body"),
    ("imprecise poetic-language unit", r"how many syllables make up a haiku"),
    ("unqualified river permanence", r"how many rivers are in saudi arabia"),
    ("unqualified exploration first", r"first explorer to sail to north america"),
    ("unqualified musical work subtype", r"how many sonatas did ludwig van beethoven write"),
    ("incorrect DNA synthesis organelle", r"organelle aids in synthesis of dna"),
    ("incorrect area-versus-volume formula", r"equation for the area of a sphere"),
    ("incorrect ions-versus-iron answer", r"deionized water is water with"),
    ("incorrect Maslow hierarchy answer", r"which need appears highest.*maslow"),
    ("unsupported preventive-medicine assertion", r"axiom of preventive medicine"),
    ("atomic mass and isotope ambiguity", r"(?:standard atomic weight of a plutonium|atomic mass of carbon)"),
    ("incorrect radiation quantity", r"how much radiation does a banana emit"),
    ("ambiguous radiation unit", r"^what is radiation measured in"),
    ("incorrect chemical formula glyph", r"^what is the chemical makeup of water"),
    ("pressure-dependent melting claim", r"which element has the highest melting point"),
    ("absolute genetic engineering claim", r"cannot be produced in roses"),
    ("incorrect abyssopelagic definition", r"where does an abyssopelagic animal live"),
    ("ambiguous operation precedence", r"correct order of operations for solving equations"),
    ("missing upper bound for angle", r"what type of angle is greater than 90"),
    ("ambiguous Pascal row convention", r"numbers are in the 5th row of pascal"),
    ("area measurement has linear units", r"area of a circle with a diameter of 20 inches"),
    ("unsupported mechanism in Mendel premise", r"mendel use to test genetic crossovers"),
    ("unanchored total of crewed lunar landings", r"how many manned moon landings have there been"),
    ("multiple antagonists across a franchise", r"main antagonist in the portal franchise"),
    ("ambiguous Soviet party succession title", r"succeeded joseph stalin as general secretary"),
]

def clean(value: str) -> str:
    value = unicodedata.normalize("NFKC", html.unescape(html.unescape(value)))
    value = value.replace("\u00ad", "").replace("\u200b", "")
    return re.sub(r"\s+", " ", value).strip()

def canonical(value: str) -> str:
    return re.sub(r"[^\w]+", " ", clean(value).casefold()).strip()

def identifier(prompt: str, prefix: str = "otdb") -> str:
    return prefix + "_" + hashlib.sha256(canonical(prompt).encode()).hexdigest()[:16]

def load(name: str, fallback):
    path = DATA / name
    return json.loads(path.read_text()) if path.exists() else fallback

def build():
    source = load("source-opentdb.json", [])
    source_meta = load("source-opentdb.meta.json", {})
    overrides = {canonical(x["prompt"]): x for x in load("editorial-overrides.json", [])}
    excluded, questions, seen, used_overrides = [], [], set(), set()
    patterns = [(reason, re.compile(pattern, re.I)) for reason, pattern in REVIEW_RULES]
    for raw in source:
        source_prompt = clean(raw.get("question", ""))
        prompt = WORDING_REWRITES.get(source_prompt, source_prompt)
        reason = None
        options = [clean(raw.get("correct_answer", ""))] + [clean(x) for x in raw.get("incorrect_answers", [])]
        key = canonical(prompt)
        if raw.get("type") != "multiple":
            reason = "not four-choice multiple choice"
        elif len(options) != 4 or any(not x for x in options):
            reason = "invalid four-choice structure"
        elif len({canonical(x) for x in options}) != 4:
            reason = "duplicate or equivalent answer text"
        elif not prompt or len(prompt) > 340 or max(map(len, options)) > 150:
            reason = "too long for a timed mobile question"
        elif key in seen:
            reason = "duplicate canonical prompt"
        elif raw.get("difficulty") not in ("easy", "medium", "hard"):
            reason = "unknown provider difficulty"
        else:
            for label, pattern in patterns:
                if pattern.search(prompt):
                    reason = label
                    break
        if reason:
            excluded.append({"id": identifier(prompt), "prompt": prompt, "reason": reason})
            continue
        seen.add(key)
        original_category = clean(raw["category"])
        slug, label = CATEGORIES.get(original_category, ("general", "General knowledge"))
        row = {
            "id": identifier(prompt), "prompt": prompt, "options": options,
            "answerIndex": 0, "category": slug, "categoryLabel": label,
            "rarity": {"easy": "common", "medium": "uncommon", "hard": "obscure"}[raw["difficulty"]],
            "source": {"name": "Open Trivia DB", "url": "https://opentdb.com/browse.php?" + urllib.parse.urlencode({"query": source_prompt, "type": "Question"}), "license": "CC BY-SA 4.0"},
            "sourceReview": "provider-reviewed", "providerDifficulty": raw["difficulty"],
            "factGroup": identifier(prompt),
        }
        if source_prompt != prompt:
            row["editorialNote"] = "Wording clarified; source answer and alternatives retained."
        if key in overrides:
            edit = overrides[key]
            for field in ("rarity", "factGroup", "editorialRationale", "explanation"):
                if field in edit: row[field] = edit[field]
            row["sourceReview"] = "provider-reviewed; editorial rarity reviewed"
            used_overrides.add(key)
        questions.append(row)
    for raw in load("reviewed-questions.json", []):
        row = dict(raw)
        row["prompt"] = clean(row["prompt"])
        row["options"] = [clean(x) for x in row["options"]]
        key = canonical(row["prompt"])
        if key in seen:
            raise ValueError(f"Reviewed question duplicates a provider prompt: {row['prompt']}")
        seen.add(key)
        row.setdefault("id", identifier(row["prompt"], "dfe"))
        row.setdefault("factGroup", row["id"])
        row.setdefault("sourceReview", "checked against linked reference")
        row.setdefault("reviewedOn", "2026-11-25")
        questions.append(row)
    for row in questions:
        assert row["rarity"] in RARITIES, row
        assert len(row["options"]) == 4 and len({canonical(x) for x in row["options"]}) == 4, row
        assert 0 <= row["answerIndex"] < 4, row
        assert row["source"]["url"].startswith("https://"), row
        assert row["prompt"] and all(row["options"]), row
    assert len({x["id"] for x in questions}) == len(questions)
    questions.sort(key=lambda x: x["id"])
    content = json.dumps(questions, ensure_ascii=False, separators=(",", ":")) + "\n"
    (DATA / "questions.json").write_text(content)
    counts = collections.Counter(q["rarity"] for q in questions)
    categories = collections.Counter(q["category"] for q in questions)
    names = {q["category"]: q["categoryLabel"] for q in questions}
    manifest = {
        "bankVersion": VERSION, "version": VERSION, "questionCount": len(questions),
        "total": len(questions), "categoryCount": len(categories),
        "rarityCounts": {r: counts[r] for r in RARITIES},
        "categories": [{"id": c, "slug": c, "label": names[c], "count": categories[c]} for c in sorted(categories)],
        "license": "CC BY-SA 4.0", "licenseUrl": LICENSE_URL,
        "attribution": "Includes adapted questions from Open Trivia DB (https://opentdb.com/), CC BY-SA 4.0. Additional DFE question wording is shared under CC BY-SA 4.0; linked factual references retain their own terms.",
        "sourceExport": source_meta,
        "sha256": hashlib.sha256(content.encode()).hexdigest(),
        "methodology": {
            "baseRarity": {"easy": "common", "medium": "uncommon", "hard": "obscure"},
            "upperRarities": "Explicit reviewed-question records and editorial overrides only; no hash, RNG, or automatic length-based promotion.",
            "calibration": "Launch tiers are editorial estimates for a broad general audience, not measured population difficulty. One-of-one is the top rarity label, not a claim that only one person knows the answer.",
            "cleanup": "HTML/entity and Unicode normalization; exactly four distinct answer texts; canonical prompt deduplication; conservative temporal, subjective, ambiguity, known-error, and mobile-length exclusions.",
            "accuracy": "Imported questions were approved by the source community, not individually fact-checked by DFE. The reviewed additions were checked against their linked references. Errors may remain; question reporting and review are supported.",
            "changes": "Original question text normalized, one IRA acronym question neutrally reworded, category names mapped, three source difficulties mapped to the first three rarity tiers, reviewed exceptions and new original questions added. See editorial overrides and exclusion log.",
        },
        "editorialStatus": {
            "providerQuestions": len(questions) - len(load("reviewed-questions.json", [])),
            "linkedReferenceQuestions": len(load("reviewed-questions.json", [])),
            "rarityOverridesApplied": len(used_overrides),
            "rarityOverridesNotInExport": [overrides[k]["prompt"] for k in sorted(set(overrides) - used_overrides)],
        },
        "exclusions": {"count": len(excluded), "byReason": dict(collections.Counter(e["reason"] for e in excluded)), "log": "exclusions.json"},
    }
    (DATA / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    (DATA / "exclusions.json").write_text(json.dumps(excluded, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"bankVersion": VERSION, "count": len(questions), "rarities": counts, "categories": len(categories), "excluded": len(excluded), "unappliedOverrides": len(set(overrides) - used_overrides)}, indent=2))

if __name__ == "__main__":
    build()
