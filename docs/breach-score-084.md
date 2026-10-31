# Breach 0.8.4 — music belongs to a place

The enemy-pressure playlist has been replaced by fixed menu, opening and
section assignments. The thirteen original compositions and their MIDI
sources are unchanged. This release changes their dramatic placement.

| Place | Opening | Later sections |
| --- | --- | --- |
| Main menu | Containment Pulse, at a quieter mix after a tap | One pass; explicit stop/replay |
| Blacksite 07 | Iron Wake | Containment Pulse in Research laboratory |
| Dead Relay | Silence | Dead Carrier in Communications vault |
| Crosslink | Dry Contact | Containment Pulse in Crosslink vault |
| Underworks | Spare Air | Root Pressure in foundry; Crown Circuit at rail crowns; Dead Carrier in archives; Weight of Stone at reactor guardian |
| Switchyard | Counterweight | Crown Circuit in cables; Weight of Stone at engine guardian |
| Glasshouse | Silence | Root Pressure in powered atrium; Glass Teeth in the first cultivation wing visited; Weight of Stone at chamber guardian |
| Hollow | Silence | Below the Carrier in listening gallery; The Room Replies in archive after listening gallery; Weight of Stone at Choir Keeper |

Exit Load has one special assignment: local resistance on the keyed return
to the arrival lift/dock in Underworks, Switchyard, Glasshouse or Hollow.
The key alone cannot trigger it, and a safe return stays quiet.

## Playback rules

- Browsers require interaction before audio. The menu has a visible Play menu
  theme control; other menu buttons can activate it too. Starting a mission
  goes directly to that mission's score. No menu auto-loop or album shuffle.
- Fresh scored missions enter after 1.5 seconds, without needing an enemy.
  Continue, checkpoint retries and late co-op joins do not replay the opening.
- Sections normally require two seconds inside their authored zone. Guardian
  passages require eight continuous seconds of local visible exposure (twelve
  in Hollow). Enemy counts qualify these exceptions; they never select a track.
- A normal passage completes its written phrase through ordinary movement or
  changes in enemy count. Explicit quiet sectors fade it out. Hollow textures
  also yield to danger or leaving their room.
- Each section is used at most once per run. Both Glasshouse cultivation wings
  share a slot. A section reached during another cue or its quiet interval is
  skipped, never queued. Brief doorway visits, slow downloads and expired entry
  moments cannot produce late surprises.
- Leave at least 25 active-play seconds after a mission cue; Hollow passages
  leave 60. These are minimum gaps, not timers that start another cue. Cues
  remain short single passes, capped at 40 seconds.
- Maps, pause, backgrounding, death and dialogs stop music. Records and relief
  events interrupt it; nearby attack warnings duck it. Refuges, instructional
  sectors, relay work, quiet returns and results retain silence.
- Played section state is saved with solo runs and retained across checkpoint
  retries. An older save suppresses the introduction. Music stays client-local
  in co-op. Muting a moment consumes it instead of deferring it until unmute.
- Native fetch remains bound to the browser global. The shared decoder keeps
  at most two buffers. Stale loads may cache data but cannot authorize playback.
  Settings' eight-second test continues to use the actual game audio output.

## Validation

Music tests cover fixed assignments against actual map zones, entry timing,
intentional silence, no track changes on enemy counts, guardian exposure,
quiet textures, menu activation and transitions, mute/pause/background/death,
stale decoding, failed loads, native fetch binding, save/retry behavior and
bounded decoding. Validation passed: 272 JavaScript tests and three export
tests. A real browser AudioContext played the menu and opening with a
nonzero output signal, kept Hollow arrival silent, then played the listening
gallery texture with one source and complete cleanup. A 390-pixel layout
check confirmed the menu control is visible and works. Physical iPhone/Safari
listening remains a device check; the browser QA used Chromium.

The campaign remains a proposal. This update does not move pickups or add
persistent chapter progress. The next design pass is recorded in
[weapon discovery and progression](breach-weapon-progression-plan.md).
