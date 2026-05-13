from __future__ import annotations

"""
Topic Signal Daily theme.

A Daily Flyer research-brief theme for lightweight topic coverage mapping.
The entries are editorial seed briefs, not live search or YouTube measurements.
"""

from daily_flyer.models import CardItem, PageContext
from daily_flyer.utils import resolve_date


THEME_CONFIG = {
    "page_title": "Topic Signal Daily — Young Professional Development",
    "header_title": "Topic Signal Daily",
    "header_subtitle": (
        "A lightweight market-signal flyer for youth transition, early career readiness, "
        "and practical next-step guidance."
    ),
    "footer_text": (
        "Built on Daily Flyer. Signals are editorial seed briefs until live search, YouTube, "
        "or platform data providers are connected."
    ),
    "hero_kicker": "Daily Flyer • Topic Coverage Mapper",
    "hero_summary_pill": "Research brief • gaps • positioning • next action",
    "extra_css": """
    :root {
        --signal-bg: #07111f;
        --signal-card: rgba(13, 24, 39, 0.84);
        --signal-ink: #f7f5ef;
        --signal-muted: #b8c4d4;
        --signal-blue: #7cb7ff;
        --signal-green: #83d6a3;
        --signal-amber: #f1bd73;
        --signal-coral: #ff9678;
    }

    header.hero {
        background:
            radial-gradient(circle at 12% 20%, rgba(124,183,255,0.18), transparent 26%),
            radial-gradient(circle at 84% 18%, rgba(131,214,163,0.16), transparent 28%),
            linear-gradient(135deg, rgba(255,255,255,0.065), rgba(255,255,255,0.02)),
            linear-gradient(160deg, rgba(9,24,44,0.95), rgba(4,13,25,0.92));
    }

    .card--topic_signal_topic,
    .card--topic_signal_snapshot,
    .card--topic_signal_angle,
    .card--topic_signal_action {
        grid-column: span 6;
    }

    .card--topic_signal_topic {
        background:
            linear-gradient(180deg, rgba(124,183,255,0.16), rgba(255,255,255,0.025)),
            var(--card-strong);
    }

    .card--topic_signal_snapshot {
        background:
            linear-gradient(180deg, rgba(131,214,163,0.14), rgba(255,255,255,0.025)),
            var(--card-strong);
    }

    .card--topic_signal_search {
        background:
            linear-gradient(180deg, rgba(124,183,255,0.10), rgba(255,255,255,0.02)),
            var(--card);
    }

    .card--topic_signal_crowded {
        background:
            linear-gradient(180deg, rgba(241,189,115,0.13), rgba(255,255,255,0.02)),
            var(--card);
    }

    .card--topic_signal_gap {
        background:
            linear-gradient(180deg, rgba(131,214,163,0.13), rgba(255,255,255,0.02)),
            var(--card);
    }

    .card--topic_signal_angle {
        background:
            linear-gradient(180deg, rgba(255,150,120,0.12), rgba(255,255,255,0.02)),
            var(--card-strong);
    }

    .card--topic_signal_action {
        background:
            linear-gradient(180deg, rgba(124,183,255,0.13), rgba(255,255,255,0.025)),
            var(--card-strong);
    }

    .card--topic_signal_starter {
        background:
            linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02)),
            var(--card);
    }

    .signal-chips,
    .signal-stack {
        display: flex;
        flex-wrap: wrap;
        gap: 0.55rem;
        margin-top: 0.85rem;
    }

    .signal-chip {
        display: inline-flex;
        align-items: center;
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 999px;
        padding: 0.38rem 0.62rem;
        background: rgba(255,255,255,0.055);
        color: var(--signal-ink);
        font-size: 0.82rem;
        line-height: 1.2;
    }

    .signal-chip--green { border-color: rgba(131,214,163,0.32); color: #c9f7d9; }
    .signal-chip--amber { border-color: rgba(241,189,115,0.35); color: #ffe0ad; }
    .signal-chip--blue { border-color: rgba(124,183,255,0.34); color: #cfe6ff; }
    .signal-chip--coral { border-color: rgba(255,150,120,0.34); color: #ffd0c4; }

    .signal-list {
        margin: 0.65rem 0 0;
        padding-left: 1.08rem;
    }

    .signal-list li {
        margin: 0.34rem 0;
    }

    .signal-mini-label {
        display: block;
        margin-top: 0.95rem;
        color: var(--signal-muted);
        font-size: 0.76rem;
        font-weight: 800;
        letter-spacing: 0.11em;
        text-transform: uppercase;
    }

    .signal-quote {
        margin-top: 0.75rem;
        padding: 0.82rem 0.95rem;
        border-left: 4px solid rgba(124,183,255,0.75);
        border-radius: 12px;
        background: rgba(255,255,255,0.055);
        color: var(--signal-ink);
    }

    .signal-note {
        margin-top: 0.9rem;
        color: var(--signal-muted);
        font-size: 0.9rem;
    }

    @media (max-width: 980px) {
        .card--topic_signal_topic,
        .card--topic_signal_snapshot,
        .card--topic_signal_angle,
        .card--topic_signal_action {
            grid-column: span 6;
        }
    }

    @media (max-width: 720px) {
        .card--topic_signal_topic,
        .card--topic_signal_snapshot,
        .card--topic_signal_angle,
        .card--topic_signal_action {
            grid-column: auto;
        }
    }
    """,
}


DAILY_BRIEFS = [
    {
        "topic": "Young Adult Career Coaching / Mentoring",
        "audience": "High school seniors, recent graduates, trade students, parents, and early-career young adults.",
        "snapshot": (
            "This is a useful but crowded lane. A lot of existing content talks about resumes, "
            "interviews, networking, and finding your passion. The opening is to get more specific "
            "about transition anxiety, uncertainty, first steps, and practical mentoring."
        ),
        "need": "Help me choose a direction without feeling behind or judged.",
        "content_climate": "Crowded at the generic level; more open at the transition-support level.",
        "search_intents": [
            "How do I choose a career?",
            "Career advice for young adults",
            "What if I do not know what job I want?",
            "How to find a mentor",
            "How to get a job with no experience",
        ],
        "crowded_lanes": [
            "Resume tips and templates",
            "Generic interview advice",
            "Motivational career content",
            "Follow-your-passion messaging",
        ],
        "gaps": [
            "Guidance for undecided or anxious young adults",
            "Mentoring language for non-college and trade-school paths",
            "Parent-friendly support that does not become pressure",
            "Local examples from real professionals and employers",
        ],
        "angle": (
            "Own the idea of guided transition support: helping young people understand their options, "
            "build confidence, and take one responsible next step."
        ),
        "action": "Create a short article or video called “What to Do If You Do Not Know What Career You Want Yet.”",
        "starter": (
            "Not knowing your career path does not mean you are behind. It usually means you need better "
            "questions, better examples, and a low-pressure way to explore what fits."
        ),
        "chips": ["Career Launch", "Mentoring", "Transition Anxiety", "Parent-Friendly"],
    },
    {
        "topic": "First Job Readiness",
        "audience": "Teens, first-time workers, recent graduates, local employers, schools, and parents.",
        "snapshot": (
            "The most valuable content here may not be about getting hired. It may be about what happens "
            "after day one: showing up, asking questions, taking feedback, handling mistakes, and learning "
            "how workplace communication actually works."
        ),
        "need": "Tell me what the workplace expects before I learn everything the hard way.",
        "content_climate": "Moderately crowded, but often too broad or too listicle-driven.",
        "search_intents": [
            "How to act at your first job",
            "First job tips",
            "What do employers expect from young workers?",
            "How to be professional at work",
            "How to ask questions at work",
        ],
        "crowded_lanes": [
            "Basic first-job tip lists",
            "Interview prep",
            "Resume-first career content",
            "Generic professionalism advice",
        ],
        "gaps": [
            "Scripts for uncomfortable workplace moments",
            "What to do when you make a mistake",
            "How to communicate confusion without shutting down",
            "First-week expectations explained plainly",
        ],
        "angle": (
            "Position this as workplace confidence for first-time workers. That phrase is practical, "
            "emotionally aware, and easy for parents, schools, and employers to understand."
        ),
        "action": "Build a one-page checklist called “First Week at Work: 10 Things No One Explains Clearly Enough.”",
        "starter": (
            "Your first job is not just a test of what you already know. It is a place to learn how to ask, "
            "listen, adjust, and become easier to trust."
        ),
        "chips": ["First Job", "Soft Skills", "Workplace Confidence", "Employer Friendly"],
    },
    {
        "topic": "Career Paths Without a Four-Year Degree",
        "audience": "Students weighing college alternatives, trade students, parents, guidance counselors, and local workforce partners.",
        "snapshot": (
            "This topic has strong opportunity because much of the visible content is either salary-ranking "
            "content, college-versus-trades debate content, or influencer-style hot takes. A calmer, practical "
            "comparison guide would stand out."
        ),
        "need": "Help me compare real options without turning it into a college-versus-everything argument.",
        "content_climate": "Crowded in rankings and debates; less crowded in calm decision support.",
        "search_intents": [
            "Best careers without college",
            "Trade school jobs",
            "Alternatives to college",
            "High paying jobs without a degree",
            "Apprenticeships near me",
        ],
        "crowded_lanes": [
            "Salary ranking posts",
            "College is/is not worth it debates",
            "No-degree job lists",
            "Broad trade-school explainers",
        ],
        "gaps": [
            "Local pathway comparisons",
            "Decision guides for families",
            "Long-term growth after trade school",
            "Side-by-side next-step maps for college, work, military, certificates, and apprenticeships",
        ],
        "angle": (
            "Avoid framing this as college versus no college. Frame it as choosing the right next step "
            "after high school."
        ),
        "action": "Create a guide called “College, Trade School, Work, or Apprenticeship: How to Compare Your Next Step.”",
        "starter": (
            "The question is not whether one path is universally better. The question is which next step gives "
            "this young person structure, momentum, and a realistic way to grow."
        ),
        "chips": ["Trade School", "Alternatives to College", "Decision Support", "Local Pathways"],
    },
    {
        "topic": "LinkedIn for Students and Early-Career Young Adults",
        "audience": "Students, recent graduates, trade students, interns, mentors, and career coaches.",
        "snapshot": (
            "LinkedIn advice is everywhere, but a lot of it assumes the person already has experience, "
            "confidence, and a clear professional identity. The gap is simple, honest profile-building for "
            "people who are still figuring things out."
        ),
        "need": "Help me look credible without pretending to be more experienced than I am.",
        "content_climate": "Crowded in optimization tips; less crowded in honest beginner templates.",
        "search_intents": [
            "LinkedIn profile for students",
            "LinkedIn with no experience",
            "What should a student put on LinkedIn?",
            "LinkedIn headline examples",
            "How to network on LinkedIn",
        ],
        "crowded_lanes": [
            "Profile optimization hacks",
            "Headline examples",
            "Personal branding advice",
            "Recruiter-focused LinkedIn tactics",
        ],
        "gaps": [
            "LinkedIn for high school students",
            "LinkedIn for trade students",
            "Low-pressure networking scripts",
            "Profiles for undecided young adults with limited work history",
        ],
        "angle": (
            "Treat LinkedIn as a confidence-building tool, not a personal branding performance. The promise is "
            "to make it easier for helpful adults to understand where the young person is headed."
        ),
        "action": "Create a template called “A Simple LinkedIn Profile for Students Without Much Experience Yet.”",
        "starter": (
            "You do not need to sound like a polished executive. You need to be clear, honest, and easy to help."
        ),
        "chips": ["LinkedIn", "Student Profile", "Networking", "Beginner Friendly"],
    },
    {
        "topic": "Parents Helping Young Adults Transition",
        "audience": "Parents, guardians, family members, coaches, schools, and community programs.",
        "snapshot": (
            "Parents are often a major influence in career transition, but most content speaks directly to the "
            "young adult. There is a valuable lane for parent-facing guidance that helps families support progress "
            "without turning every conversation into pressure."
        ),
        "need": "Help me support my young adult without taking over or making them shut down.",
        "content_climate": "Moderately crowded in parenting advice; open in specific career-transition scripts.",
        "search_intents": [
            "How to help my child choose a career",
            "My college graduate cannot find a job",
            "How to motivate young adults",
            "How to help teenager plan future",
            "Career coaching for my son or daughter",
        ],
        "crowded_lanes": [
            "General parenting advice",
            "College admissions content",
            "Motivational content",
            "Failure-to-launch articles",
        ],
        "gaps": [
            "Parent scripts for career conversations",
            "How to help without micromanaging",
            "When to suggest coaching or mentoring",
            "Respectful conversations about college, work, trade school, and uncertainty",
        ],
        "angle": (
            "Own the parent-facing promise: helping your young adult take the next step without turning every "
            "conversation into pressure."
        ),
        "action": "Create a parent guide called “5 Better Questions to Ask a Young Adult Who Feels Stuck.”",
        "starter": (
            "The goal is not to force a perfect plan. The goal is to create one honest conversation that makes "
            "the next step feel possible."
        ),
        "chips": ["Parent Support", "Career Conversations", "Low Pressure", "Family-Friendly"],
    },
]


def _brief_for_date(date_str: str | None, seed: int | None) -> tuple[object, dict]:
    today = resolve_date(date_str)
    selector = seed if seed is not None else today.toordinal()
    brief = DAILY_BRIEFS[selector % len(DAILY_BRIEFS)]
    return today, brief


def _chip_html(labels: list[str], tone: str = "blue") -> str:
    return '<div class="signal-chips">' + "".join(
        f'<span class="signal-chip signal-chip--{tone}">{label}</span>' for label in labels
    ) + "</div>"


def _list_html(items: list[str]) -> str:
    return '<ul class="signal-list">' + "".join(f"<li>{item}</li>" for item in items) + "</ul>"


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    today, brief = _brief_for_date(date_str, seed)

    cards = [
        CardItem(
            card_type="topic_signal_topic",
            eyebrow="Today’s Topic",
            title=brief["topic"],
            body=(
                f"<strong>Audience:</strong> {brief['audience']}"
                + _chip_html(brief["chips"], "blue")
                + '<p class="signal-note">Format: daily research briefing, not a full dashboard.</p>'
            ),
        ),
        CardItem(
            card_type="topic_signal_snapshot",
            eyebrow="Signal Snapshot",
            title="What the market seems to be asking for",
            body=(
                f"{brief['snapshot']}"
                '<span class="signal-mini-label">Audience need</span>'
                f'<div class="signal-quote">{brief["need"]}</div>'
                '<span class="signal-mini-label">Content climate</span>'
                f'<div class="signal-chips"><span class="signal-chip signal-chip--green">{brief["content_climate"]}</span></div>'
            ),
        ),
        CardItem(
            card_type="topic_signal_search",
            eyebrow="Search Intent Clues",
            title="Likely questions behind the topic",
            body=(
                "Use these as plain-language clues for posts, workshop titles, service pages, and discovery calls."
                + _list_html(brief["search_intents"])
            ),
        ),
        CardItem(
            card_type="topic_signal_crowded",
            eyebrow="Crowded Lanes",
            title="What everyone may already be saying",
            body=(
                "These topics are still useful, but they are less distinctive unless paired with a sharper audience or situation."
                + _list_html(brief["crowded_lanes"])
                + _chip_html(["High competition", "Generic advice risk", "Still usable"], "amber")
            ),
        ),
        CardItem(
            card_type="topic_signal_gap",
            eyebrow="Opportunity Gaps",
            title="Where a client could be more useful",
            body=(
                "The strongest gaps are practical, specific, and emotionally aware."
                + _list_html(brief["gaps"])
            ),
        ),
        CardItem(
            card_type="topic_signal_angle",
            eyebrow="Distinctive Angle",
            title="Positioning to test",
            body=(
                f'<div class="signal-quote">{brief["angle"]}</div>'
                + _chip_html(["Specific audience", "Practical promise", "Client-friendly"], "coral")
            ),
        ),
        CardItem(
            card_type="topic_signal_action",
            eyebrow="Recommended Action",
            title="One useful thing to make next",
            body=(
                f"{brief['action']}"
                '<span class="signal-mini-label">Best format</span>'
                + _chip_html(["Short video", "One-page guide", "Workshop seed", "Social post"], "green")
            ),
        ),
        CardItem(
            card_type="topic_signal_starter",
            eyebrow="Content Starter",
            title="Draftable opening line",
            body=f'<div class="signal-quote">{brief["starter"]}</div>',
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
