# Breach 0.8.1 — Occasional music

Containment Pulse adds a restrained, original retro-metal cue. Weapons, enemy
warnings, and facility ambience keep priority. The existing Sound switch still
mutes all audio; Occasional music and its own volume slider allow music to be
turned off or reduced without losing gameplay sounds. Preferences remain local
to each device and each co-op listener. Defaults are music on at 45% of the
existing effects master, with substantial silence between cues.

## Placement

- Leave the first 18 seconds of a new mission or checkpoint retry quiet.
- Require at least 2.5 seconds of sustained local pressure: two active, hostile,
  living enemies within 10 tiles and line of sight, or one active guardian.
- Play one pass, with a gentle entry. Never loop the track automatically.
- Fade after five seconds without qualifying pressure, then leave at least
  120 seconds of active play before another cue. Sustained pressure cannot
  continuously retrigger it: a quiet interval is needed to rearm.
- Pause, menus, dialogs, maps, downed players, disconnects, backgrounding, death,
  and victory silence the cue. A stopped passage never resumes mid-track.
- Recovered tapes receive a 12-second reading window. Refuge, transit,
  checkpoint, power, and relay events receive a short quiet window.
- Enemy attack warnings and nearby impacts briefly duck the music so their
  timing remains readable. Distant co-op events do not drive a local soundtrack.

## Browser and performance

Playback shares the existing AudioContext, unlocked by the existing Start or
Resume gesture. There is no autoplay on page load and no extra global audio
context or polling timer. Threat checks run at most four times per second,
discarding distant enemies before line-of-sight tests. The local MP3 is fetched
and decoded once, only after the first eligible encounter; failed requests and
unsupported audio leave gameplay working. Async loading cannot restart a cue
after pause, reset, mute, or the end of an encounter.

Authoring provenance and reproduction instructions are in
[`music/README.md`](../daily_flyer/themes/breach_assets/music/README.md). The
original editable MIDI is included, while the game plays the compact rendering
so phones do not synthesize hundreds of notes during combat.

## Verification

Run `npm run test:breach` and
`python3 -m unittest discover -s tests -p test_breach_export.py`, then
`python3 scripts/build_breach.py`. Music tests exercise cue timing, cooldown,
quiet rearming, pause/mute/downed gates, stale loads, loading failures, and
one-source playback. Audio-context tests cover local threat filtering. Server
tests check MP3/MIDI MIME types, and static export checks local asset inclusion.
Real-device iPhone audio balance and long-session combat pacing still need
playtesting.

The browser check also confirmed real MP3 decoding and single-source playback,
pause cleanup, separate music volume/mute, master mute, and settings persistence.
The [soundtrack palette](breach-soundtrack-plan.md) describes twelve further
composition briefs and their silence rules; these are not enabled audio assets.
