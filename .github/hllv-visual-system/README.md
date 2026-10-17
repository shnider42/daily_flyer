# Infierno Liberado shared visual system

One coordinated presentation update for bugs, suggestions, content, and homepage sections.
The navigation, hero identity, imagery, data, and backend contracts remain in place.

- `shared.css`: shared scale, surfaces, controls, browse rows, bug/content details, homepage sections.
- `suggestions.css`: scoped public, member, moderator, and conversation presentation.
- `publish.py`: concatenates the styles into a content-addressed asset and installs favicon links.
- `build_favicon.cjs`: optional asset authoring; the SVG/ICO/PNG are checked in and need no production build.
- `test_browser.cjs`: Chromium/WebKit, both themes, 320/390/768/1280px, keyboard, filters,
  source access, public suggestion fixtures, signed-out flow, favicon delivery, and screenshots.
  Synthetic suggestions never reach the real service. This is not a live account/database test.

Run `python3 .github/hllv-homepage/publish.py` after editing source CSS or feature markup.
The existing homepage GitHub workflow verifies immutable assets and all three routes,
then runs the shared-system tests. No frontend framework or dependency was added.

## Rollback

Starting production commit: `e60bff5a0cab0dc7a189ee20e1724f8b23dac4bb` (October 17, 2026).
It includes the latest automatic official-feed refresh at the start of this change.
Revert the visual-system commit to preserve any subsequent data refresh commits.
Do not reset the production branch over newer content or account changes.
