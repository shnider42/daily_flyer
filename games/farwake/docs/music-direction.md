# Farwake: music direction and adaptive score

## Identity

Farwake's score should make a small personal journey feel worth taking in a very large universe. Its center is curiosity, warmth, and the possibility of finding a life somewhere. Danger is part of that life. Horror is an exceptional interruption.

The exploration reference is musical patience: recognizable short pieces arrive, develop, and leave room for the world. The title theme uses the spacious phrasing of 1970s progressive and psychedelic rock: warm electric piano, a sustained melodic guitar voice, independently moving bass, gentle organ, restrained drums, and echo. The melodies and arrangements in this repository are original compositions. They do not sample recordings or quote the reference artists' songs.

“The Long Way Home” is the main theme. Its opening rising fifth and descending answer return in changing arrangements; the middle passage offers a brighter harmonic departure before the original phrase comes home. The complete statement is about three minutes and seventeen seconds, followed by its tail. It is a composition with a beginning, development, return, and ending, rather than an endlessly regenerated pad.

The current catalog contains **46 original instrumental pieces**, performed by the game's local synthesizer. A recorded or studio-produced performance can replace its renderer later without changing the musical director or gameplay hooks. A recognizable theme can be composed now; whether it becomes memorable to players needs actual listening and repeated play.

## Crosswind battle rotation · 0.26.1

Crosswind has an explicit battle-score profile for every captain actually in the system, including neutral arrivals, crew members, and ground visits. It replaces a peaceful or generic combat cue on the first music update, with a 0.35-second departing fade and a 0.9-second incoming fade. The profile stays active through tactical lulls and location changes within Crosswind. It does not fabricate pursuit, incoming fire, or personal combat evidence in the simulation.

| Original piece | Tempo | Written length | Arrangement |
| --- | ---: | ---: | --- |
| Kill Corridor | 178 BPM | 129.4 s | Fast thrash picking, chromatic pedal riffs, double-kick passages, a stopped breakdown and a returning lead hook. |
| Iron Teeth | 142 BPM | 135.2 s | Low syncopated accents, a half-time middle, tom-driven passages and a higher melodic response. |
| Ashes in Orbit | 166 BPM | 138.8 s | Galloping rhythm, a melodic-metal hook, written twin-lead responses, a breakdown and short solo sections. |

The requested influences are Slayer's fast thrash energy, Slipknot's heavy syncopated groove, and early Avenged Sevenfold's melodic metalcore. The score uses those broad traits in new riffs, melodies and arrangements. It includes no copied songs, lyrics, artist recordings or imitated vocals. Every track starts with guitar, bass, drums and a lead gesture within its first second.

Eight dedicated generated voices—muted rhythm guitar, lead guitar, bass, kick, snare, hat, crash and tom—use the existing shared instrument bank. Guitar samples add saturated harmonics and cabinet filtering, with short rhythm releases so rapid picking stays articulate. The tracks use a short, dry room and restrained echo. The prior 43 written compositions and their sampled instrument bytes remain unchanged.

Automatic selection uses a three-item shuffled bag. Every piece plays once per bag, and the first item of a refill cannot repeat the previous piece. Listening sessions receive a fresh local seed; history is bounded and never sent to the shared server. A manually requested Crosswind piece consumes its pending bag entry, so it cannot immediately repeat when the audition ends. These tracks do not enter ordinary combat selection outside Crosswind.

The listening panel has a **Crosswind warzone** category. Its three pieces can be requested within the warzone. Peaceful audition requests wait until departure, with that condition stated in the panel. Leaving the system restores ordinary recovery and travel rules. Music off, volume, dialogue ducking, hidden-tab suspension and explicitly authored silence still work. More quiet continues to adjust peaceful gaps; it does not turn the ongoing Crosswind rotation back into exploration music.

Focused coverage is in `music-crosswind.test.mjs`, `music-warzone-score.test.mjs`, and the existing music director, audio, score, instrument and library checks. The new arrangements peak at 17, 14 and 15 scheduled voices respectively, including the 180 ms lookahead and release tails, below the existing 20-voice limit per player.

## Music for the voyage · 0.24.0

This release changes the performance and context of the score while preserving the exact written main theme. Its notes, harmony, tempo, phrasing and form remain intact. The keyboard and string instruments now have separate soft and stronger articulations selected by note velocity, giving an accented note a different tone as well as a different level. Softer felt piano, warm mallets, a breathy reed and a rounded analog lead extend the palette. Sustained voices use restrained movement; keyboard, mallet and bass sample preparation uses modal recurrences to avoid repeating expensive trigonometric work for every partial of every sample.

The room treatment belongs to the piece. Cabins, machinery, nightlife and combat use a short room response with their own reverb, echo, brightness and stereo width. Caves, flight and the title theme retain a more spacious response. The six new pieces have individual trims after compression to bring their levels near the existing calm, social and combat catalog while preserving quieter recovery and outdoor passages. Effects and warning sounds use their separate bus.

| New piece | Situation and character | Written length |
| --- | --- | ---: |
| Lamps in the Cabin | A small felt-piano song with a reed answer for quiet time on a crew deck, away from the helm | 80 s |
| Under the Service Lights | Uneven low mallets, a spacious middle and a returning phrase for field work | 69 s |
| The Foreman Cycle | The service-site motif becomes a compact analog question over a dry rhythm in the active machine bay | 53 s |
| Carry the Light | A patient reed and piano answer for relief after rescue or shutdown | 53 s |
| After Hours on Glimmer | Mallets, moving bass and a restrained groove around Voltage's nearby nightlife venues | 65 s |
| Rain on the Transit Line | Falling felt-piano phrases and distant rhythm on Glimmer's streets | 82 s |

These are complete compositions with openings, developments, returns and codas. Foreman's musical rhythm does not synchronize with, or replace, the machine's warning lane and recovery-window information.

Place selection uses the listener's actual scene. Cabin music belongs to a captain walking aboard a ship rather than operating its helm. Nightlife music requires a nearby venue; the whole Voltage system does not inherit it. Foreman danger requires a conscious captain inside the active machine bay. Another captain activating the machine while the listener remains in the workshop or archive does not reveal that encounter through the score. A local action that opens a route can earn discovery; a stopped Foreman, a qualifying personal handover or a nearby survivor reaching safety can earn recovery. Repeated inspections and activity elsewhere do not repeatedly restart these transitions. Ongoing danger retains priority.

**Settings → Music & listening** presents the full catalog by situation, with titles, durations, brief descriptions and a current/queued status. Selecting **Listen** requests one piece; afterward, the voyage selects music again. Real combat, tension and rare revealed terror take priority over auditions. A requested piece waits for those conditions to settle, and an audition interrupted by danger is queued again. **Return to voyage music** cancels the audition or its queue. Opening the panel and changing its filters do not start playback.

The release leaves Hearth, world geography, gameplay state formats and shared passports unchanged. It does not add a runtime music service, streamed soundtrack or audio analytics.

## Musical situations

| Situation | Musical treatment |
| --- | --- |
| Title and an explicitly requested listen | Full main theme, with a melody early in the piece. It does not restart each time a menu opens. |
| Ordinary flight | The original intimate piano, electronic movement, and lyrical plucked/guitar pieces. |
| Crosswind, from arrival until departure | Three heavy battle tracks in a shuffled rotation, including neutral flight, crew decks and ground visits. The score responds to the authored warzone without inventing a personal attack. |
| Quiet time on a crew deck | Lamps in the Cabin adds felt piano and a reed answer away from the helm. Real occupied-ship danger still takes priority. |
| Planetary terrain | Ten additional pieces matched to actual terrain and homeworld culture. World identity is part of the palette, so two bodies in one system do not share a compulsory selection. |
| Cave exploration | Five sparse pieces with stone-like mallets, piano, bowed tones, and long breaths. Entering a cave alone never implies a hidden monster. |
| Ports and places where people live | More rhythmic, companionable pieces. Garden and market palettes permit gentle whimsy. Empty terrain does not inherit this merely because a planet has inhabitants. |
| Glimmer's streets and nearby Voltage nightlife | Rain on the Transit Line belongs to the streets; After Hours on Glimmer belongs near an actual nightlife venue. |
| Field expeditions | Under the Service Lights accompanies the working site. The Foreman Cycle responds to an active encounter inside the listener's machine bay; local progress and nearby rescue can lead to discovery or recovery. |
| A discovery that has actually been presented | A brief sense of possibility. It must not announce hidden content. |
| A visible threat or a warning the captain has received | Restrained tension. A dangerous entity elsewhere in the simulation does not qualify. |
| Targeted fire, confirmed outgoing ship hits, active pursuit, boarding, or a real occupied-ship emergency | Quick removal of peaceful scoring, then stronger rhythm and weight. Ten new danger pieces add escape rhythms, heavy-ship weight, infantry movement, and pressured retreat. Repeated impacts extend the situation without repeatedly restarting the track. |
| After danger | A recovery passage and then a quiet interval. Cheerful port music should not immediately follow a firefight. |
| Rare authored terror | A short, sparse disturbance after a specific reveal. Darkness, low health, a cave, or a derelict alone do not qualify. |

Musical silence does not disable footsteps, hull sounds, machinery, local ambience, alarms, or combat effects. Reading dialogue or overhearing a conversation lowers the score rather than removing the identity of the place.

## Timing defaults

Peaceful pieces normally run to their endings. A genuine change to a cave, planetary surface, a different planetary identity, or a specific place such as a cabin, field site or nightlife venue can request a gentle crossfade after six seconds. Returning across the threshold before that deadline cancels the request. The deadline survives a natural cue ending; an ordinary quiet interval cannot postpone the arrival for minutes. Small movements and dialogue do not restart a matching piece. Above-ground social scenes remain companionable; caves retain their own environmental family. Danger and recovery have priority over either location.

The three presence settings vary the space between peaceful pieces:

- **More quiet:** roughly 80–155 seconds.
- **Balanced:** roughly 38–90 seconds.
- **More music:** roughly 10–30 seconds.

Track-specific repeat cooldowns can extend these gaps. There is no promise that a fixed percentage of every session will be silent: the result depends on cue length, dialogue, danger, and travel.

An observed attack holds urgency for fourteen seconds after the last evidence. Tension holds for nine seconds. These holds prevent the music from flickering between calm and danger as a target briefly leaves view. Emergency, actual pursuit, and active boarding states persist while the actual situation persists. A completed danger piece can be followed by another while danger continues, even with More quiet selected or every applicable danger piece on cooldown. The score does not require the player to take damage: an explicitly targeted hostile volley or a dodged infantry shot already establishes danger.

Terror is capped at twenty seconds per treatment, once per observed reveal in the current session, with at least twenty minutes between distinct treatments and no more than three in an hour. Authored connections include a record the player has actually inspected in one rare site and a locally visible Bellwether reveal; a different captain revealing the concealed creature does not reveal it through this listener’s music. This is not a general spooky-location detector.

## Architecture

| Module | Responsibility |
| --- | --- |
| `music-score.mjs` | Combined 46-piece manifest, the original twelve compositions, composer helpers and `ScorePlayer` transport |
| `music-danger.mjs` | Ten written pressure pieces |
| `music-environments.mjs` | Five cave and ten planetary pieces |
| `music-places.mjs` | Six pieces for ship life, field expeditions and Voltage |
| `music-warzone.mjs` | Three written heavy battle pieces for Crosswind |
| `music-instruments.mjs` | Shared instrument bank, sample and wave generation, bounded sample cache, room profiles and cue trims |
| `music-context.mjs` | Read-only interpretation of the listener's scene and observed events |
| `music-director.mjs` | Selection, priority, arrival transitions, recovery, quiet intervals and audition requests |
| `music-library-ui.mjs` | Session-only catalog browsing, explicit listening controls and music preferences |
| `audio.mjs` / `app.mjs` | Audio buses, transport lifecycle and the local gameplay connection |

Composition builders receive the shared composer and harmony table and use the same renderer. Each cue provides a family, duration, tags and repeat cooldown. Variation changes articulation, timing, placement and selection; the written melodies remain recognizable.

`music-context.mjs` is a read-only adapter. It converts actual simulation state and scoped events into musical meaning. It follows the vessel the captain currently occupies, including hired and shared ships. Damage to the captain's parked personal ship does not become danger music while that captain is elsewhere. A visible but unengaged target means tension; explicit targeted fire, a visible engaged ground attacker, actual pursuit of the occupied hull, and confirmed damage mean combat. Enemy volleys and projectiles carry target hull identity, and outgoing impacts carry firing hull identity. These distinguish guests from a ship’s owner and from an owner ashore. Interior-only shared snapshots carry only current pursuit/incoming facts for their occupied hull; they do not expose full exterior actors or upcoming encounter rolls. Ground shots retain their intended recipient when the actual bullet misses. Real Game and Realm tests cover those boundaries, including shield-only hits, solo Navy gunnery, shared interior views, and dodged rifle shots.

`music-director.mjs` chooses when a cue belongs. It owns priority, recovery, quiet intervals, a bounded recent-cue history, repeat cooldowns, and stable regional selection. It does not synthesize sound, inspect enemies, or change gameplay.

`audio.mjs` connects the director and transport to the existing effects system. Music and effects use independent buses. At most two complete score players exist during a fade, with at most twenty live note voices per player; the departing player is released. Notes use the audio clock. Scene selection is sampled at a lower rate than note scheduling, so a larger galaxy does not require scoring every object every frame.

The instrument bank is shared by players within one AudioContext. Its sample cache is bounded to **48 entries and 20 MiB**, evicting the least recently used entries as necessary. These are cache limits, not a promise about total audio memory: room impulses, audio nodes and buffers still referenced by active notes have their own lifetime. New pieces reuse that bank rather than allocating a separate collection of samples for each score.

`app.mjs` supplies the local context, forwards freshly drained relevant events, and ticks the music transport even while the title or a menu is visible. A requested listen can wait for immediate danger to settle without changing the gameplay state.

## Historical expansion catalog · 0.15.0

Version 0.15.0 added 25 pieces, bringing the catalog to **37 at that release**. Six additions in 0.24.0 brought it to 43, and the three Crosswind pieces in 0.26.1 bring the current total to 46. The full main-theme event sequence remains preserved. Durations below describe the written pieces; the renderer allows a short release tail.

### Danger

| Title | Character | Length |
| --- | --- | ---: |
| Break the Wake | Off-centre bass movement and a guitar answer for pursuit | 54 s |
| Orders Across the Dark | Broad Navy call, organ and piano, half-time drums | 74 s |
| Boots on the Relay | Clipped piano questions and a dry infantry cadence | 58 s |
| Needle Through the Fleet | Fast plucked escape figures and short upper-register phrases | 53 s |
| The Last Coolant Line | Engineering pressure, insistent bass, and an open middle | 70 s |
| Cover the Crossing | Escort and defensive movement with a sustained melodic answer | 75 s |
| Through the Bulkhead | Close boarding action, dry percussion, and compact phrases | 56 s |
| A Ship Too Large to Hide | Heavy-ship weight and a slower, broader battle theme | 90 s |
| Keeping the Corridor | Infantry defense with alternating movement and held space | 65 s |
| No Clean Exit | Urgent pursuit and retreat, clipped rhythm, and a restrained ending | 53 s |

### Caves

| Title | Palette | Length |
| --- | --- | ---: |
| Under the First Ridge | Barren stone, separated plucked notes | 69 s |
| Water Between Walls | Water and ocean caves, spacious piano and bells | 75 s |
| Basalt Letters | Volcanic stone, a slow sustained answer | 66 s |
| A Little Room Below | Temperate and forest caves, small warm phrases | 67 s |
| The Long Quiet Seam | Ice and ancient passages, long rests and bowed tones | 80 s |

### Planets and moons

| Title | Matching world | Length |
| --- | --- | ---: |
| Rain Over Morrow | Temperate | 80 s |
| Orchards in Orbit | Forest | 72 s |
| Roads of Violet Dust | Desert and arid | 76 s |
| The Tide Keeps Time | Ocean | 74 s |
| The White Distance | Ice | 77 s |
| Embers Below the Road | Volcanic | 69 s |
| Windows After Shift | Industrial | 65 s |
| Small Sky on a Moon | Barren | 73 s |
| The Garden Remembers | Ruin and Earth | 78 s |
| The Common Horizon | Alien homeworld communities, including Avel and Hadrun | 70 s |

These are original instrumental compositions performed by the game’s local synthesizer. They are not licensed recordings, generated streams, or recolored copies of a single melody. Their arrangements use the existing instrument set and remain below the twenty-voice cap per player.

## Growing the universe

Adding a new peaceful composition is a catalog change: choose its family, tags, repeat cooldown, and written musical material. New cultures can receive coherent instrument palettes without needing a unique recording for every system. Current regional keys make context selection stable while session history keeps it from repeating immediately.

Future recurring characters should earn small motifs through actual encounters. Avoid a personal jingle every time someone appears. Exceptional homecomings, departures, and story conclusions can use fuller variations of the title melody; ordinary transactions should stay ordinary.

Future narrative moments can send a revealed cue with an explicit ID and a `silence`, `discovery`, `tension`, or `terror` tag. Merely storing such a tag on an unexplored location must not trigger it. The adapter requires the moment to have been presented.

If recorded music replaces the synth instruments, complete pieces should crossfade as complete pieces. Independently produced tracks should not be layered as though they were synchronized stems. True layered stems need a shared tempo, phrase length, harmonic plan, and playback clock.

## Controls, privacy, and interruptions

Music has an independent enable switch, volume and presence setting in Settings and the Music & listening panel. The title retains its main-theme listen control. Current status distinguishes playback, an intentional quiet interval and a queued request. Existing users whose old sound master was off retain silence during the migration; opening or browsing the panel does not unmute them. Choosing **Listen** is an explicit playback request: it enables music and restores the default 65% music volume if that volume was zero. Sound effects retain their separate setting.

Preferences use the existing device settings record and appear in the browser-data export. Recent listening choices and event deduplication stay in bounded memory for this session. The music system sends no analytics or listening history, requires no microphone permission, and makes no runtime music-service requests.

Audio begins after an accepted browser gesture. The shared playback-session helper and touch-end activation remain in place. Hidden pages stop score/effect sources. Suspended or interrupted contexts can resume without firing a backlog of missed notes. Physical iPhone speaker, Bluetooth, and interruption behavior still require device listening; a Chromium phone viewport cannot certify them.

## Validation

The release gate is the existing complete frontend and server suite, with focused music tests for composition validity, exact preservation of the written main theme, event scope, repeat prevention, transitions, silence, local settings migration, audition behavior, cache bounds and audio lifecycle. Browser validation checks gesture activation, independent mute, live output, menu behavior, persistent controls and bounded playback after interruptions.

Offline 44.1 kHz stereo renders of the actual Web Audio graph check finite output, headroom, relative cue levels and clean endings, including the new felt/reed passages and Foreman/Glimmer mix trims. Signal measurements do not establish subjective musical quality or certify physical mobile speakers, Bluetooth playback or device interruptions; those still require listening on the relevant hardware.
