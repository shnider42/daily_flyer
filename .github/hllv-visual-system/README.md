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
# Wide-screen and first-view refinement — October 17, 2026

The shared shell now uses a 1920px maximum with fluid gutters. At 1600px and above,
bug, content, and public suggestion records form two readable columns. Homepage
feature updates and priority bugs sit alongside one another from 1400px. Detail
prose stays bounded, and forms retain their existing comfortable reading width.

The existing river/helicopter picture is a single decorative layer outside all
routes. The logo is the Home action, with a visible Home caption and current-page
state; the two trackers precede a separated Suggestion box action.

First-view checks use real viewport heights: 320×740, 390×844, 768×1024, 1280×720,
1920×1080, and 2560×1440. They verify identity, primary controls, and first-result
title/status are visible without scrolling. The complete first desktop record
and all three home destinations on the 390px phone must also fit. Longer lists
and detail evidence remain naturally scrollable; no fixed-height cropping or
scroll snapping is introduced. QA captures opening screenshots in both themes
and Chromium/WebKit. Synthetic suggestion fixtures never write to production.

Production starting point: `edab7a7d63bc50ead82ac90ddddb8acf270140de`.
