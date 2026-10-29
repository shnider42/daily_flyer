# Relay Fieldguide prototype

Independent Reach the Beach preparation concept. Not affiliated with or approved by Millennium Running or Ragnar.

## Daily Flyer integration

Theme: `relay_companion`. Uses the existing theme loader, validation, `PageContext`, `CardItem`, and renderer metadata extensions. No shared engine changes. Source HTML, CSS, and JavaScript live in `daily_flyer/themes/relay_companion_assets/`.

Build: `python scripts/build_relay_companion.py`. Output: `relay_dist/index.html` and `robots.txt`. The focused build uses Python's standard library only and embeds CSS/JS for an independent, network-free application shell. The theme is also compatible with the normal DFE CLI and Flask `?theme=relay_companion` route when their dependencies are installed.

Render static site: `feat/relay-companion` branch; build `python scripts/build_relay_companion.py`; publish `relay_dist`; `SKIP_INSTALL_DEPS=true`. No server, secrets, database, or background jobs required.

## Working behavior

- Overview with standard/ultra/sprint/sprint-ultra format selection.
- Four-step guide with a sample handoff and saved completion.
- Simple/Moderate/Expert detail controls; Expert includes a clearly labeled rough time estimate.
- Source-linked announcements, audience filtering, and saved reviewed states.
- Editable team roster, planning groups, checklist, notes, and fictional sample team.
- Browser-local saving, versioned JSON snapshot export/import, print view, and reset confirmation.
- Responsive layout, keyboard controls, light/dark appearance, reduced-motion support.

## Limits and data ownership

No shared accounts or synchronization. Exports are snapshots and can contain names/notes supplied by the user. No registration, payments, live tracking, or organizer integration. No analytics or third-party requests in the application shell. Browser localStorage can be cleared or unavailable; export retains a copy. All imports are size-limited and normalized, and user strings are escaped before HTML display.

Source review: 2026-10-29. Facts are manually curated from:

- https://millenniumrunning.com/reachthebeach/
- https://millenniumrunning.com/press-release-millennium-running-to-acquire-reach-the-beach-relay/54727/

Final route, exchanges, waves, fees, equipment rules, and transfer terms must be confirmed with the organizer. The diagram is conceptual, not navigation. Checklist items and estimator are planning suggestions, not official instructions. The snapshot does not auto-refresh.

Run logic checks: `node --test tests/relay_companion.test.cjs`. Browser QA should cover navigation, detail levels, guide progression, handoffs, format changes, sample/reset confirmations, edits and reload persistence, updates reviewed states, export/import, and phone-width layout.

## A useful pilot

Validate the first-time guide and captain checklist with an organizer and several actual teams. Measure unanswered questions and time spent preparing before adding accounts or integrations. Shared persistence, organizer publishing, and authorized data integration would be separate production work.
