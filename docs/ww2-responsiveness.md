# Selection and movement responsiveness

This release is limited to input feedback and reducing existing work. It does
not change movement costs, combat rules, fog, random rolls, maps or preferences.

## Changes

- Reconcile visible counters by ID and content. Switching platoons or receiving
  an otherwise unchanged snapshot retains unit pictures instead of rebuilding
  every counter. Counters no longer in the public view are removed immediately.
- Reconcile fog tiles and retain unchanged Fubar layer/objective decorations.
- Avoid forced layout reads during mobile selection, repeated visibility
  attribute writes, and redundant icon sizing. Breakpoint-dependent order-grid
  sizes update on resize, not in the middle of a map redraw.
- Build terrain visibility from nearby observer footprints, reused for army and
  platoon views inside one unchanged-state read scope. The original sight
  predicate still handles smoke, towers, air/surface differences and blockers.
  Enemy concealment/identity checks are unchanged. No cache crosses an order,
  request, player or state mutation.
- A legal movement tap immediately shows the counter provisionally at its
  destination, with a translucent/dashed treatment and a “Moving…” status.
  The original location is marked until confirmation. This is presentation only:
  position, AP, fog, contacts, legal actions and dice remain server-authoritative.
- A failed request clears the preview and uses the existing state refresh to
  reconcile the battle. There is no automatic POST retry and repeated taps while
  busy cannot submit another move. Reaction fire or a hidden blocker may still
  make the authoritative result differ from the requested destination.

## Local measurements

`tests/ww2-input-latency-browser.cjs` uses a 390×844 touch viewport, 4× Chromium
CPU throttling and repeated selections across several unit roles. It discards
four warm-up selections. The baseline asset set is release `484731b`.

Representative medians (milliseconds):

| Map | Selection JS before | Selection JS after | Two-frame sample before | Two-frame sample after |
| --- | ---: | ---: | ---: | ---: |
| Village Crossing | 11.7 | 7.6 | 33.4 | 33.2 |
| Midway | 14.9 | 9.3 | 57.3 | 50.5 |
| Tidal Gate | 27.8 | 16.2 | 132.7 | 118.7 |
| Fubar | 73.5 | 32.1 | 171.5 | 130.1 |

The two-frame sample includes frame scheduling and rendering work, not a
physical screen-presentation measurement. It deliberately does not equate
short JavaScript time with instantaneous visual response. Large SVG paint costs
remain, especially on Tidal Gate. Local unthrottled Fubar move confirmation was
about 375 ms before the server change and 162–193 ms afterward in sampled runs;
network and Render load are additional and are not measured here. Pending move
feedback does not wait for that round trip. These are development comparisons,
not promised iPhone timings or production latency guarantees.

## Verification

- `python -m unittest discover -s tests -p 'test_ww2*.py'`
- `node tests/ww2-move-feedback-browser.cjs`: physical touch/mouse input on Midway
  and Fubar, deliberately held replies, unchanged state during preview, stable
  camera, retained counters/art and exact public fog, one POST, successful moves,
  409 rejection, lost-after-commit reply and a synthetic stopped/destroyed-unit
  response that overrides the preview.
- Existing Midway selection, Fubar, Experience and map-performance browser tests:
  legal highlights, persistent terrain, real moves, layer picking, pinch/pan,
  layout changes, preferences, effects cleanup and resume.
- Sight equivalence tests compare both sides and platoons against full-board
  scans, including towers, smoke, recon, observation, passengers, casualties,
  air/surface layers and concurrent request isolation.

Set `CHROMIUM_EXECUTABLE_PATH` for the local browser. Run the input benchmark
with `WW2_BASELINE_REF=484731be8f1ed12157c6c58239de01c30b5fe7ed` for old **client**
assets; this option does not revert the Python server. The harness writes raw
samples and CPU profiles to its printed temporary directory. Avoid concurrent
test loads when comparing timings. `WW2_CPU_RATE` and `WW2_LATENCY_MAPS` are
optional controls.

The unrelated Daily Flyer theme test requires `bs4`, which is not installed in
this runtime; unrestricted test discovery reports that import failure. The
DSL-specific command above isolates the applicable suite.

## Release check

After Render deploys the commit, reopen the site and test several successive
unit selections and moves on the actual iPhone, particularly Midway and Fubar.
Confirm that the provisional counter responds at once, then resolves normally;
there should be no page jump or duplicate move. A Git push alone does not verify
the Render deployment or a physical iPhone's performance.
