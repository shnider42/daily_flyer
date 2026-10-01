# Shared sports charts — v3.5.0

The same chart component now runs on the normal football, baseball and bowling
routes, including baseball hitters/pitchers and PBA/USBC sources. The earlier
compact football route uses it too. This supersedes the football-only rollout
gate from v3.4.1 at the user's request. No source dataset or public preset schema
was changed.

## One interaction contract

Every sport has the same player picker, measure selector, shared/separate layout,
calendar/study-year axis, two/five/ten/full-career window, height control,
multi-player highlighting, marker control, actual/year-one-change values,
interpretation lines, exact-value inspector, table and CSV download. These
controls remain available in Simple, Guided and Full detail.

“One shared graph” always draws every selected player with data. There is no
25-player or other display cap. Separate panels paginate six at a time with the
same bounds across pages; returning to the shared graph shows everyone again.
The table and CSV include every selected player's shown years, including missing
values. No qualifying study start or no measured value produces a visible notice,
not an invented line or zero. USBC's visible division setting limits picker
matches; PBA and USBC remain separate sources.

Clutter controls preserve comparisons: highlight multiple names, keep the other
lines at 20–80% visibility, choose markers, use a tall chart, or choose separate
panels. Colors remain stable when adding/removing players. Direct endpoint labels
are separated when space permits; crowded plots keep names in the complete
scrollable legend and label highlighted lines when they fit. Highlighting never
filters out another selected player. Exact values also work without hover or
precise taps on points, through ordinary player/year selectors and a table.

Graph data means the selected players, including selected names outside old
cohort filters. Research modes still use their existing filtered cohorts. This
distinction is stated on the graph. No metric or study clock is generalized
across sports: 12 single-team starts, 300 PA, 50 IP, PBA event thresholds and USBC
complete entries retain their meanings.

## Interpretation lines

All added lines are optional and drawn alongside the observations. A visible
style key distinguishes them even when the options are collapsed. By default,
player lines apply to highlighted players, or everyone when none is highlighted;
the scope selector can explicitly include everyone.

| Option | Computation and limits |
|---|---|
| Linear trend | Ordinary least squares of the plotted value on the actual calendar/study-year coordinate. At least three measured years is this product's minimum. Missing years are omitted from fitting without compressing time. The dashed fit stops at its first/last observed year, with no forecast. The method panel reports n, slope and R²; constant values have undefined R². |
| 3-year moving average | Equally weighted trailing mean of the current and previous two consecutive calendar years. Requires all three values. No partial window, forward-looking data, gap bridging or extrapolation. |
| Mean | Per-player arithmetic mean of measured values in the shown window, weighted equally by year. It is not a game/attempt-weighted career statistic or a league average. |
| Median | Per-player median of the measured shown values; the midpoint of the middle pair for an even count. |
| Zero | Horizontal reference at zero in the current displayed units. |
| Custom reference | User-entered horizontal reference in the displayed units. Cleared when the metric or actual/year-one-change basis changes to avoid reusing an unrelated threshold. |

All panels share linear axes fitted to every selected observation and added line,
including reference values. Highlighting alone does not change the data bounds;
changing which fitted overlays are present can extend those bounds. The bounds
are printed below the plot. Year-one normalization subtracts the actual baseline
before fitting; an unavailable/uncertain baseline stays unavailable.

The table/CSV retain full-precision recorded and plotted values and provide
applicable trend, moving-average, mean and median values as separate columns.
Raw values are never overwritten. R² describes this fit, not significance,
causation, overall ability, or predictive validity. Small-workload cautions remain
attached to the selected players.

References inspected on 2026-10-01 UTC:

- [NIST: linear least squares](https://www.itl.nist.gov/div898/handbook/pmd/section1/pmd141.htm)
- [NIST: averaging and smoothing](https://www.itl.nist.gov/div898/handbook/pmc/section4/pmc42.htm)
- [NIST: centered versus trailing moving averages](https://www.itl.nist.gov/div898/handbook/pmc/section4/pmc422.htm)
- Existing [visualization standard and audit](year_two_visualization_standard.md)

## Adding another sport

Use `CHART_CSS` and `CHART_JS` from `year_two_sports.py`, then register an adapter
with `YearTwoCharts.register(...)`. Do not fork the controls or statistical code.

The adapter supplies `id`, a `host` selector, an `app` selector, `model()` and
`set(patch)`. Its model supplies:

- `players`: `{id, name, first, seasons, anchor_uncertain?}`; seasons contain the
  actual numeric `year` and each supported metric. Null remains missing.
- `ids`, current `metric`, and `metrics` with name, digits, units and explanation.
- `settings` hints for supported legacy view/layout/window/height/normalization.
- `dataset` for distinct source/role storage, and `active` for comparison mode.
- `clock`, `source`, `sourceUrl`, `coverage`, `through`, `context(player,row,year)`
  and `small(player,row)`. Optional `available` limits picker matches without
  changing the selection; optional `info` provides player facts/source links.

`set(patch)` updates explicit player/measure/display choices through the sport's
existing state flow. After a preset, source, role or player update, call
`YearTwoCharts.refresh(id)`. A height-only browser resize or season inspection
must not redraw the chart. No observer loops or external chart dependencies are
introduced.

New graph preferences use `year-two-chart-v1:<sport>:<source/role>`. Existing
selection stores and public preset databases remain in place. Interpretation
overlays are browser preferences, not modifications to shared public presets.
Opening a page does not publish or rewrite a public preset. The previous graph
workspace remains accessible with `classic=1`, including specialist nonlinear
scales, research tools and prior editor workflows. This is a compatibility path,
not the default sports graph. An explicit return link removes `classic=1`.

## Verification

`test_year_two_chart_math.cjs` checks time spacing, missing years, constant and
short fits, full-precision calculations, strict moving windows and axis bounds.
`test_year_two_chart_browser.cjs` exercises the identical control contract on
football, both baseball roles, PBA, USBC women, and the compact football page.
It checks all-selected graphs (265 QBs, 2,852 hitters, 3,802 pitchers, 79 PBA
profiles and 343 USBC women's records), panel bounds, overlays, exports, search,
selection recovery, saved settings, blocked storage, 320–1440px widths and mobile
inspection. Missing-data records remain selected and explicitly have no line.

Existing browser tests that inspect the previous graph DOM now enter its
`classic=1` compatibility URL. Preset recovery tests continue to use the normal
routes. Human comprehension and full accessibility conformance are not claimed
by automated checks.
