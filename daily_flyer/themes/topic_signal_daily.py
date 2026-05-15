from __future__ import annotations

"""
Passages Daily theme.

A Daily Flyer companion theme for My Passages-style content: bright, practical,
student-facing, confidence-oriented, and lightly interactive.
"""

from daily_flyer.models import CardItem, PageContext
from daily_flyer.utils import resolve_date


THEME_CONFIG = {
    "page_title": "Passages Daily — Skills and Confidence",
    "header_title": "Step Into Today with Skills and Confidence",
    "header_subtitle": (
        '<div class="passages-hero-copy">'
        '<p>Passages Daily is a friendly one-page companion for students, families, mentors, and coaches. '
        'Each day gives you one focus, one real-world skill, one next step, and a couple of playful ways to practice.</p>'
        '<div class="passages-hero-actions">'
        '<span class="passages-cta">Let’s Do It!</span>'
        '<span class="passages-soft-pill">Confidence starts here</span>'
        '</div>'
        '</div>'
    ),
    "footer_text": (
        "Built on Daily Flyer as a Passages-style companion page: one focus, one skill, "
        "one next step, and one better conversation."
    ),
    "hero_kicker": "Passages Daily • Daily Flyer Companion",
    "hero_summary_pill": "Skills • Confidence • Clarity • Real-world prep",
}


PASSAGES_CSS = """
:root {
    --passages-navy: #082b66;
    --passages-navy-2: #143c78;
    --passages-text: #172033;
    --passages-muted: #617083;
    --passages-bg: #f0fbfd;
    --passages-teal: #00cf9a;
    --passages-teal-deep: #068b79;
    --passages-aqua: #a8e2e5;
    --passages-yellow: #fff2a6;
    --passages-coral: #ff9d7b;
    --passages-blue-soft: #edf5ff;
    --passages-card-shadow: 0 16px 42px rgba(8, 43, 102, 0.10);
    --passages-soft-shadow: 0 9px 24px rgba(8, 43, 102, 0.075);
    --passages-border: rgba(8, 43, 102, 0.10);
    color-scheme: light;
}

html,
body {
    color-scheme: light !important;
}

body {
    font-family: "Poppins", "Nunito Sans", Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
    color: var(--passages-text) !important;
    background:
        radial-gradient(circle at 84% 10%, rgba(168,226,229,0.58), transparent 22rem),
        radial-gradient(circle at 10% 34%, rgba(0,207,154,0.12), transparent 19rem),
        linear-gradient(180deg, var(--passages-bg) 0 128px, #ffffff 128px 74%, #eef9fb 100%) !important;
}

.site-bg {
    display: none !important;
}

body::before {
    width: 430px !important;
    height: 430px !important;
    top: 320px !important;
    right: -210px !important;
    left: auto !important;
    background: radial-gradient(circle, rgba(0,207,154,0.12), transparent 70%) !important;
    opacity: 0.85 !important;
}

body::after {
    width: 330px !important;
    height: 330px !important;
    top: 690px !important;
    left: -160px !important;
    right: auto !important;
    background: radial-gradient(circle, rgba(255,242,166,0.45), transparent 70%) !important;
    opacity: 0.75 !important;
}

.hero-wrap {
    padding-top: 24px !important;
}

header.hero {
    position: relative;
    min-height: 470px;
    padding: clamp(2.2rem, 5vw, 4.5rem) clamp(1.45rem, 5vw, 4.6rem) !important;
    border: 1px solid rgba(8, 43, 102, 0.06) !important;
    border-radius: 34px !important;
    color: var(--passages-navy) !important;
    background:
        radial-gradient(circle at 82% 25%, rgba(168,226,229,0.72), transparent 12rem),
        radial-gradient(circle at 90% 62%, rgba(255,242,166,0.50), transparent 10rem),
        linear-gradient(135deg, #ffffff 0%, #ffffff 62%, #f1fbfc 100%) !important;
    box-shadow: var(--passages-card-shadow) !important;
    overflow: hidden;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
}

header.hero::before {
    content: "";
    position: absolute;
    right: clamp(1.2rem, 6vw, 4.4rem);
    bottom: 14%;
    width: min(31vw, 340px);
    aspect-ratio: 1;
    border: clamp(18px, 3vw, 32px) solid rgba(168,226,229,0.92);
    border-radius: 30px;
    background: rgba(255,255,255,0.70) !important;
    box-shadow: 0 20px 60px rgba(8,43,102,0.11);
}

header.hero::after {
    content: "Starts Here";
    position: absolute;
    right: clamp(1.35rem, 7vw, 4.8rem);
    top: 52%;
    z-index: 1;
    min-height: 54px;
    display: inline-flex;
    align-items: center;
    padding: 0 1.55rem;
    border-radius: 16px;
    background: var(--passages-teal) !important;
    color: var(--passages-navy) !important;
    font-size: clamp(1rem, 1.8vw, 1.3rem);
    font-weight: 800;
    box-shadow: 0 16px 28px rgba(0, 207, 154, 0.26);
}

.hero-kicker,
.hero h1,
.hero .subtitle,
.hero-meta {
    position: relative;
    z-index: 2;
    max-width: min(690px, 64%);
}

.hero-kicker {
    width: max-content;
    max-width: 100%;
    padding: 0.56rem 0.9rem !important;
    border-radius: 999px !important;
    background: #f0fbfd !important;
    border: 1px solid rgba(8, 43, 102, 0.08) !important;
    color: var(--passages-navy) !important;
    font-size: 0.78rem !important;
    font-weight: 800 !important;
}

.hero h1 {
    margin-top: 1.08rem !important;
    color: var(--passages-navy) !important;
    font-size: clamp(2.55rem, 6.1vw, 5rem) !important;
    line-height: 0.98 !important;
    letter-spacing: -0.058em !important;
    font-weight: 750 !important;
    text-shadow: none !important;
}

.hero h1::after {
    content: "";
    display: block;
    width: min(170px, 44%);
    height: 7px;
    margin-top: 0.32rem;
    border-radius: 999px;
    background: var(--passages-teal);
}

.hero .subtitle,
.passages-hero-copy p {
    color: var(--passages-text) !important;
    line-height: 1.72 !important;
    font-size: clamp(1rem, 1.25vw, 1.13rem) !important;
    font-weight: 400 !important;
}

.passages-hero-copy p {
    margin: 0;
}

.passages-hero-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.78rem;
    margin-top: 1.45rem;
}

.passages-cta,
.passages-soft-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 52px;
    padding: 0 1.45rem;
    border-radius: 15px;
    font-weight: 750;
}

.passages-cta {
    background: var(--passages-navy) !important;
    color: #ffffff !important;
    box-shadow: 0 12px 24px rgba(8,43,102,0.18);
}

.passages-soft-pill {
    background: var(--passages-yellow) !important;
    color: var(--passages-navy) !important;
    box-shadow: 0 12px 24px rgba(8,43,102,0.10);
}

.hero-meta {
    margin-top: 1.15rem;
}

.hero-pill {
    background: #ffffff !important;
    border: 1px solid rgba(8, 43, 102, 0.08) !important;
    color: var(--passages-navy) !important;
    box-shadow: var(--passages-soft-shadow) !important;
    font-weight: 600;
}

main {
    padding-top: 30px !important;
    padding-bottom: 38px !important;
}

.card {
    color: var(--passages-text) !important;
    min-height: 230px;
    padding: 1.22rem 1.18rem 1.08rem !important;
    border: 1px solid var(--passages-border) !important;
    border-radius: 28px !important;
    background: #ffffff !important;
    box-shadow: var(--passages-soft-shadow) !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
}

.card:hover {
    transform: translateY(-6px);
    border-color: rgba(0,207,154,0.38) !important;
    box-shadow: 0 26px 58px rgba(8,43,102,0.14) !important;
}

.card::before {
    background: radial-gradient(circle at top right, rgba(168,226,229,0.24), transparent 32%) !important;
}

.card::after {
    height: 9px !important;
    background: var(--card-accent, linear-gradient(90deg, var(--passages-teal), var(--passages-aqua), var(--passages-yellow))) !important;
}

.card-head {
    padding-bottom: 0.65rem;
    border-bottom: 1px solid rgba(8,43,102,0.075);
}

.card--passage_topic { --card-accent: linear-gradient(90deg, var(--passages-teal), #6ee7c8); grid-column: span 7; background: linear-gradient(180deg, #ffffff, #f0fffa) !important; }
.card--passage_why { --card-accent: linear-gradient(90deg, var(--passages-yellow), #ffffff); grid-column: span 5; background: linear-gradient(180deg, #fffef6, #ffffff) !important; }
.card--passage_feeling { --card-accent: linear-gradient(90deg, var(--passages-coral), #ffd8c9); grid-column: span 4; background: linear-gradient(180deg, #fff6f2, #ffffff) !important; }
.card--passage_step { --card-accent: linear-gradient(90deg, var(--passages-navy), var(--passages-teal)); grid-column: span 8; background: linear-gradient(180deg, #ffffff, #f7fcfd) !important; }
.card--passage_game { --card-accent: linear-gradient(90deg, #6ee7c8, var(--passages-yellow)); grid-column: span 6; background: linear-gradient(180deg, #f4fffb, #ffffff) !important; }
.card--passage_shuffle { --card-accent: linear-gradient(90deg, var(--passages-aqua), var(--passages-teal)); grid-column: span 6; background: linear-gradient(180deg, #f3fbff, #ffffff) !important; }
.card--passage_prompt { --card-accent: linear-gradient(90deg, var(--passages-yellow), var(--passages-teal)); grid-column: span 5; background: linear-gradient(180deg, #fffdf1, #ffffff) !important; }
.card--passage_connection { --card-accent: linear-gradient(90deg, var(--passages-navy), #8fb6ff); grid-column: span 7; background: linear-gradient(180deg, #f7f9ff, #ffffff) !important; }
.card--passage_skill { --card-accent: linear-gradient(90deg, var(--passages-teal), var(--passages-navy)); grid-column: span 4; background: linear-gradient(180deg, #f1fffb, #ffffff) !important; }
.card--passage_reflection { --card-accent: linear-gradient(90deg, #8fb6ff, var(--passages-aqua)); grid-column: span 8; background: linear-gradient(180deg, #f5f8ff, #ffffff) !important; }

.card--passage_topic .icon-badge,
.card--passage_step .icon-badge,
.card--passage_game .icon-badge {
    background: var(--passages-teal) !important;
    color: var(--passages-navy) !important;
}

.card--passage_why .icon-badge,
.card--passage_prompt .icon-badge {
    background: var(--passages-yellow) !important;
    color: var(--passages-navy) !important;
}

.card--passage_feeling .icon-badge {
    background: #ffe4d9 !important;
    color: var(--passages-navy) !important;
}

.card--passage_connection .icon-badge,
.card--passage_reflection .icon-badge {
    background: var(--passages-navy) !important;
    color: #ffffff !important;
}

.eyebrow {
    display: inline-flex;
    width: fit-content;
    padding: 0.32rem 0.56rem !important;
    border-radius: 999px !important;
    background: rgba(0,207,154,0.10) !important;
    color: var(--passages-teal-deep) !important;
    font-size: 0.72rem !important;
    font-weight: 850 !important;
    letter-spacing: 0.08em !important;
}

h2 {
    color: var(--passages-navy) !important;
    letter-spacing: -0.04em !important;
    font-weight: 750 !important;
}

.body {
    color: var(--passages-text) !important;
    font-size: 0.97rem !important;
    line-height: 1.72 !important;
}

.body strong,
.body b {
    color: var(--passages-navy) !important;
    font-weight: 750 !important;
}

.icon-badge {
    background: var(--passages-bg) !important;
    border: 1px solid rgba(8, 43, 102, 0.08) !important;
    color: var(--passages-navy) !important;
    font-weight: 850 !important;
    box-shadow: 0 8px 18px rgba(8,43,102,0.07) !important;
}

.passage-chips,
.game-choices,
.shuffle-words,
.shuffle-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.58rem;
}

.passage-chips {
    margin-top: 0.9rem;
}

.passage-chip,
.game-choice,
.shuffle-word,
.game-reset,
.shuffle-check,
.shuffle-reset {
    display: inline-flex;
    align-items: center;
    border: 1px solid rgba(8, 43, 102, 0.09) !important;
    border-radius: 999px !important;
    padding: 0.44rem 0.72rem !important;
    background: #ffffff !important;
    color: var(--passages-navy) !important;
    box-shadow: 0 8px 18px rgba(8,43,102,0.06) !important;
    font: inherit;
    font-size: 0.88rem !important;
    font-weight: 700 !important;
    line-height: 1.2;
}

.game-choice,
.shuffle-word,
.game-reset,
.shuffle-check,
.shuffle-reset {
    cursor: pointer;
    transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
}

.game-choice:hover,
.shuffle-word:hover,
.game-reset:hover,
.shuffle-check:hover,
.shuffle-reset:hover {
    transform: translateY(-2px);
    border-color: rgba(0,207,154,0.32) !important;
}

.passage-chip--sage { background: #e9fbf4 !important; border-color: rgba(0,207,154,0.18) !important; }
.passage-chip--sky { background: #eef9fb !important; border-color: rgba(62,111,149,0.14) !important; }
.passage-chip--gold { background: var(--passages-yellow) !important; border-color: rgba(8,43,102,0.08) !important; }
.passage-chip--clay { background: #fff0ea !important; border-color: rgba(198,129,98,0.22) !important; }

.passage-list {
    margin: 0.85rem 0 0;
    padding: 0;
    list-style: none;
    counter-reset: passage-step;
}

.passage-list li {
    position: relative;
    margin: 0.62rem 0;
    padding: 0.74rem 0.78rem 0.74rem 3.05rem;
    border-radius: 16px;
    background: rgba(255,255,255,0.76) !important;
    border: 1px solid rgba(8,43,102,0.075) !important;
    box-shadow: 0 8px 18px rgba(8,43,102,0.045) !important;
}

.passage-list li::before {
    counter-increment: passage-step;
    content: counter(passage-step);
    position: absolute;
    left: 0.72rem;
    top: 50%;
    transform: translateY(-50%);
    width: 1.65rem;
    height: 1.65rem;
    display: grid;
    place-items: center;
    border-radius: 999px;
    background: var(--passages-teal) !important;
    color: var(--passages-navy) !important;
    font-weight: 850;
}

.passage-label {
    display: block;
    margin-top: 1rem;
    color: var(--passages-muted) !important;
    font-size: 0.74rem;
    font-weight: 850;
    letter-spacing: 0.1em;
    text-transform: uppercase;
}

.passage-callout,
.game-result,
.shuffle-result,
.shuffle-target {
    margin-top: 0.8rem;
    padding: 0.9rem 1rem;
    border-radius: 16px;
    background: #f2fbfc !important;
    color: var(--passages-text) !important;
}

.passage-callout {
    border-left: 6px solid var(--passages-teal) !important;
}

.passage-note {
    margin-top: 0.95rem;
    color: var(--passages-muted) !important;
    font-size: 0.94rem;
}

.game-board {
    margin-top: 0.95rem;
    display: grid;
    gap: 0.75rem;
}

.game-question {
    padding: 0.96rem 1rem !important;
    border-radius: 17px !important;
    background: rgba(255,242,166,0.58) !important;
    color: var(--passages-navy) !important;
    font-weight: 750 !important;
}

.game-choice.is-correct {
    background: var(--passages-teal) !important;
    color: var(--passages-navy) !important;
    border-color: var(--passages-teal) !important;
}

.game-choice.is-wrong {
    background: #fff0ea !important;
    border-color: rgba(198,129,98,0.30) !important;
}

.shuffle-target {
    min-height: 58px;
    border: 2px dashed rgba(8,43,102,0.18) !important;
    color: var(--passages-muted) !important;
}

.shuffle-target .shuffle-picked {
    display: inline-flex;
    margin: 0.15rem;
    padding: 0.42rem 0.62rem;
    border-radius: 999px;
    background: var(--passages-bg) !important;
    color: var(--passages-navy) !important;
    font-weight: 750;
}

.footer-inner {
    background: #ffffff !important;
    color: var(--passages-muted) !important;
    border: 1px solid rgba(8,43,102,0.08) !important;
    box-shadow: var(--passages-soft-shadow) !important;
}

@media (max-width: 980px) {
    header.hero {
        min-height: unset;
        padding-bottom: 3rem !important;
    }

    header.hero::before,
    header.hero::after {
        display: none;
    }

    .hero-kicker,
    .hero h1,
    .hero .subtitle,
    .hero-meta {
        max-width: 100%;
    }

    .card--passage_topic,
    .card--passage_why,
    .card--passage_step,
    .card--passage_prompt,
    .card--passage_game,
    .card--passage_shuffle,
    .card--passage_feeling,
    .card--passage_connection,
    .card--passage_skill,
    .card--passage_reflection {
        grid-column: span 6;
    }
}

@media (max-width: 720px) {
    .hero h1 {
        max-width: none;
        font-size: clamp(2.3rem, 12vw, 3.6rem) !important;
    }

    .passages-cta,
    .passages-soft-pill {
        width: 100%;
    }

    .card--passage_topic,
    .card--passage_why,
    .card--passage_step,
    .card--passage_prompt,
    .card--passage_game,
    .card--passage_shuffle,
    .card--passage_feeling,
    .card--passage_connection,
    .card--passage_skill,
    .card--passage_reflection {
        grid-column: auto;
    }
}
"""


PASSAGES_JS = """
(function () {
    function setText(node, text) {
        if (node) node.textContent = text;
    }

    document.querySelectorAll('[data-confidence-quest]').forEach(function (game) {
        const buttons = game.querySelectorAll('.game-choice');
        const result = game.querySelector('.game-result');
        const reset = game.querySelector('.game-reset');

        buttons.forEach(function (button) {
            button.addEventListener('click', function () {
                buttons.forEach(function (item) {
                    item.classList.remove('is-correct', 'is-wrong');
                    item.disabled = true;
                });

                if (button.dataset.correct === 'true') {
                    button.classList.add('is-correct');
                    setText(result, 'Nice. That is the strongest next-step move: specific, calm, and doable.');
                } else {
                    button.classList.add('is-wrong');
                    const correct = game.querySelector('[data-correct="true"]');
                    if (correct) correct.classList.add('is-correct');
                    setText(result, 'Not a disaster. The better move is the one that creates clarity without trying to solve your whole life today.');
                }
            });
        });

        if (reset) {
            reset.addEventListener('click', function () {
                buttons.forEach(function (item) {
                    item.classList.remove('is-correct', 'is-wrong');
                    item.disabled = false;
                });
                setText(result, 'Pick the move that feels most like confidence plus common sense.');
            });
        }
    });

    document.querySelectorAll('[data-phrase-shuffle]').forEach(function (game) {
        const target = game.querySelector('.shuffle-target');
        const words = game.querySelectorAll('.shuffle-word');
        const check = game.querySelector('.shuffle-check');
        const reset = game.querySelector('.shuffle-reset');
        const result = game.querySelector('.shuffle-result');
        const answer = (game.dataset.answer || '').trim().toLowerCase();
        const picked = [];

        function renderTarget() {
            if (!target) return;
            if (!picked.length) {
                target.textContent = 'Tap the words in the order that makes the best mini-mantra.';
                return;
            }
            target.innerHTML = picked.map(function (word) {
                return '<span class="shuffle-picked">' + word + '</span>';
            }).join(' ');
        }

        words.forEach(function (button) {
            button.addEventListener('click', function () {
                picked.push(button.dataset.word || button.textContent.trim());
                button.disabled = true;
                renderTarget();
                setText(result, 'Keep building it. Tiny mantras count.');
            });
        });

        if (check) {
            check.addEventListener('click', function () {
                const guess = picked.join(' ').trim().toLowerCase();
                if (!picked.length) {
                    setText(result, 'Start by tapping a word. No pressure.');
                } else if (guess === answer) {
                    setText(result, 'You got it. Put that one in your pocket for today.');
                } else {
                    setText(result, 'Close enough to learn from. Try a phrase that sounds like a useful reminder, not a bumper sticker.');
                }
            });
        }

        if (reset) {
            reset.addEventListener('click', function () {
                picked.splice(0, picked.length);
                words.forEach(function (button) { button.disabled = false; });
                renderTarget();
                setText(result, 'Shuffle reset. Try again.');
            });
        }

        renderTarget();
    });
})();
"""


DAILY_PASSAGES = [
    {
        "passage": "Finding a First Direction",
        "audience": "Students who feel pressure to choose a future before they have enough real-world information.",
        "why": "A first direction does not have to be a forever decision. It can be a starting point: a way to learn, meet people, build confidence, and gather better information about what fits.",
        "feeling": "This stage can feel like everyone else has a plan. Many people only look certain from the outside. Uncertainty is not failure; it is often the beginning of honest exploration.",
        "skill": "Decision-making without panic",
        "steps": [
            "Write down three work environments you might tolerate or enjoy: outdoors, office, hands-on, helping people, technical, creative, or fast-paced.",
            "Pick one person who has a job you vaguely understand and ask what a normal day actually looks like.",
            "Choose one small experiment for this week: a conversation, a video, a job shadow, a course page, or a local posting to read closely.",
        ],
        "prompt": "What kind of day would you rather have: busy and social, quiet and focused, physical and hands-on, or mixed?",
        "parent_note": "Try asking about energy and environment before asking about a job title. It keeps the conversation less loaded.",
        "connection": "This is the heart of a Passages-style approach: helping a young person move from vague pressure to one clearer next step.",
        "reflection": "What is one option you do not need to decide today, and what is one thing you can learn this week?",
        "quest_question": "Your friend says, “I have no idea what I want to do.” What is the best first move?",
        "quest_options": [
            ("Tell them to pick a major immediately", False),
            ("Ask what kind of workday they might enjoy", True),
            ("Send them a list of 100 careers", False),
        ],
        "shuffle_words": ["one", "step", "gives", "me", "momentum"],
        "shuffle_answer": "one step gives me momentum",
        "chips": ["Career exploration", "Confidence", "Next step", "Low pressure"],
    },
    {
        "passage": "Getting Ready for a First Job",
        "audience": "Teens and young adults preparing for first jobs, internships, apprenticeships, or part-time work.",
        "why": "First-job readiness is about more than getting hired. It is about learning how to show up, ask questions, receive feedback, recover from mistakes, and become someone others can trust.",
        "feeling": "A first job can feel intimidating because many expectations are invisible. Young workers may not know what counts as professional until someone explains it plainly.",
        "skill": "Workplace confidence",
        "steps": [
            "Practice a simple check-in sentence: 'I want to make sure I am doing this the right way. Can you show me what good looks like?'",
            "Before the first shift or first week, write down three questions you are allowed to ask.",
            "At the end of the day, note one thing you learned and one thing to ask about next time.",
        ],
        "prompt": "When you are unsure at work, what would make it easier to ask for help?",
        "parent_note": "A young worker may need scripts more than speeches. Give them words they can actually use with a manager.",
        "connection": "A daily flyer beside My Passages can make the hidden curriculum of early work visible, friendly, and teachable.",
        "reflection": "What is one workplace habit that would make someone easier to train?",
        "quest_question": "You are confused during a shift. What move shows maturity?",
        "quest_options": [
            ("Pretend you understand and hope it works out", False),
            ("Ask one clear question before guessing", True),
            ("Disappear into the break room forever", False),
        ],
        "shuffle_words": ["ask", "listen", "try", "again"],
        "shuffle_answer": "ask listen try again",
        "chips": ["First job", "Work habits", "Communication", "Trust"],
    },
    {
        "passage": "Choosing Between College, Trade School, Work, or Apprenticeship",
        "audience": "Students and families comparing post-high-school options without wanting a one-size-fits-all answer.",
        "why": "The real question is not whether one path is universally best. The better question is which path gives this person structure, momentum, support, and a realistic way to grow.",
        "feeling": "Families can feel pulled between cost, pride, fear, opportunity, and expectations. A calm comparison can turn a stressful debate into a practical planning conversation.",
        "skill": "Comparing options fairly",
        "steps": [
            "List the next-step options without ranking them yet: college, community college, trade school, apprenticeship, work, military, certificate, or gap period with structure.",
            "For each option, write one cost, one benefit, one risk, and one person to talk to.",
            "Circle the option that would create the most useful momentum over the next six months.",
        ],
        "prompt": "Which path gives you the best chance to keep learning without feeling stuck or overwhelmed?",
        "parent_note": "Try not to make the first conversation about prestige. Make it about fit, structure, support, cost, and momentum.",
        "connection": "This topic belongs beside My Passages because it supports the transition itself, not just the final choice.",
        "reflection": "What would make one option feel more real: a visit, a conversation, a budget, or a trial step?",
        "quest_question": "Which comparison is most useful when weighing paths?",
        "quest_options": [
            ("The option that sounds most impressive", False),
            ("The option with support, momentum, and realistic next steps", True),
            ("The option everyone argues about online", False),
        ],
        "shuffle_words": ["fit", "beats", "pressure", "today"],
        "shuffle_answer": "fit beats pressure today",
        "chips": ["After high school", "Trade school", "College alternatives", "Family decision"],
    },
    {
        "passage": "Building a Simple Professional Identity",
        "audience": "Students and early-career young adults who need to introduce themselves but do not yet feel established.",
        "why": "A professional identity does not have to be polished or final. It can simply explain what someone is learning, what they are curious about, and what kind of opportunity they are open to.",
        "feeling": "Many young people worry they have nothing to say because they do not have much experience yet. But honesty, curiosity, reliability, and willingness to learn are all real signals.",
        "skill": "Introducing yourself clearly",
        "steps": [
            "Write a two-sentence introduction: who you are, what you are exploring, and what kind of experience you hope to get.",
            "Add one example of responsibility: a job, sport, class project, family role, volunteer work, or personal project.",
            "Practice saying it out loud until it sounds natural instead of scripted.",
        ],
        "prompt": "What are you learning right now, and what kind of opportunity would help you learn more?",
        "parent_note": "Help them name real responsibilities they already carry. Experience is not only paid work.",
        "connection": "A Passages-style resource can help young people talk about themselves without pretending to have everything figured out.",
        "reflection": "What is one honest strength you can name without exaggerating?",
        "quest_question": "What is the strongest beginner introduction?",
        "quest_options": [
            ("I am still learning, and I am interested in hands-on experience", True),
            ("I am basically an expert in everything", False),
            ("I have no skills at all, sorry", False),
        ],
        "shuffle_words": ["clear", "honest", "easy", "to", "help"],
        "shuffle_answer": "clear honest easy to help",
        "chips": ["LinkedIn", "Networking", "Self-introduction", "Confidence"],
    },
    {
        "passage": "Parents Supporting Without Taking Over",
        "audience": "Parents, guardians, mentors, and family members trying to help a young adult take the next step.",
        "why": "Support works best when it lowers pressure and increases clarity. The goal is not to force a perfect plan; the goal is to help the young person stay engaged long enough to take a useful next step.",
        "feeling": "Parents may feel worried, impatient, or afraid time is being wasted. Young adults may feel judged, compared, or overwhelmed. Both sides often want progress but get stuck in the same conversation.",
        "skill": "Better transition conversations",
        "steps": [
            "Replace 'What is your plan?' with 'What feels like the next thing you are willing to learn more about?'",
            "Ask before advising: 'Do you want ideas, help sorting options, or just someone to listen for a minute?'",
            "Agree on one small next step and one calm time to check back in.",
        ],
        "prompt": "What kind of help would feel useful right now instead of stressful?",
        "parent_note": "The tone matters. Curiosity usually opens more doors than urgency.",
        "connection": "This is an ideal companion lane for My Passages: helping families turn pressure into practical support.",
        "reflection": "What question could open a better conversation this week?",
        "quest_question": "A conversation is getting tense. What helps most?",
        "quest_options": [
            ("Ask what kind of help would actually feel useful", True),
            ("Repeat the same advice louder", False),
            ("Compare them to someone else's kid", False),
        ],
        "shuffle_words": ["curiosity", "beats", "pressure"],
        "shuffle_answer": "curiosity beats pressure",
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


def _quest_html(passage: dict) -> str:
    buttons = "".join(
        f'<button class="game-choice" type="button" data-correct="{str(is_correct).lower()}">{label}</button>'
        for label, is_correct in passage["quest_options"]
    )
    return f"""
    <div class="game-board" data-confidence-quest>
        <div class="game-question">{passage["quest_question"]}</div>
        <div class="game-choices">{buttons}</div>
        <div class="game-result">Pick the move that feels most like confidence plus common sense.</div>
        <button class="game-reset" type="button">Reset the quest</button>
    </div>
    """


def _shuffle_html(passage: dict) -> str:
    words = "".join(
        f'<button class="shuffle-word" type="button" data-word="{word}">{word}</button>'
        for word in passage["shuffle_words"]
    )
    return f"""
    <div class="game-board" data-phrase-shuffle data-answer="{passage["shuffle_answer"]}">
        <div class="shuffle-target"></div>
        <div class="shuffle-words">{words}</div>
        <div class="shuffle-actions">
            <button class="shuffle-check" type="button">Check my phrase</button>
            <button class="shuffle-reset" type="button">Shuffle reset</button>
        </div>
        <div class="shuffle-result">Build a tiny reminder that is useful enough to actually remember.</div>
    </div>
    """


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    today, passage = _passage_for_date(date_str, seed)

    cards = [
        CardItem(
            card_type="passage_topic",
            eyebrow="Today’s Focus",
            title=passage["passage"],
            body=(
                f"<strong>Who this is for:</strong> {passage['audience']}"
                + _chip_html(passage["chips"], "sky")
                + '<p class="passage-note">A quick daily page for building clarity, confidence, and real-world readiness.</p>'
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
            eyebrow="Try This Today",
            title="A practical next step",
            body=(
                "Small steps matter because they create motion without demanding a perfect life plan."
                + _list_html(passage["steps"])
            ),
        ),
        CardItem(
            card_type="passage_game",
            eyebrow="Mini Confidence Quest",
            title="Pick the strongest next move",
            body=(
                "A tiny game for practicing judgment without making the day feel like homework."
                + _quest_html(passage)
            ),
        ),
        CardItem(
            card_type="passage_shuffle",
            eyebrow="Phrase Shuffle",
            title="Build today’s mini-mantra",
            body=(
                "Tap the words into an order that sounds like something you could actually say to yourself."
                + _shuffle_html(passage)
            ),
        ),
        CardItem(
            card_type="passage_prompt",
            eyebrow="Conversation Starter",
            title="A better question to ask today",
            body=(
                f'<div class="passage-callout">{passage["prompt"]}</div>'
                + _chip_html(["For students", "For parents", "For mentors"], "gold")
            ),
        ),
        CardItem(
            card_type="passage_connection",
            eyebrow="Parent / Mentor Note",
            title="Support without taking over",
            body=(
                f'<div class="passage-callout">{passage["parent_note"]}</div>'
                + '<span class="passage-label">My Passages Connection</span>'
                + f'<p>{passage["connection"]}</p>'
            ),
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
            "extra_css": PASSAGES_CSS,
            "extra_js": PASSAGES_JS,
            "extra_head_html": (
                '<link rel="preconnect" href="https://fonts.googleapis.com">'
                '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
                '<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">'
                '<meta name="color-scheme" content="light">'
                '<meta name="theme-color" content="#eef9fb">'
            ),
        },
    )
