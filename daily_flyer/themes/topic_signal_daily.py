from __future__ import annotations

"""
Passages Daily theme.

A Daily Flyer companion theme for My Passages-style content: warm, practical,
transition-focused daily guidance for young people, parents, mentors, coaches,
and community partners.

This intentionally de-emphasizes market research/dashboard language. The page
should feel like a daily next-step guide that can sit beside mypassages.net.
"""

from daily_flyer.models import CardItem, PageContext
from daily_flyer.utils import resolve_date


THEME_CONFIG = {
    "page_title": "Passages Daily — Next-Step Guidance",
    "header_title": "Passages Daily",
    "header_subtitle": (
        "A daily companion for young people moving through school, work, training, "
        "early adulthood, and the in-between moments that shape what comes next."
    ),
    "footer_text": (
        "Built on Daily Flyer as a companion-style theme for My Passages. "
        "Each daily entry offers one topic, one practical step, and one conversation starter."
    ),
    "hero_kicker": "Daily Flyer • My Passages Companion",
    "hero_summary_pill": "One passage • one next step • one useful conversation",
    "extra_css": """
    :root {
        --passages-navy: #12233a;
        --passages-blue: #3e6f95;
        --passages-sky: #9fc7df;
        --passages-sage: #9bbf9f;
        --passages-cream: #f4ead8;
        --passages-clay: #c68162;
        --passages-gold: #dfbd74;
        --passages-ink: #fbf7ef;
        --passages-muted: #c9d4dc;
    }

    body {
        background:
            radial-gradient(circle at top left, rgba(159,199,223,0.16), transparent 32%),
            radial-gradient(circle at top right, rgba(155,191,159,0.13), transparent 30%),
            radial-gradient(circle at bottom center, rgba(223,189,116,0.10), transparent 32%),
            linear-gradient(180deg, #142740 0%, #0e1d31 48%, #081421 100%);
    }

    header.hero {
        background:
            radial-gradient(circle at 15% 20%, rgba(159,199,223,0.18), transparent 28%),
            radial-gradient(circle at 84% 18%, rgba(223,189,116,0.14), transparent 28%),
            linear-gradient(135deg, rgba(244,234,216,0.08), rgba(255,255,255,0.02)),
            linear-gradient(160deg, rgba(28,55,86,0.96), rgba(14,29,49,0.94));
    }

    .hero h1 {
        max-width: 12ch;
    }

    .card--passage_topic,
    .card--passage_why,
    .card--passage_step,
    .card--passage_prompt {
        grid-column: span 6;
    }

    .card--passage_topic {
        background:
            linear-gradient(180deg, rgba(159,199,223,0.16), rgba(255,255,255,0.025)),
            var(--card-strong);
    }

    .card--passage_why {
        background:
            linear-gradient(180deg, rgba(155,191,159,0.15), rgba(255,255,255,0.025)),
            var(--card-strong);
    }

    .card--passage_feeling {
        background:
            linear-gradient(180deg, rgba(198,129,98,0.12), rgba(255,255,255,0.02)),
            var(--card);
    }

    .card--passage_skill {
        background:
            linear-gradient(180deg, rgba(159,199,223,0.11), rgba(255,255,255,0.02)),
            var(--card);
    }

    .card--passage_step {
        background:
            linear-gradient(180deg, rgba(223,189,116,0.15), rgba(255,255,255,0.025)),
            var(--card-strong);
    }

    .card--passage_prompt {
        background:
            linear-gradient(180deg, rgba(155,191,159,0.13), rgba(255,255,255,0.02)),
            var(--card-strong);
    }

    .card--passage_connection {
        background:
            linear-gradient(180deg, rgba(244,234,216,0.10), rgba(255,255,255,0.02)),
            var(--card);
    }

    .card--passage_reflection {
        background:
            linear-gradient(180deg, rgba(159,199,223,0.09), rgba(255,255,255,0.02)),
            var(--card);
    }

    .passage-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 0.55rem;
        margin-top: 0.85rem;
    }

    .passage-chip {
        display: inline-flex;
        align-items: center;
        border: 1px solid rgba(244,234,216,0.16);
        border-radius: 999px;
        padding: 0.38rem 0.62rem;
        background: rgba(244,234,216,0.065);
        color: var(--passages-ink);
        font-size: 0.82rem;
        line-height: 1.2;
    }

    .passage-chip--sage { border-color: rgba(155,191,159,0.34); color: #d7f0d9; }
    .passage-chip--sky { border-color: rgba(159,199,223,0.36); color: #d6edf9; }
    .passage-chip--gold { border-color: rgba(223,189,116,0.38); color: #ffe5aa; }
    .passage-chip--clay { border-color: rgba(198,129,98,0.36); color: #ffd7c8; }

    .passage-list {
        margin: 0.65rem 0 0;
        padding-left: 1.08rem;
    }

    .passage-list li {
        margin: 0.34rem 0;
    }

    .passage-label {
        display: block;
        margin-top: 0.95rem;
        color: var(--passages-muted);
        font-size: 0.76rem;
        font-weight: 800;
        letter-spacing: 0.11em;
        text-transform: uppercase;
    }

    .passage-callout {
        margin-top: 0.75rem;
        padding: 0.86rem 0.98rem;
        border-left: 4px solid rgba(223,189,116,0.78);
        border-radius: 12px;
        background: rgba(244,234,216,0.065);
        color: var(--passages-ink);
    }

    .passage-note {
        margin-top: 0.9rem;
        color: var(--passages-muted);
        font-size: 0.92rem;
    }

    @media (max-width: 980px) {
        .card--passage_topic,
        .card--passage_why,
        .card--passage_step,
        .card--passage_prompt {
            grid-column: span 6;
        }
    }

    @media (max-width: 720px) {
        .card--passage_topic,
        .card--passage_why,
        .card--passage_step,
        .card--passage_prompt {
            grid-column: auto;
        }
    }
    """,
}


DAILY_PASSAGES = [
    {
        "passage": "Finding a First Direction",
        "audience": "Young people who feel pressure to choose a future before they have enough real-world information.",
        "why": (
            "A first direction does not have to be a forever decision. It can be a starting point: a way to learn, "
            "meet people, build confidence, and gather better information about what fits."
        ),
        "feeling": (
            "This stage can feel like everyone else has a plan. Many people only look certain from the outside. "
            "Uncertainty is not failure; it is often the beginning of honest exploration."
        ),
        "skill": "Decision-making without panic",
        "steps": [
            "Write down three work environments you might tolerate or enjoy: outdoors, office, hands-on, helping people, technical, creative, or fast-paced.",
            "Pick one person who has a job you vaguely understand and ask what a normal day actually looks like.",
            "Choose one small experiment for this week: a conversation, a video, a job shadow, a course page, or a local posting to read closely.",
        ],
        "prompt": "What kind of day would you rather have: busy and social, quiet and focused, physical and hands-on, or mixed?",
        "connection": (
            "This is the heart of a passages-style approach: helping a young person move from vague pressure to one "
            "clearer next step."
        ),
        "reflection": "What is one option you do not need to decide today, and what is one thing you can learn this week?",
        "chips": ["Career exploration", "Confidence", "Next step", "Low pressure"],
    },
    {
        "passage": "Getting Ready for a First Job",
        "audience": "Teens and young adults preparing for first jobs, internships, apprenticeships, or part-time work.",
        "why": (
            "First-job readiness is about more than getting hired. It is about learning how to show up, ask questions, "
            "receive feedback, recover from mistakes, and become someone others can trust."
        ),
        "feeling": (
            "A first job can feel intimidating because many expectations are invisible. Young workers may not know what "
            "counts as professional until someone explains it plainly."
        ),
        "skill": "Workplace confidence",
        "steps": [
            "Practice a simple check-in sentence: 'I want to make sure I am doing this the right way. Can you show me what good looks like?'",
            "Before the first shift or first week, write down three questions you are allowed to ask.",
            "At the end of the day, note one thing you learned and one thing to ask about next time.",
        ],
        "prompt": "When you are unsure at work, what would make it easier to ask for help?",
        "connection": (
            "A daily flyer beside My Passages can make the hidden curriculum of early work visible, friendly, and teachable."
        ),
        "reflection": "What is one workplace habit that would make someone easier to train?",
        "chips": ["First job", "Work habits", "Communication", "Trust"],
    },
    {
        "passage": "Considering College, Trade School, Work, or Apprenticeship",
        "audience": "Students and families comparing post-high-school options without wanting a one-size-fits-all answer.",
        "why": (
            "The real question is not whether one path is universally best. The better question is which path gives this "
            "person structure, momentum, support, and a realistic way to grow."
        ),
        "feeling": (
            "Families can feel pulled between cost, pride, fear, opportunity, and expectations. A calm comparison can turn "
            "a stressful debate into a practical planning conversation."
        ),
        "skill": "Comparing options fairly",
        "steps": [
            "List the next-step options without ranking them yet: college, community college, trade school, apprenticeship, work, military, certificate, or gap period with structure.",
            "For each option, write one cost, one benefit, one risk, and one person to talk to.",
            "Circle the option that would create the most useful momentum over the next six months.",
        ],
        "prompt": "Which path gives you the best chance to keep learning without feeling stuck or overwhelmed?",
        "connection": (
            "This topic belongs beside My Passages because it supports the transition itself, not just the final choice."
        ),
        "reflection": "What would make one option feel more real: a visit, a conversation, a budget, or a trial step?",
        "chips": ["After high school", "Trade school", "College alternatives", "Family decision"],
    },
    {
        "passage": "Building a Simple Professional Identity",
        "audience": "Students and early-career young adults who need to introduce themselves but do not yet feel established.",
        "why": (
            "A professional identity does not have to be polished or final. It can simply explain what someone is learning, "
            "what they are curious about, and what kind of opportunity they are open to."
        ),
        "feeling": (
            "Many young people worry they have nothing to say because they do not have much experience yet. But honesty, "
            "curiosity, reliability, and willingness to learn are all real signals."
        ),
        "skill": "Introducing yourself clearly",
        "steps": [
            "Write a two-sentence introduction: who you are, what you are exploring, and what kind of experience you hope to get.",
            "Add one example of responsibility: a job, sport, class project, family role, volunteer work, or personal project.",
            "Practice saying it out loud until it sounds natural instead of scripted.",
        ],
        "prompt": "What are you learning right now, and what kind of opportunity would help you learn more?",
        "connection": (
            "A passages-style resource can help young people talk about themselves without pretending to have everything figured out."
        ),
        "reflection": "What is one honest strength you can name without exaggerating?",
        "chips": ["LinkedIn", "Networking", "Self-introduction", "Confidence"],
    },
    {
        "passage": "Parents Supporting Without Taking Over",
        "audience": "Parents, guardians, mentors, and family members trying to help a young adult take the next step.",
        "why": (
            "Support works best when it lowers pressure and increases clarity. The goal is not to force a perfect plan; "
            "the goal is to help the young person stay engaged long enough to take a useful next step."
        ),
        "feeling": (
            "Parents may feel worried, impatient, or afraid time is being wasted. Young adults may feel judged, compared, "
            "or overwhelmed. Both sides often want progress but get stuck in the same conversation."
        ),
        "skill": "Better transition conversations",
        "steps": [
            "Replace 'What is your plan?' with 'What feels like the next thing you are willing to learn more about?'",
            "Ask before advising: 'Do you want ideas, help sorting options, or just someone to listen for a minute?'",
            "Agree on one small next step and one calm time to check back in.",
        ],
        "prompt": "What kind of help would feel useful right now instead of stressful?",
        "connection": (
            "This is an ideal companion lane for My Passages: helping families turn pressure into practical support."
        ),
        "reflection": "What question could open a better conversation this week?",
        "chips": ["Parents", "Mentors", "Family support", "Conversation"],
    },
]


def _passage_for_date(date_str: str | None, seed: int | None) -> tuple[object, dict]:
    today = resolve_date(date_str)
    selector = seed if seed is not None else today.toordinal()
    passage = DAILY_PASSAGES[selector % len(DAILY_PASSAGES)]
    return today, passage


def _chip_html(labels: list[str], tone: str = "sky") -> str:
    return '<div class="passage-chips">' + "".join(
        f'<span class="passage-chip passage-chip--{tone}">{label}</span>' for label in labels
    ) + "</div>"


def _list_html(items: list[str]) -> str:
    return '<ul class="passage-list">' + "".join(f"<li>{item}</li>" for item in items) + "</ul>"


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    today, passage = _passage_for_date(date_str, seed)

    cards = [
        CardItem(
            card_type="passage_topic",
            eyebrow="Today’s Passage",
            title=passage["passage"],
            body=(
                f"<strong>Who this is for:</strong> {passage['audience']}"
                + _chip_html(passage["chips"], "sky")
                + '<p class="passage-note">This is designed as a daily companion piece: useful, human, and easy to talk about.</p>'
            ),
        ),
        CardItem(
            card_type="passage_why",
            eyebrow="Why It Matters",
            title="The transition underneath the topic",
            body=(
                passage["why"]
                + '<span class="passage-label">Core skill</span>'
                + f'<div class="passage-chips"><span class="passage-chip passage-chip--sage">{passage["skill"]}</span></div>'
            ),
        ),
        CardItem(
            card_type="passage_feeling",
            eyebrow="What This Can Feel Like",
            title="Name the real-life tension",
            body=f'<div class="passage-callout">{passage["feeling"]}</div>',
        ),
        CardItem(
            card_type="passage_step",
            eyebrow="Practical Next Step",
            title="Try this before trying to solve everything",
            body=(
                "Small steps matter because they create motion without demanding a perfect life plan."
                + _list_html(passage["steps"])
            ),
        ),
        CardItem(
            card_type="passage_prompt",
            eyebrow="Conversation Prompt",
            title="A better question to ask today",
            body=(
                f'<div class="passage-callout">{passage["prompt"]}</div>'
                + _chip_html(["For young adults", "For parents", "For mentors"], "gold")
            ),
        ),
        CardItem(
            card_type="passage_connection",
            eyebrow="My Passages Connection",
            title="How this fits the larger mission",
            body=passage["connection"],
        ),
        CardItem(
            card_type="passage_skill",
            eyebrow="Skill to Practice",
            title=passage["skill"],
            body=(
                "Today’s skill is intentionally small enough to practice in real life. "
                "The goal is not instant transformation; the goal is one repeatable behavior that builds confidence."
                + _chip_html(["Practice", "Repeat", "Reflect"], "sage")
            ),
        ),
        CardItem(
            card_type="passage_reflection",
            eyebrow="Reflection",
            title="End with one honest answer",
            body=f'<div class="passage-callout">{passage["reflection"]}</div>',
        ),
    ]

    return PageContext(
        page_title=THEME_CONFIG["page_title"],
        header_title=THEME_CONFIG["header_title"],
        header_subtitle=THEME_CONFIG["header_subtitle"],
        today_str=today.strftime("%A, %B %d, %Y"),
        cards=cards,
        footer_text=THEME_CONFIG["footer_text"],
        metadata={
            "theme_name": "topic_signal_daily",
            "date_key": today.strftime("%m-%d"),
            "hero_kicker": THEME_CONFIG["hero_kicker"],
            "hero_summary_pill": THEME_CONFIG["hero_summary_pill"],
            "extra_css": THEME_CONFIG["extra_css"],
        },
    )
