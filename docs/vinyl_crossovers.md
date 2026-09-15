# The Sleeve Notes

The Sleeve Notes is an isolated Daily Flyer theme for a personal vinyl collection. Run
`gunicorn web:app` and visit `/?theme=vinyl_crossovers`. For a separate Render
service, set `DEFAULT_THEME=vinyl_crossovers`. Existing theme routes are unchanged.

Search by album/EP title and artist; optionally add the physical label's catalog
number. Results favor vinyl releases and identify editions by MusicBrainz release
ID, date, country, format, label, catalog number and barcode where available.
Selecting an edition reads its album artist, album-level musical relationships,
track artist credits and track-level musician relationships. MusicBrainz credit
data is incomplete for many releases; an absent relationship is never presented
as a negative claim. Add sleeve credits by name, role, optional song and source
link. These entries are explicitly labelled as possible crossovers when matched
to other manually entered credits or to a single same-named catalog artist.
Official crossovers require the same MusicBrainz artist ID on different records
and at least one non-main-artist credit. Sources link to each selected release.

The collection lives in the current browser's localStorage. JSON export/import
allows moving it to another device. Import merges by release ID and manual ID;
it does not sync between browsers or people. Search and detail endpoints are
`/api/vinyl/search` and `/api/vinyl/release/<MusicBrainz release UUID>`.
The server identifies itself and spaces MusicBrainz requests at least 1.1
seconds apart per process; a multi-worker deployment should use one worker or
a shared rate limiter to remain within MusicBrainz's per-IP limit. Responses
are cached per worker. The UI deliberately makes no price estimates: valuation
requires physical runout/pressing identification and condition, beyond catalog
credits and album titles.
