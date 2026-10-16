# Your Passage standalone site concept

Local theme: `your_passage`, also accepted at the Flask boundary as `your-passage`.
Base: `staging` commit `2a053196d33f6b50299b8c342cc2316960314e21`.
Working branch: `feat/your-passage-site`. This branch is intended for a new, separate Render web service. The existing Your Passage service and its branch remain unchanged. No deployment, domain or Render changes are part of this branch push.

## Separate Render service settings

Create **New → Web Service** and connect `shnider42/daily_flyer`.

| Setting | Value |
| --- | --- |
| Name | `your-passage-site` (or another unused service name) |
| Branch | `feat/your-passage-site` |
| Runtime | Python 3 |
| Root directory | Leave blank (repository root) |
| Build command | `pip install -r requirements.txt` |
| Start command | `gunicorn --bind 0.0.0.0:$PORT --workers 1 --threads 4 --timeout 60 web:app` |
| Health check path | `/` |
| Instance | Free for initial review; it sleeps after 15 minutes of inactivity |
| Auto-deploy | On commit, tracking only `feat/your-passage-site` |
| Environment variable | `DEFAULT_THEME=your_passage` |
| Environment variable | `TZ=America/New_York` |

Python 3.12 is selected by `.python-version`; Render resolves the latest available 3.12 patch. Do not add a conflicting `PYTHON_VERSION` environment variable. No database, persistent disk, secrets, or Supabase configuration are needed for this theme. Notes are saved only in visitors' browsers, by explicit choice.

Keep the automatically assigned `onrender.com` hostname for review. Do not edit the existing Your Passage service, its branch, or its custom domains.

Deployment settings verified against Render's official Flask, Python-version, and Free-tier documentation on 2026-10-16:
- https://render.com/docs/deploy-flask
- https://render.com/docs/python-version
- https://render.com/docs/free

## What works

- A complete responsive coaching homepage with student, parent, and school starting points.
- A field-guide layout with an illustrated route, a four-choice starting point, and a mobile navigation menu.
- Softer day surfaces and a blue-charcoal night appearance. The top-bar Day / Night switch remembers an override; Device returns to the operating system's preference.
- Existing Tim booking destination: https://calendly.com/tim-mypassages.
- Four student passages reused from `topic_signal_daily.DAILY_PASSAGES`, selected deterministically by DFE date or seed.
- Read / Try / Reflect with keyboard-operable tabs and progress. Progress means the visitor completed the prompts, not that a real-world action was verified.
- Topic-specific conversation rehearsals, editable action suggestions, an optional time, and a printable next-step card.
- A reversible focus view and a notebook that reopens explicitly saved passages. Existing v1 browser notes remain compatible.
- Drafts survive topic switching in page memory. Explicit Save persists that passage in localStorage; Download exports text; Clear removes the selected passage only after confirmation.
- Tim's supplied portrait is optimized as a 840 × 1200 WebP (about 45 KB), framed with CSS, and embedded in the export. The original photo is not retouched.
- HTML, CSS, JavaScript, portrait, and the path illustration are embedded in the DFE export. No external fonts, remote images, accounts, trackers, form submissions, or runtime network calls.
- Original Passages theme, shared renderer, routes, default theme, and other themes remain unchanged.

## Color palette

Exact brand values extracted from the live stylesheet at https://tim-today.onrender.com/ on 2026-10-16:

| Role | Hex |
| --- | --- |
| Navy | `#082B66` |
| Body text | `#172033` |
| Muted text | `#617083` |
| Page background | `#F0FBFD` |
| Mint | `#00CF9A` |
| Deep teal | `#068B79` |
| Aqua | `#A8E2E5` |
| Pale yellow | `#FFF2A6` |
| Coral | `#FF9D7B` |

These remain the brand accents. Broad aqua and yellow backgrounds have been softened into quiet neutral surfaces; the night appearance uses the same accents sparingly. Semantic color tokens cover the entire page, including the route illustration, forms, selected actions, notebook, photo frame, and closing section.

| Appearance | Page | Practice surface | Heading text | Secondary text |
| --- | --- | --- | --- | --- |
| Day | `#F4F6F4` | `#FAFBF8` | `#082B66` | `#586779` |
| Night | `#121E29` | `#1B2B38` | `#E5EAE7` | `#A8B7C0` |

## Appearance behavior

- First visits follow `prefers-color-scheme`, including device changes while the page is open. The CSS also follows that preference when JavaScript is disabled.
- The Day / Night switch explicitly saves `day` or `night` under `your-passage:appearance`. Device removes only that override. The notes' `your-passage:v1:` keys remain separate.
- A small theme-owned head script applies the preference before the page body is parsed, avoiding a bright initial flash. Browser theme color and native form controls follow the selected appearance.
- The controls remain available in focus view and sync appearance changes across tabs. If browser storage is blocked, switching still works for the current visit and displays “This visit only.”
- Printing uses a white next-step card with dark text in either appearance. The portrait itself is unchanged.

## DFE integration

The existing theme loader validates `THEME_CONFIG`; the orchestrator calls `build_theme_page`. The theme returns a `PageContext` and a `CardItem`, using the renderer's supported extra CSS / JavaScript / head metadata. It supplies a custom full-width composition inside that card. The stock hero and footer are hidden by theme CSS; the content remains server rendered. No shared engine changes are required.

Theme-owned assets are in `daily_flyer/themes/your_passage_assets`. The data payload is JSON with `<` escaped for safe script embedding. Text from data and user notes is rendered with textContent or textarea.value, not interpolated as HTML.

Local route after installing requirements: `python -m flask --app web run`, then `http://127.0.0.1:5000/?theme=your-passage`.
For deterministic output, append `&date=2026-10-16&seed=0`.

Export a review copy using the real engine:

```python
from daily_flyer.orchestrator import build_daily_page
from daily_flyer.renderer import render_html_to_file
render_html_to_file(build_daily_page('your_passage'), 'Your-Passage-preview.html')
```

## Content provenance and editorial status

Service audiences, one-to-one coaching, group discussions, interview preparation, communication development, school partnerships, and Tim's 40+ years / six countries / four continents are from https://mypassages.net, reviewed 2026-10-16. Public-site retrieval was available through search; direct origin asset retrieval returned 502. Tim's portrait was supplied by the user. No testimonials, promises of results, fees, or availability were invented. The decorative illustration is original SVG, not a claim about the program.

The Irish Today title attachment informed the idea of a distinct masthead; its Irish wording was not reused for Passages. The color palette follows the user's reference at tim-today.onrender.com.

All new copy and adapted practice material need Tim's editorial approval before becoming official Passages material. The existing library is small, rotates, and is not an automatically researched feed. For sustained return visits, expand it into a reviewed sequence that follows Tim's group sessions.

## Before publishing as official Passages material

1. Review the visual design with Tim, confirm the public brand name and approve the copy/exercises.
2. Review the current intake form and privacy policy with the owner. This concept offers direct booking but deliberately does not replace the existing intake workflow with a pretend submission.
3. Decide whether local-only notes are sufficient. Accounts, cross-device progress, student records, lead capture, email subscriptions and admin publishing are not implemented.
4. Use a dedicated DFE deployment with `DEFAULT_THEME=your_passage` and verify booking, accessibility and responsive behavior in real browsers. Keep this concept on its separate branch and service.

Verification includes six Python integration tests, ten practice interaction tests, and eight appearance tests. These cover actual Flask responses and DFE export, date/seed behavior, HTML structure, legacy notes, focus/menu controls, rehearsal feedback, takeaways, save/download/print, scoped deletion, blocked storage, keyboard tabs, pre-body appearance, device changes, saved overrides, reset, and cross-tab appearance updates. A supported browser-control plugin was unavailable, so there is no claim of desktop/mobile visual QA.

Run the focused checks:

```sh
python -m unittest discover -s tests -p test_your_passage.py -v
node --check daily_flyer/themes/your_passage_assets/script.js
node --check daily_flyer/themes/your_passage_assets/appearance.js
# With jsdom available as a test-only Node dependency:
node tests/test_your_passage_interactions.cjs /absolute/path/Your-Passage-preview.html
node tests/test_your_passage_appearance.cjs /absolute/path/Your-Passage-preview.html
```
