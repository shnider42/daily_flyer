# The Sleeve Notes

The Sleeve Notes is an isolated Daily Flyer theme for public album stories and a personal vinyl collection. Run
`gunicorn --workers 1 --timeout 90 web:app` and visit `/?theme=vinyl_crossovers`. For a separate Render
service, set `DEFAULT_THEME=vinyl_crossovers` and start with
`gunicorn --workers 1 --timeout 90 --bind 0.0.0.0:$PORT web:app`.
Story discovery makes several spaced catalog requests, so the longer worker
timeout helps during slow external responses. Existing theme routes are unchanged.

The front door accepts just one or two album names. MusicBrainz release-group
search offers distinct album/EP matches with artist and first release year,
so ambiguous names are easy to correct. Opening the story chooses a nearby
vinyl edition and reads album-level musical relationships, recording personnel,
and work-level writer credits. A sparse edition can use credits from one more
edition of the same album; each extra credit retains its own edition source.
The story offers a documented two-album personnel comparison, or trails from
one album's guests to other records dated 1960–1989 when they are cataloged.
It includes a complete expandable map of named people and tracks. A missing
catalog relationship is never presented as evidence that two albums have no
real-world link.

The collector shelf stays behind an optional disclosure. Search by album/EP title and artist; optionally add the physical label's catalog
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
Saving from the public story keeps only credits from its selected edition,
so a supplemental catalog edition cannot be mistaken for the physical pressing.

The collection lives in the current browser's localStorage. JSON export/import
allows moving it to another device. Import merges by release ID and manual ID;
it does not sync between browsers or people. Search and detail endpoints are
`/api/vinyl/albums`, `/api/vinyl/explore`, `/api/vinyl/search` and
`/api/vinyl/release/<MusicBrainz release UUID>`.
The server identifies itself and spaces MusicBrainz requests at least 1.1
seconds apart per process; a multi-worker deployment should use one worker or
a shared rate limiter to remain within MusicBrainz's per-IP limit. Responses
are cached per worker. The UI deliberately makes no price estimates: valuation
requires physical runout/pressing identification and condition, beyond catalog
credits and album titles.
