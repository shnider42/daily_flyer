# Breach soundtrack palette

> Update: all twelve briefs are now composed and included in 0.8.2. See the
> [implemented placement policy](breach-music-082.md), the in-game listening
> room, and the [campaign proposal](breach-campaign.md). The text below records
> the original composition brief and planned authoring order.

Design plan: twelve additional original pieces, alongside **Containment Pulse**
(104 BPM). These are composition briefs, not completed recordings or enabled
game cues. The current release adds only Containment Pulse and its restrained
playback rules; this document does not expand the live track list.

The shared language is heavy, spacious early-1990s metal rendered with a retro
MIDI palette: firm bass, dry guitar attacks, economical melodies, and weighty
drums. The pieces should differ in rhythm, phrase length, register, harmony, and
instrument balance. A different key or a faster version of the same riff does
not count as a new identity. No song transcription, familiar riff adaptation,
recording samples, or imitated voice belongs in these briefs.

## Twelve additional tracks

Tempo is quarter-note BPM unless a different pulse is stated. Each piece should
have a complete short ending and a clean early exit, rather than depend on an
endless loop. Durations below are authoring targets, not mandatory play times.

| Track / distinct musical idea | Pulse / length | When and where it could be used | When to leave it out |
| --- | --- | --- | --- |
| **Iron Wake** — broad low-register power chords, bass leading the phrase, a descending three-note answer; straight drums with large rests | 92 BPM; 24–32 s | A later, sustained Blacksite 07 fight, after the player has learned the basic sounds | First arrival, tutorial prompts, first enemy encounter, or routine cleanup of one straggler |
| **Dry Contact** — clipped upper-mid guitar dyads against a busier picked bass; short accents shift across a three-bar phrase | 118 BPM; 24–30 s | Crosslink's closer, mobile two-operator fights; an alternative compact-combat cue on other maps | A distant teammate's battle, waiting for a partner, a downed listener, or a shared pause |
| **Dead Carrier** — sparse low bass, clean guitar harmonics, and a slow rolling drum figure; an unresolved rising minor-third motif | 76 BPM, 6/8; 25–35 s | One authored Dead Relay communications-room discovery, after the room has been entered and inspected | Before a hidden room is found, during relay instructions, or whenever radio/facility sound needs to carry meaning |
| **Crown Circuit** — dry chugging guitar under a second guitar's widely spaced sustained notes; a five-note contour rather than a repeated bass-root hook | 126 BPM; 28–36 s | Sustained pressure in the Underworks crown sectors; a later escalation after the ordinary cue has had room to rest | Traversal back through cleared corridors, map reading, upgrade explanations, or using transit |
| **Counterweight** — stop/start midrange riff, floor-tom emphasis, and a bass line moving against held guitar notes | 98 BPM; 24–32 s | A committed Switchyard freight-yard battle once the player is already under attack | Operating routing cabinets, reading circuit numbers, testing a shutter, or hearing an approaching threat for the first time |
| **Glass Teeth** — brittle, high-register guitar intervals over a restrained low pedal; tight snare and short cymbal accents | 112 BPM; 24–30 s | An established Glasshouse bulwark encounter, after shield behavior has been demonstrated | First shield demonstration, shield opening/closing tells, grenade-fuse learning, or the ballistics practice bay |
| **Root Pressure** — bass-heavy, slower groove with long guitar bends and a narrow four-note melody; fewer cymbals and more empty beats | 86 BPM; 28–36 s | A prolonged Glasshouse mixed-enemy fight; a contrasting option to Glass Teeth | A single healer channeling, the first healing cue, plant-gallery exploration, or a battle already carrying another cue |
| **Weight of Stone** — long low chords, widely separated kick/snare hits, and an upper sustained line; almost no rapid chugging | 68 BPM; 25–35 s | One late guardian passage after the guardian is active, visible, and its basic warnings are familiar | Guardian reveal, first attack cycle, phase-change telegraphs, or restarting the same boss immediately after death |
| **Below the Carrier** — no kit, no riff; low synthetic swells, isolated clean-guitar notes, and slow dissonance that never resolves into a chorus | Free time; 15–25 s | A single optional Hollow listening-space reveal, after a deliberate silent approach and after the place is actually seen | Tape playback/reading, journals, stalking pursuit, enemy-location discovery, or every dark corridor |
| **The Room Replies** — sparse muted guitar dyads answering a very low sustained tone; no cymbals, no footsteps, no speech-like sound | Loose 54 BPM; 18–24 s | A later Hollow story beat with no active fight, clearly separated from Below the Carrier | Before an Echo arrives, as a warning that a hidden stalker exists, during containment instructions, or while a tape's text is visible |
| **Spare Air** — clean low guitar, rounded bass, and a restrained two-note upward answer; no distorted rhythm guitar and no full drum kit | 82 BPM; 12–18 s | At most one broad Underworks vista or cleared-room reveal after a difficult stretch, then return to environmental sound | Every refuge, every checkpoint, active healing/regrouping, co-op conversation, or simply because the cooldown expired |
| **Exit Load** — an urgent low riff broken by higher open-chord answers; bass changes first and the drums follow, with a short descending ending | 116 BPM; 24–32 s | An actual final return under local enemy pressure in Underworks, Switchyard, Glasshouse, or Hollow | A safe walk to the lift, merely acquiring a key, extraction instructions, the results screen, or to announce an unseen final encounter |

These are roles rather than twelve map assignments. Iron Wake and Dry Contact
can share a combat pool across maps, for example; a mission does not need its
own continuous theme. A track's melodic and rhythmic identity must survive a
plain piano/bass mockup before its guitar patch is chosen.

## Silence is an authored choice

Environmental sound is the default score: footsteps, machinery, doors, gunfire,
and enemy warnings establish the facility. An empty music slot is not a missing
asset. During traversal, a useful initial playtest target is roughly 80–90% of
time without non-diegetic music. That is an editorial target, not a timer that
forces a cue when the player has been quiet for too long.

- **Arrival and learning:** leave the opening, first-use controls, and first
  encounter with each enemy mechanic unscored. The player needs an audio
  vocabulary before the soundtrack competes with it.
- **Horror:** allow a long silent approach and a silent aftermath. Do not make
  a bass swell predict a hidden enemy, or turn every harmless room into a
  false jump-scare setup. A Hollow story cue is an authored exception.
- **Reading and planning:** tapes, their visible text, journals, maps, settings,
  and pause screens take priority over music. A fixed reading window is only
  a fallback; a future persistent text panel should suppress music until closed.
- **Regrouping:** refuges and transit normally mean breathing room. Do not
  reward each station or switch with a sting. Let teammates hear and talk.
- **Combat tells:** duck or cut music for attack warnings and important
  equipment sounds. Avoid lead phrases that resemble alarm or enemy pitches.
- **Death and retry:** no punitive sad theme, and no immediate repeat of the
  same boss introduction. Keep the results screen quiet by default. One clear
  extraction sound is enough; completing an ordinary objective needs no anthem.

## Placement rules for a future larger pool

1. **A gameplay event grants eligibility, not a command to play.** It must still
   pass the current silence gates and be relevant to the local listener. The
   absence of a cue must never imply that a corridor is safe.
2. **Use one musical source at a time.** Combat, reveal, and relief cues cannot
   stack. Cancel a pending load if its moment passes. Never backfill missed
   music after a menu closes or a connection recovers.
3. **Keep long gaps and avoid recent repeats.** Start with at least two minutes
   of active play between cues, extend the gap after horror cues, and exclude
   the last two eligible tracks when the pool permits. Do not bypass the gap
   by switching track families, opening a map, or changing rooms.
4. **Put story reveals on a once-per-run budget.** Do not replay them every time
   a doorway is crossed. Reserve the sparse Hollow pair for separate beats;
   many runs may use neither.
5. **Let intensity have an ending.** A finished cue yields to silence even when
   combat continues. The next attack is not permission to restart it. A quiet
   interval must rearm ordinary combat selection.
6. **Keep co-op music personal.** Use local threats and local discovered story
   state. A partner's remote enemy, death, or cabinet use must not leak through
   the score. Local volume and mute preferences stay local; no soundtrack
   synchronization belongs in the authoritative simulation.

## Authoring order

Compose **Counterweight**, **Below the Carrier**, and **Spare Air** next. They
test three different jobs—heavy combat, sparse horror, and brief relief—instead
of adding three near-identical battle loops. Audition each against actual
weapon/enemy audio at a modest level, on phone speakers as well as headphones.
Compare a scored run with a silent one before assigning any new trigger.

Only expand the pool after those roles work. Current Containment Pulse rules
remain the baseline: 18-second opening grace, 2.5 seconds of qualifying local
pressure, one pass, five seconds of quiet to exit/rearm, and a 120-second
cooldown after playback or interruption. The planned reveal and relief cues
need explicit, discoverable story hooks and listening tests; they are not
enabled by this release.
