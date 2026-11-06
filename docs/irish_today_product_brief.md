# Irish Today product brief

## Status

This document defines the target product, editorial, and visual direction for Irish Today.

It complements `docs/irish_today_theme_map.md`:

- the theme map explains the current module and branch structure;
- this product brief explains what the public experience should become;
- implementation should proceed through small branches based on `staging` rather than by merging historical experiment branches wholesale.

PR #22 establishes the production boundary and readable baseline. This brief does not expand that pull request into a full redesign. It sets the contract for the increments that follow.

## Product thesis

> Irish Today is a daily interactive Irish culture briefing—part modern magazine, part county noticeboard, part language lesson, and part pub-table trivia.

The experience should feel recognizably Irish through its editorial choices, imagery, language, sport, geography, and cultural references—not through an excess of shamrocks, novelty type, or unrelated green decoration.

## Reader promise

A reader should be able to open Irish Today for five to ten minutes and leave with:

1. one useful piece of Irish language;
2. one stronger sense of a county or place;
3. one memorable story, fact, or historical connection;
4. one playful thing to do;
5. one reason to return for the next edition.

The page should be useful to readers who are already connected to Ireland and approachable to readers who are still learning.

## Product principles

### Editorial before dashboard

The page should read like a deliberately assembled daily edition, not a collection of equally weighted widgets.

### Irish through substance

County identity, Gaeilge, history, music, sport, landscape, people, and community should carry the identity. Visual decoration should support that material rather than substitute for it.

### Stable shape, fresh contents

Readers should understand the page structure after one visit. The contents can rotate, but the hierarchy and category roles should remain predictable.

### One meaningful interaction

Each edition should contain one primary Daily Challenge. Secondary controls should support reading, navigation, pronunciation, or saving—not compete for attention.

### Calm by default

Cards must be fully readable before hover. Motion should be restrained, purposeful, optional, and disabled by reduced-motion preferences.

### Sources remain visible

Photographs, articles, facts, and historical claims should keep useful source attribution. A beautiful unlabeled photograph is not a complete editorial card.

## Edition structure

Irish Today should continue to produce eight cards, but those cards should have a deliberate reading order and visual hierarchy.

### 1. Lead story

The strongest editorial feature in the edition.

Preferred material:

- Davy Holden History;
- a timely Irish culture or community story;
- a substantial historical anniversary;
- an exceptional county, person, or place feature.

The lead story should receive the largest headline treatment and should not be selected merely because it appears first in a provider response.

### 2. Gaeilge Today

A daily Irish-language lesson containing:

- the Irish word or phrase;
- a clear English meaning;
- approachable pronunciation help;
- one natural example of use;
- an optional difficulty marker or short practice action.

The card should teach one thing well rather than present a dense vocabulary list.

### 3. County Spotlight

A substantial place-based feature containing a useful selection of:

- county and province;
- Irish-language county name and pronunciation;
- county colors or crest-inspired accents;
- landmark, landscape, or map context;
- cultural, historical, musical, or sporting identity;
- one well-sourced fact.

The County Spotlight should rotate weekly so readers have time to recognize and revisit it.

### 4. Irish Curiosity

A concise, memorable fact, custom, person, object, expression, or connection.

This should avoid generic filler and duplicate material already covered by the lead story or county feature.

### 5. Daily Challenge

The edition's primary interaction.

Eligible challenge families:

- hurling timing or scoring;
- county clue ladder;
- Gaeilge word match;
- phrase builder;
- history ordering;
- Irish trivia;
- a future music, map, or visual-recognition challenge.

Only one challenge should receive the full interactive treatment in a normal edition.

### 6. Sport and community

A card connecting readers to Irish sport, clubs, local identity, traditions, or community life.

Hurling remains a signature Irish Today subject even when the hurling mini-game is not the Daily Challenge.

### 7. Visual Ireland

A strong photograph or visual artifact accompanied by:

- a location or subject label;
- a concise caption or observation;
- photographer or source attribution where applicable;
- an optional larger-view interaction.

This card should provide visual breathing room without becoming empty decoration.

### 8. Discovery

A rotating closing card drawn from:

- history;
- music;
- literature;
- food;
- Irish connections abroad;
- phrase or pronunciation practice;
- seasonal culture;
- a second short-form community item.

The Discovery position keeps the edition fresh without destabilizing the core structure.

## Current and target content contracts

PR #22 preserves the current six required card types:

1. `word`
2. `county`
3. `did_you_know`
4. `news`
5. `visual_layer`
6. `hurling_game`

That contract should remain unchanged while the production foundation is reviewed.

A later editorial-identity increment should introduce the target semantic roles above. In that increment, the fixed `hurling_game` anchor becomes a `daily_challenge` role that can select hurling or another approved challenge. Hurling must still appear regularly through the Sport and Community position and should remain the signature challenge on a predictable cadence.

This contract change must be implemented and tested in its own pull request; it should not be hidden inside CSS work.

## Content cadence

Not every category should rotate at the same speed.

### Daily

- Gaeilge Today;
- Irish Curiosity;
- Visual Ireland;
- Daily Challenge;
- Discovery.

### Weekly

- County Spotlight;
- a deeper sporting, musical, literary, or community focus;
- the signature hurling challenge or feature.

### Monthly or seasonal

- a major historical theme;
- a province, diaspora, festival, or tradition package;
- a special visual treatment or expanded edition.

### Current when available

- Davy Holden History feature;
- meaningful Irish news or cultural developments.

Current content should not force the page to become a general news feed. Irish Today remains a curated cultural edition.

## Deterministic selection

A fixed date and seed must continue to produce stable results.

Future selection should use independent deterministic streams for major roles so that changing the trivia pool does not unexpectedly reshuffle the county, lead story, photograph, or language card.

Suggested streams:

- lead;
- language;
- county/week;
- curiosity;
- challenge;
- sport/community;
- visual;
- discovery.

Weekly and monthly roles should derive from ISO week and calendar month respectively rather than from one shared daily shuffle.

## Editorial hierarchy and layout

### Desktop

Use a controlled editorial grid rather than free-form dense masonry.

Recommended hierarchy:

- a full-width masthead and edition navigation;
- one large lead-story region;
- a prominent County Spotlight;
- Gaeilge Today and Irish Curiosity as compact editorial cards;
- one clearly differentiated Daily Challenge;
- Sport and Community, Visual Ireland, and Discovery completing the edition.

Large-card placement should be determined by semantic role, not by `nth-of-type` position.

### Mobile

Mobile order should follow the editorial reading order exactly:

1. lead story;
2. Gaeilge Today;
3. County Spotlight;
4. Irish Curiosity;
5. Daily Challenge;
6. Sport and Community;
7. Visual Ireland;
8. Discovery.

The mobile page should not inherit a desktop masonry order that only happens to fit.

### Fullscreen and wide displays

The layout should gain breathing room, not additional arbitrary columns. Line length and card width should remain readable on very wide displays.

## Visual direction

### Theme concept

**Contemporary Irish cultural broadsheet**

The page should combine the authority and readability of a modern magazine with restrained references to Irish print, county identity, landscape, GAA programs, road signage, and local noticeboards.

### Palette

Proposed starting tokens:

- ink green: `#123D2C`;
- midnight blue: `#102B3A`;
- warm cream: `#F6F0E2`;
- paper white: `#FFFDF7`;
- saffron accent: `#D98A2B`;
- moss accent: `#6F8A61`;
- charcoal text: `#17211B`;
- muted text: `#566159`.

These values are a starting system, not a requirement to use every color on every card.

### Typography

- Use an editorial serif for feature headlines and selected card titles.
- Use a clean sans-serif for body text, navigation, labels, controls, and pronunciation guidance.
- Use monospaced or stencil typography only for a specific content reason, never as the default Irish identity.
- Preserve comfortable line length and body size before introducing decorative type.

The existing Fraunces direction can remain a candidate for editorial headlines. Supporting text should use the repository's normal readable sans-serif stack unless a later design increment intentionally changes it.

### Card language

Production cards should mostly use rectangular editorial forms with consistent corner treatment, spacing, and source placement.

Differentiate by purpose:

- editorial/reference cards: warm, readable paper-like surfaces;
- photography/features: edge-to-edge or strongly framed imagery with captions;
- Daily Challenge: a darker or more saturated interactive treatment within the same overall palette.

Card shape should follow category and function. It must not change arbitrarily because a card happens to be second or third in the DOM.

### Imagery

Prefer:

- Irish landscapes and streetscapes;
- county-specific locations;
- historical photographs and artifacts with clear rights/source context;
- sport and community imagery;
- maps, archival details, signs, and material culture.

Avoid relying on generic green scenery as the only signal of Ireland.

## Navigation and edition context

The masthead should make the edition feel dated and browsable.

Target controls:

- previous edition;
- today's edition;
- next edition when valid;
- visible edition date;
- optional indication of the weekly county or monthly theme.

Navigation must preserve deterministic date and seed behavior where applicable.

## Interaction rules

- One primary Daily Challenge per edition.
- Buttons and cards must expose visible keyboard focus.
- Hover may enhance a card but must never reveal information required for comprehension.
- Interactive scores and completion state may remain browser-local initially.
- Reset controls must be explicit.
- Games should explain the learning or cultural connection, not exist as generic engagement mechanics.
- Photo expansion, pronunciation help, saving, and edition navigation are supporting interactions and should remain visually secondary.

## Accessibility contract

Every production increment must preserve or improve:

- readable cards without hover;
- useful heading order;
- keyboard access and visible focus;
- sufficient foreground/background contrast;
- reduced-motion behavior;
- meaningful image alternative text or captions;
- touch targets appropriate for mobile;
- no interaction that depends only on color;
- clear status text for scores, answers, and errors;
- logical mobile reading order.

Motion should use one restrained entrance pattern at most. Reduced-motion preferences should disable entrance, parallax, tilt, drift, and decorative transitions.

## Customization roadmap

Customization should follow a stable editorial experience rather than precede it.

Potential later preferences:

- preferred county or province;
- beginner, intermediate, or advanced Gaeilge;
- more history versus more sport;
- saved cards;
- completed-challenge history;
- avoid immediate repetition of completed games;
- optional pronunciation or transliteration detail.

Initial preferences can be browser-local. Persistent accounts or server-side profiles are outside the current redesign scope.

## Production exclusions

The following should not be promoted into the public route as a complete system:

- the visual-lab control menu;
- global paper, glass, neon, museum, terminal, watercolor, and sticker presets;
- mouse-tracked tilt or spotlight effects;
- continuous card drift;
- hinged, cascade, and flipbook motion experiments;
- hover-to-restore readability;
- arbitrary `nth-of-type` clipping or card shapes;
- dense masonry as the primary storytelling model;
- empty unlabeled photo cards;
- multiple equal-weight games in one normal edition;
- a new public theme module for every experiment;
- a large Flyer Engine v2 migration as a prerequisite for the first redesign.

The visual lab should remain available as a testing environment. Individual ideas may be promoted only after they are reimplemented against the production card families and reviewed for desktop, mobile, keyboard, and reduced-motion behavior.

## Implementation sequence

### Increment 1: production foundation

PR #22:

- establish `irish_today_production`;
- route aliases to one public entry point;
- restore default readability;
- group cards by purpose;
- calm motion;
- preserve the visual lab separately;
- add production-contract tests and documentation.

### Increment 2: editorial identity

Recommended branch:

```text
feat/irish-today-editorial-identity
```

Scope:

- implement the controlled editorial grid;
- introduce the contemporary broadsheet palette and typography;
- assign hierarchy by semantic role;
- improve the masthead and edition navigation;
- add captions/context to Visual Ireland;
- preserve existing providers and deterministic behavior.

Do not add personalization or rebuild every interaction in this increment.

### Increment 3: Daily Challenge contract

Scope:

- replace the fixed `hurling_game` anchor with the semantic `daily_challenge` role;
- select one approved challenge deterministically;
- keep hurling on a predictable signature cadence;
- prevent immediate challenge repetition;
- add focused content-contract tests.

### Increment 4: richer county and Gaeilge cards

Scope:

- deepen the County Spotlight;
- improve pronunciation and usage guidance;
- introduce weekly county cadence;
- keep source and fallback behavior explicit.

### Increment 5: reader preferences

Scope:

- add a small browser-local preference model;
- support county, Gaeilge difficulty, and history/sport balance;
- preserve a useful default experience for readers who never customize anything.

## Acceptance criteria for the target experience

Irish Today is moving in the right direction when:

- a first-time reader can describe the page's purpose after one screen;
- the lead story, language lesson, county feature, and challenge are visually obvious;
- the page remains recognizably Irish without relying on novelty decoration;
- all eight cards are readable without hover;
- desktop and mobile present the same editorial order;
- a fixed date and seed remain stable;
- the page contains one primary challenge, not a wall of mini-games;
- photographs include useful context and attribution;
- reduced-motion and keyboard navigation work;
- the visual lab remains independently reachable;
- the production implementation does not gain another ambiguous public variant.
