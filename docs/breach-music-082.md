# Breach 0.8.2 — Thirteen Signals

> Placement superseded by [the authored 0.8.4 score](breach-score-084.md).

Twelve newly composed MIDI cues join Containment Pulse. Each includes a
procedural MP3 rendering; all thirteen can be auditioned in `soundtrack.html`,
linked from Settings. That page also presents the seven-chapter
[campaign proposal](breach-campaign.md). The campaign remains a proposal;
this release implements the soundtrack, placement policy and listening room.

## Placement and silence

`music-cues.mjs` is the cue catalog, with a description, intended use and
avoidance note for each piece. Mission pools avoid the last two selections
when possible, relaxing that exclusion only for smaller pools. Underworks
crown sectors have their own pool. A key plus the occupied return-lift zone
can make Exit Load eligible, but actual sustained local pressure is still
required. A safe return cannot trigger it.

The original 18-second opening grace, 2.5-second pressure hold, five-second
combat quiet/rearm rule, one-pass playback and 120-second cooldown remain.
Glasshouse pressure takes ten seconds, and its practice bay stays unscored.
A visible guardian needs twelve seconds of continuous local exposure. Warning,
shield, healing and impact sounds duck the score. Pause, maps, dialogs,
backgrounding, death and results interrupt it; retries preserve the cooldown.

Four sparse cues have explicit optional windows:

| Cue | Occupied space | Additional condition |
|---|---|---|
| Dead Carrier | Dead Relay communications vault | Quiet inspection |
| Spare Air | Underworks central exchange | An earlier qualifying local encounter |
| Below the Carrier | Hollow listening gallery | Quiet inspection |
| The Room Replies | Hollow cold archive | Listening gallery previously visited locally |

Each window requires twelve seconds of zero local pressure and time in the
space, expires after twenty-six seconds, and is offered once per run.
Combat, leaving, blocking UI, mute or an already-active cooldown can consume
the opportunity; it is never queued for a later doorway crossing. A pending
ambient load or active cue is cancelled on even one local hostile or leaving
its space. A recovered record suppresses playback for twelve seconds;
visible dialogs remain a hard gate. Hollow's pair leave 180 seconds after a
cue or interruption. Other music cannot bypass that longer shared gap.

## Loading and authoring

One existing unlocked AudioContext, one musical source, no preload on game
arrival, and at most two decoded cue buffers. Music selection is client-local
and does not alter authoritative gameplay or co-op state. Fetch/decode failure
leaves the game running. Stale async work cannot revive a missed encounter.

The listening room uses one native audio element, no automatic next track,
explicit MIDI links, and pauses when hidden. It has no gameplay save access.
Total new compressed assets are about eight megabytes; only an eligible cue
or explicit audition is downloaded. See the source
[provenance and regeneration notes](../daily_flyer/themes/breach_assets/music/README.md).

These are complete short compositional sketches, not a final live-instrument
mix or a guarantee of copyright clearance. Mobile balance and long-session
pacing need listening/playtesting. The code's silence gates are upper bounds
on use, not evidence that every cue placement is artistically final.

## Verification

- `npm run test:breach`: existing gameplay/co-op tests plus cue selection,
  real map-zone eligibility, guardian exposure, ambient windows, stale loads,
  shared cooldown, recent-repeat avoidance and bounded decoded storage.
- `python3 -m unittest discover -s tests -p test_breach_export.py`: static
  export, local dependencies, audio files and listening-room inclusion.
- Re-render/validate the twelve scores, decode every MP3, inspect PCM levels
  and MIDI note pairing, then exercise listening-room playback in a browser.

Release verification: 270 JavaScript tests and three export tests passed. All
thirteen MIDI files have balanced non-overlapping notes; all twelve new MP3s
decode cleanly. Browser checks covered contrasting cues, stopping playback,
and the listening-room layout at desktop and 390-pixel frame widths.
