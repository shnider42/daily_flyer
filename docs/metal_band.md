# First Riff — metal band starter

First Riff is the `metal_band` Daily Flyer theme. It provides a useful starting
workspace for a new band without changing the existing Garage Journey themes,
route aliases, default theme, renderer, or dependencies.

## Run

On a deployment of this branch, open `/?theme=metal_band` (hyphens work too).
To make a dedicated Render service open this theme by default, deploy this branch
with the existing build command `pip install -r requirements.txt`, start command
`gunicorn web:app`, and environment variable `DEFAULT_THEME=metal_band`.
Changing the default on the existing Garage service would change its homepage;
use the query parameter or a separate service for a separate band deployment.

Local web preview:

```sh
python -m flask --app web run
# Open http://127.0.0.1:5000/?theme=metal_band
```

Portable workspace export through DFE's existing CLI:

```sh
python app.py --theme metal_band --outfile metal_band.html
```

## Included

- An eight-step starter checklist and a first-rehearsal agenda.
- Editable band identity, short bio, booking email, and member lineup.
- Songs with duration, BPM, tuning, progress, recording links, and rehearsal notes.
- An ordered setlist with opt-in songs, configurable gaps **between** songs,
  calculated duration, and a downloadable text setlist.
- Possible and confirmed shows with dates, local venue time, links, and notes.
- A sandboxed public-page preview and a standalone HTML band-page download.
- Validated JSON workspace import/export, plus recovery when saved data is corrupt.

## What is saved and shared

The workspace uses the stable localStorage key `dfe.metal_band.workspace.v1`.
It survives page reloads and redeploys on the same origin while browser storage
is retained. It is one workspace per browser/origin: no account, server database,
automatic device sync, or automatic public publishing. Save buttons commit form
edits; checklist, set order, and setlist toggles save immediately.

Export a workspace backup to move browsers/devices or domains. The JSON backup
includes private notes. Import validates its schema and size before asking to
replace the current workspace. There is no hidden demo band or fabricated gig.
Storage errors are shown visibly; in-memory editing remains available, with backup
export. A concurrent tab change blocks further overwrites until reload/import.
Storage is intended for planning notes, not secrets.

The downloaded band page includes band details, the lineup, songs explicitly
marked for publication, and confirmed shows on or after the current local date.
It excludes rehearsal notes, planning notes, unselected songs, checklist state,
possible shows, and past shows. The HTML has no app script or saved workspace.
Recording URLs link to external media; First Riff does not upload/host audio.

The downloaded band page is a snapshot. Host that HTML file to give it a public
web address. Download and replace it after changing content or when show dates
pass. No messages, emails, bookings, or ticket sales are sent by this theme.

## Implementation and checks

`daily_flyer/themes/metal_band.py` implements the existing custom-theme contract.
Its three sibling assets are read into DFE's existing inline HTML/CSS/JS fields,
so web and CLI output contain the same application. No renderer changes,
MutationObservers, inherited Garage JavaScript, or network content fetching.

The workspace validates required fields, URL protocols, dates, numeric limits,
duplicate IDs, version and collection sizes. Public content is HTML-escaped;
external links use `noopener noreferrer`. Backups are capped at 1 MB with at most
200 entries per collection, and invalid imports leave the current state intact.

Run Python integration checks with:

```sh
python -m unittest discover -s tests -p 'test_metal_band_theme.py' -v
```

The browser smoke test requires Playwright and a Chromium installation, and a
local Flask server on port 5055 (override with `METAL_BAND_TEST_URL`):

```sh
node tests/metal_band_browser.cjs
```

It exercises editing, set timing/order, persistence, backup restoration, invalid
imports, public/private separation, mobile overflow, and storage failure. No
test data or built HTML is committed.

Verified on 2026-09-30: all three theme integration tests, all four existing Z06
recovery regression tests, and the Chromium browser smoke test passed. Desktop
and mobile screenshots were inspected; all five screens were checked for
horizontal overflow at 390px and 320px. Native iOS Safari was not tested.
