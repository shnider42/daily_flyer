# Farwake: music direction and adaptive score

## Identity

Farwake's score should make a small personal journey feel worth taking in a very large universe. Its center is curiosity, warmth, and the possibility of finding a life somewhere. Danger is part of that life. Horror is an exceptional interruption.

The exploration reference is musical patience: recognizable short pieces arrive, develop, and leave room for the world. The title theme uses the spacious phrasing of 1970s progressive and psychedelic rock: warm electric piano, a sustained melodic guitar voice, independently moving bass, gentle organ, restrained drums, and echo. The melodies and arrangements in this repository are original compositions. They do not sample recordings or quote the reference artists' songs.

“The Long Way Home” is the main theme. Its opening rising fifth and descending answer return in changing arrangements; the middle passage offers a brighter harmonic departure before the original phrase comes home. The complete statement is about three minutes and seventeen seconds, followed by its tail. It is a composition with a beginning, development, return, and ending, rather than an endlessly regenerated pad.

The current sound is a locally synthesized arrangement. A recorded or studio-produced performance can replace its renderer later without changing the musical director or gameplay hooks. A recognizable theme can be composed now; whether it becomes memorable to players needs actual listening and repeated play.

## Musical situations

| Situation | Musical treatment |
| --- | --- |
| Title and an explicitly requested listen | Full main theme, with a melody early in the piece. It does not restart each time a menu opens. |
| Ordinary flight | The original intimate piano, electronic movement, and lyrical plucked/guitar pieces. |
| Planetary terrain | Ten additional pieces matched to actual terrain and homeworld culture. World identity is part of the palette, so two bodies in one system do not share a compulsory selection. |
| Cave exploration | Five sparse pieces with stone-like mallets, piano, bowed tones, and long breaths. Entering a cave alone never implies a hidden monster. |
| Ports and places where people live | More rhythmic, companionable pieces. Garden and market palettes permit gentle whimsy. Empty terrain does not inherit this merely because a planet has inhabitants. |
| A discovery that has actually been presented | A brief sense of possibility. It must not announce hidden content. |
| A visible threat or a warning the captain has received | Restrained tension. A dangerous entity elsewhere in the simulation does not qualify. |
| Targeted fire, confirmed outgoing ship hits, active pursuit, boarding, or a real occupied-ship emergency | Quick removal of peaceful scoring, then stronger rhythm and weight. Ten new danger pieces add escape rhythms, heavy-ship weight, infantry movement, and pressured retreat. Repeated impacts extend the situation without repeatedly restarting the track. |
| After danger | A recovery passage and then a quiet interval. Cheerful port music should not immediately follow a firefight. |
| Rare authored terror | A short, sparse disturbance after a specific reveal. Darkness, low health, a cave, or a derelict alone do not qualify. |

Musical silence does not disable footsteps, hull sounds, machinery, local ambience, alarms, or combat effects. Reading dialogue or overhearing a conversation lowers the score rather than removing the identity of the place.

## Timing defaults

Peaceful pieces normally run to their endings. A genuine change to a cave, planetary surface, or a different planetary identity can request a gentle crossfade after six seconds. Returning across the threshold before that deadline cancels the request. The deadline survives a natural cue ending; an ordinary quiet interval cannot postpone the arrival for minutes. Small movements and dialogue do not restart a matching piece. Above-ground social scenes remain companionable; caves retain their own environmental family. Danger and recovery have priority over either location.

The three presence settings vary the space between peaceful pieces:

- **More quiet:** roughly 80–155 seconds.
- **Balanced:** roughly 38–90 seconds.
- **More music:** roughly 10–30 seconds.

Track-specific repeat cooldowns can extend these gaps. There is no promise that a fixed percentage of every session will be silent: the result depends on cue length, dialogue, danger, and travel.

An observed attack holds urgency for fourteen seconds after the last evidence. Tension holds for nine seconds. These holds prevent the music from flickering between calm and danger as a target briefly leaves view. Emergency, actual pursuit, and active boarding states persist while the actual situation persists. A completed danger piece can be followed by another while danger continues, even with More quiet selected or every applicable danger piece on cooldown. The score does not require the player to take damage: an explicitly targeted hostile volley or a dodged infantry shot already establishes danger.

Terror is capped at twenty seconds per treatment, once per observed reveal in the current session, with at least twenty minutes between distinct treatments and no more than three in an hour. Authored connections include a record the player has actually inspected in one rare site and a locally visible Bellwether reveal; a different captain revealing the concealed creature does not reveal it through this listener’s music. This is not a general spooky-location detector.

## Architecture

`music-score.mjs` contains the combined cue manifest, the original twelve pieces, instrument rendering, and the `ScorePlayer` transport. `music-danger.mjs` adds ten written pressure pieces; `music-environments.mjs` adds five cave and ten planetary pieces. Their builders receive the existing composer and harmony table and use the same renderer. Each cue provides a family, duration, tags, and repeat cooldown. Variation changes articulation, timing, placement, and selection; the core written melodies remain recognizable.

`music-context.mjs` is a read-only adapter. It converts actual simulation state and scoped events into musical meaning. It follows the vessel the captain currently occupies, including hired and shared ships. Damage to the captain's parked personal ship does not become danger music while that captain is elsewhere. A visible but unengaged target means tension; explicit targeted fire, a visible engaged ground attacker, actual pursuit of the occupied hull, and confirmed damage mean combat. Enemy volleys and projectiles carry target hull identity, and outgoing impacts carry firing hull identity. These distinguish guests from a ship’s owner and from an owner ashore. Interior-only shared snapshots carry only current pursuit/incoming facts for their occupied hull; they do not expose full exterior actors or upcoming encounter rolls. Ground shots retain their intended recipient when the actual bullet misses. Real Game and Realm tests cover those boundaries, including shield-only hits, solo Navy gunnery, shared interior views, and dodged rifle shots.

`music-director.mjs` chooses when a cue belongs. It owns priority, recovery, quiet intervals, a bounded recent-cue history, repeat cooldowns, and stable regional selection. It does not synthesize sound, inspect enemies, or change gameplay.

`audio.mjs` connects the director and transport to the existing effects system. Music and effects use independent buses. At most two complete score players exist during a fade; the departing player is released. Notes use the audio clock. Scene selection is sampled at a lower rate than note scheduling, so a larger galaxy does not require scoring every object every frame.

`app.mjs` supplies the local context, forwards freshly drained relevant events, and ticks the music transport even while the title or a menu is visible. A requested theme listen can wait for an immediate danger to settle.

## Additional composition catalog · 0.15.0

The expansion adds 25 pieces, bringing the total to 37. The full main-theme event sequence remains unchanged. Duration below is the written piece; the renderer allows a short release tail.

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

Music has an independent enable switch, volume, and presence setting. The title and Settings both offer a main-theme listen control. Settings also shows the current piece or the intentional quiet between pieces. Existing users whose old sound master was off retain silence during the migration; the update does not unexpectedly unmute them.

Preferences use the existing device settings record and appear in the browser-data export. Recent listening choices and event deduplication stay in bounded memory for this session. The music system sends no analytics or listening history, requires no microphone permission, and makes no runtime music-service requests.

Audio begins after an accepted browser gesture. The shared playback-session helper and touch-end activation remain in place. Hidden pages stop score/effect sources. Suspended or interrupted contexts can resume without firing a backlog of missed notes. Physical iPhone speaker, Bluetooth, and interruption behavior still require device listening; a Chromium phone viewport cannot certify them.

## Validation

The release gate is the existing complete frontend and server suite, with focused music tests added for composition validity, event scope, repeat prevention, transitions, silence, local settings migration, and audio lifecycle. Browser checks cover real gesture activation, independent mute, live output, menu behavior, persistent controls, phone layout, and bounded playback after interruptions.
