# Soph(more) Slump(?) — visualization standard and audit

Status: proposed standard, with one football prototype for human evaluation.
Audit baseline: `31c797528430685b00e2a271f5ab274b8779648e` (v3.4.0).
Prepared: 2026-10-01 UTC. The source datasets are frozen for this work.

## Purpose and authority

Help a visitor compare a player's first substantial season with the next calendar
season, then inspect what followed. A change in a statistic is not a diagnosis of
ability, a cause, or a forecast. The default experience should answer one question;
the research workspace remains a separate destination.

This is a project specification, not a claim of certification or endorsement.
It draws on the following primary references, inspected on 2026-10-01:

- [ONS principles](https://service-manual.ons.gov.uk/data-visualisation/guidance/principles): distinguish explanatory and exploratory work; show the relevant comparison.
- [ONS chart text](https://service-manual.ons.gov.uk/data-visualisation/guidance/chart-text): concise titles, readable labels, source attribution and essential context.
- [ONS axes](https://service-manual.ons.gov.uk/data-visualisation/guidance/axes-and-gridlines): linear default, round ticks, appropriate origins, common comparison scales.
- [ONS small multiples](https://service-manual.ons.gov.uk/data-visualisation/chart-types/small-multiple-charts): separate dense series into panels with identical scales.
- [NN/g progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/): keep frequent tasks available and defer specialized controls; test the split with users.
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/): accessibility requirements; especially 1.1.1, 1.4.1, 1.4.3, 1.4.10, 1.4.11, 2.1.1, 2.4.7 and 2.5.8.

The 44 CSS-pixel control target below is our touch-friendly design target, not
the WCAG 2.2 AA minimum. Automated checks do not establish full WCAG conformance.

## Shared acceptance rules

| ID | Requirement | Acceptance check |
|---|---|---|
| Q1 | One initial question | The first screen names the comparison without requiring a mode or preset choice. |
| Q2 | Different questions get appropriate charts | Two seasons: paired values; history: time-series panels; population association: a separately explained study. |
| C1 | A visible reference | State whether the comparison is to the player's own year one, peers, or a same-season baseline. |
| C2 | Honest time | Define each sport's study start; year two is start + 1, never the next observed row. Do not call it rookie year unless verified. |
| C3 | Honest measurement | Label units, direction and transformations; rates are not totals. Missing or uncertain comparisons never become zero or a slump. |
| C4 | Honest scales | Linear by default, round readable ticks, no dual axes. Bars start at zero; point/line bounds may be fitted and must be disclosed. Panels being compared share x/y bounds. |
| C5 | Consistent population | Chart, summary, table and export identify their populations. Never silently switch from selected players to a full cohort. |
| V1 | Identity without colour lookup | Direct player names, year labels and marker shapes convey meaning. Colour is supplementary. |
| V2 | Density handling | Do not impose an arbitrary selection cap. Paginate panels with an explicit range/count; preserve all selections and export them all. |
| V3 | Essential context stays visible | Show the start rule, source scope, workload warnings and era caveat; put formulas and detailed provenance in one secondary area. |
| I1 | Primary tasks always accessible | Player selection, measure, exact numbers, reset and return to the current explorer work without enabling an expert mode. |
| I2 | No hover dependency | Exact values are available as text and table. Every interaction works with keyboard and touch. |
| I3 | Stable interaction | Searching changes the picker only. No scroll jumps on inspection. Controls preserve logical focus. Empty states explain how to recover. |
| A1 | Accessibility target | Text contrast >= 4.5:1, essential graphic contrast >= 3:1, visible focus, meaningful names, semantic tables, 44px primary controls. |
| A2 | Responsive layout | At 320/390/768/1440 CSS px, no document overflow or overlapping labels. Wide tables may scroll within their labeled container. |
| T1 | Interpretation test | Casual and expert viewers independently identify the question, years, direction, values and one limitation without coaching. |

These are requirements for the new system. They do not describe the current
explorers as already passing. Brand colours can vary; meanings and interaction
patterns should not.

## Cross-sport audit

Evidence: inspection of each explorer's page, rendering code, shared presentation
layer and existing browser tests, plus the user's reported viewer feedback.
This is a heuristic/code audit, not a completed usability study.

| Finding | Evidence in current implementation | Priority / treatment |
|---|---|---|
| Competing entry decisions | All sports put sport/detail choices, hero, stories and clock explanations ahead of the main graph. Football/baseball add study modes. | High: prototype one question-first entry. |
| Simple mode can hide essential tasks | `year_two_view.js` marks football/baseball picker sidebars and measures as Guided-only. Bowling's picker is always available. | High: preserve Bowling's accessible picker principle across the new system. |
| Repeated explanation adds length | Shared `yt-explainer` panels repeat chart purpose, reading and caution alongside sport-specific introductions/help. | High: one concise explanation, one contextual warning area. |
| Competing graph controls | Football has quick tools, graph presets, scale/normalization and fine-tuning. Baseball adds layout, graph settings and display count. | High: keep ordinary comparison controls; defer specialist analysis. |
| Nonlinear spacing is easy to reach | Football offers “Spread values” near core controls; football/baseball also support density, log and signed log. | High: exclude these from the public-facing comparison prototype; preserve in existing explorer. |
| Numeric ticks can be awkward | Bowling's `scale()` pads bounds then divides into four intervals, yielding labels such as 208.68. | Medium: shared round-number tick rule for later rollout. |
| Sample/selection meaning varies | Football/baseball aggregate summaries and some tables use the filtered cohort independently of selected lines. Bowling compare export is selected, research is filtered cohort. | High: new preview summary/table/export all use selected players and explicitly disclose paginated charts. |
| Dense overlays remain possible | All three allow many lines, with highlighting/separate panels as recovery tools. | High: named panels and visible pagination, no data or selection cap. |
| Statistical meanings differ | Football starter clock, baseball hitting/pitching clocks and PBA/USBC clocks are intentionally different. | Preserve: common presentation must not invent a common “professional year.” |
| Good safeguards already exist | Missing-year gaps, shared panel bounds, source trails, saved views and separate public preset stores. | Preserve and regression-test. |

## Football prototype scope

Route: `/?theme=qb_year_two_preview`. The current football page links to it;
the preview explicitly links back. It is not the default theme or a replacement
for any of the three explorers. It has a separate browser-storage key and does
not load or write shared presets or alter the shared detail-level preference.

- Default comparison: Tom Brady and Peyton Manning, passer rating, year one/two.
- Four measures from existing calculated rows: passer rating, completion rate,
  interception rate and passing efficiency versus the same-season league baseline.
- Paired-dot rows make year-one/year-two positions visible with circle/diamond
  markers, printed values, dates and changes. The metric is the horizontal axis.
- “What happened next?” uses one time-series panel per player with shared axes,
  a marked second year, optional five/ten/full-career window, and unbridged gaps.
- All 265 quarterbacks remain selectable. Six panels per page is a navigation
  choice, not a selection limit. Table/export include every selected player.
- Source, ordinary era caveat and any relevant small-workload/missing-value
  warnings stay visible. Detailed rules/formulas/provenance remain expandable.
- Table, CSV, reset and an explicit shareable view link work in the preview.
  Share links do not publish shared presets or send anything to another person.

Out of scope: new sources, new statistical models, changing thresholds, replacing
the other sports, redesigning public preset storage, or claiming a full WCAG audit.

## Human review before rollout

Run this separately with a casual viewer and the NFL expert, on their normal
device. Start at the default preview without an explanation. Do not send the
answer key beforehand. Record their words, task success, hesitation and assistance.

1. “What question does this page help you answer?”
2. “What does year one mean here? Which actual seasons are being compared?”
3. “What happened to each player's passer rating? Show me the values.”
4. “Add Steve Young. Is his second season directly comparable in workload?”
5. “Show what happened after year two. Find the exact value of a later season.”
6. “Could this chart alone establish who was the better quarterback or predict a career?”
7. “Return to the initial comparison, then find the source of the data.”

Researcher answer key: Brady 2001→2002, 86.5→85.7 (change -0.7 from unrounded
values); Manning 1998→1999, 71.2→90.7 (+19.5). Steve Young 1986→1987 has 14→3
starts and 363→69 attempts. Year one means first recorded 12-start single-team
season, not necessarily first NFL season. Rating is not era-adjusted. This is
descriptive, not a causal or predictive test. Values reflect the frozen snapshot.

Release gate: both reviewers correctly interpret tasks 1–4 without coaching and
can inspect/reset/source the comparison. Record failures, revise and retest before
adopting the pattern for baseball/bowling. Browser tests verify mechanics; they
cannot prove that real people understand the page. No human review is claimed yet.

## Implementation verification

- 45 focused Python tests pass, including exact dataset reuse and preview GETs
  never creating a preset database.
- 42 JavaScript calculation/presentation tests pass across the sports.
- Preview browser checks pass for selection/search, full-precision changes,
  missing league baselines, low-workload warnings, table/export population,
  all 265 players, pagination with invariant axes, links, separate storage,
  blocked storage and layouts from 320 to 1440 CSS pixels.
- Visible default text contrast and primary control heights are checked; desktop
  and mobile screenshots were inspected. Full-career tick labels are separated
  on narrow screens. These checks are not a full accessibility audit.
- Existing football and bowling browser suites pass, including three-sport
  navigation and preset behavior. No dataset files were modified.
- The broader 60-test Python suite has three existing non-sports theme failures
  (birthday wording, Irish visual-lab switcher, Nissan Z rendering). All three
  reproduce at the untouched baseline commit; they are outside this change.

Tests: `tests/test_qb_preview.py`, `tests/test_qb_preview_math.cjs` and
`tests/test_qb_preview_browser.cjs`. Browser checks require Playwright and a local
Chromium; set `CHROMIUM_EXECUTABLE` and `PYTHON` if they are not on default paths.
