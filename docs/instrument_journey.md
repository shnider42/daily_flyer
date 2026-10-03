# Garage Journey / Instrument Journey

## Branch and publishing

Target: `shnider42/daily_flyer`, `agent/garage-recovery`.
Base: `aa5b10028059e6710f305b41cb15b13e070c6661` (Garage Journey v17 / Corvette Z06).

The publishing retry found the branch present and unprotected at that base.
Local Git failed with `Could not resolve host: github.com`, but the connected
GitHub tree/commit/ref write actions were available and accepted writes. The
previous bundle's claim that only read actions were available was incorrect.
A branch update must be non-forced and preserve newer remote work.

GitHub publication is separate from Render deployment. No live Render
configuration or deployment is verified by this document.

## Scope

Cars and Guitars are independent modes selected by native links. The v18 car
wrapper prepends a static switch to v17 and adds only switch styling. Existing
car JavaScript, seven vehicle profiles, workshops, storage, renderer and runtime
dependencies are unchanged. The explicit `garage_journey_v17` route remains.

Guitar reference profiles:

- Fender original Player Stratocaster SSS, Mexico, 014450 family.
- Fender American Professional II Stratocaster SSS, with its neck-add map.
- Original-vintage 1959 Gibson Les Paul Standard, not a modern reissue or an
  authenticated user-owned instrument.
- Godin Multiac Nylon Encore Natural SG, SKU 035045, with revision-dependent
  powered dual-source electronics and nylon-specific guidance.
- Squier Sonic Stratocaster HT H: budget, hardtail, one humbucker, no selector.

Each has Overview, Journey, Gig bag and Workbench views. Six model-specific
workshop sections per guitar cover strings, neck, bridge, electronics, output
and fit/care: 30 sections total. Each supplies symptoms, checks, tools, stop
conditions and source links. Maintenance is never fabricated as completed.

Signal maps and SVG illustrations are educational, not dimensioned repair
plans, solder-lug diagrams, audio simulations or verified vintage harnesses.
The catalog distinguishes reference specifications from an owner's actual
serial, modifications and installed parts.

## Sources and images

The catalog contains 19 source records with review date, applicability, source
type and retrieval status from the original research pass. It is not a live
link monitor. Manufacturer references, specialist drawings, inspected examples
and community discussion are labeled separately. Blocked PDFs and unavailable
forums are not presented as verified documents. Exact model applicability
must be checked before using a drawing.

External reference photographs have credit and source links, with original
local illustrations as fallbacks. Credit does not establish a reuse license.
Review reuse/hotlink permissions before public or commercial release and use
owned or properly licensed images where necessary. Browser tests blocked
external photos, so they do not establish current photo availability.

## Storage

Only `dailyflyer.instrument_journey.v1` is used for guitar records. Car keys
are not read, changed or cleared. Notes are browser-local and unencrypted,
not account-synced or automatically uploaded. Other users of the same browser
profile can access them. External images and references make ordinary browser
requests to their hosts.

Export/import transfers JSON backups. Imports require confirmation before
replacement and validate schema, known model IDs, dates, text lengths and
entry counts. Limits: 1 MB import, 500 entries per instrument, 1,500 overall.
Storage denial, quota, corrupt records and cross-tab conflicts have explicit
warnings. Removing a guitar from the rack does not erase its journey.

## Verification and remaining checks

The publishing retry reran the saved bundle: **33 Python checks passed** and
**157 Chromium assertions passed**. JavaScript syntax checking passed too.
The saved patch and its 12 original file hashes were checked before transfer;
this document corrects the bundle's outdated publishing explanation.

These are unit/contract and isolated browser checks. The wrapper unit test
uses a v17-shaped fixture. Browser tests use simulated Storage and abort
external photographs. Checked widths: 320, 375, 390, 768 and 1440 pixels.

Full-repository Flask integration was skipped because Flask is absent in the
runtime. Real Safari/iPhone behavior, actual browser reload persistence, the
full car regression suite, unavailable PDFs, image permissions and live
Render deployment remain unverified.

Run in the normal repository environment before treating the deployment as
validated:

```sh
python -m pytest -q tests/test_instrument_journey.py tests/test_instrument_journey_integration.py
python tools/build_instrument_preview.py
python tools/test_instrument_browser.py --html instrument_journey_preview.html
```

The browser harness additionally needs the optional Playwright development
package and Chromium. Also run existing car tests and manually check domain
switching, back navigation, real persistence, keyboard use and mobile scrolling.

## Routes and rollback

`/?theme=garage`, `garage_journey` and `e46_owner_companion` aliases select v18.
`/?theme=instrument_journey`, `guitars` and `instruments` open the guitar room.
All seven existing car workshop aliases are retained. An explicitly pinned
`DEFAULT_THEME=garage_journey_v17` or v16 stays pinned; it does not gain the
switch automatically. No Render environment settings are changed here.

Use `/?theme=garage_journey_v17` to compare the unchanged car implementation.
After publishing, roll back with `git revert <actual-new-commit>` and a normal
push, not a hard reset or a forced rewrite of branch history.
