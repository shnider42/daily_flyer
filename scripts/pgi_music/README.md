# PGI stadium soundtrack

## Active game soundtrack

The default **Match the moment** rotation opens with two new original synth /
electro themes written for a 1980s arcade football game. A short, repeatable
melody starts on the first beat; separate chorus, breakdown, return and ending
sections keep the songs from feeling like an endlessly repeated sound effect.
The older rock recordings remain available in the explicit arcade collection.

| Moment | Opening track | Following tracks |
| --- | --- | --- |
| Main menu | Coin-Op Kickoff | Turbo Touchdown |
| Pregame | Turbo Touchdown | Coin-Op Kickoff |
| Halftime | Coin-Op Kickoff | Turbo Touchdown |
| Postgame highlights | Sunday in Gold | Leather and Thunder, The Long Walk Home |

Transitions fade the outgoing song and start the new show at its opening. Late
downloads cannot restart the previous show’s music. Music stays off during
football unless **All the time** is selected. Players can preview all eight
tracks or explicitly choose either collection in the soundtrack panel. Both
automatic menu playback and the arcade collection start with the new pair.

The active mixed catalog is `music/manifest.json`; scene ordering lives in
`SCENE_TRACKS` in `music.js`. Other historical recordings remain archived.
See `FILM_SCORE.md` for orchestral rendering and `fights/PROVENANCE.md` for cues.

## Original arcade / electro menu themes

| Theme | Tempo and key | Arrangement |
| --- | --- | --- |
| Coin-Op Kickoff | 136 BPM, D major | Bright pulse-wave title hook, FM bells, octave bass, four-on-the-floor drum machine, a higher stadium chorus |
| Turbo Touchdown | 144 BPM, C minor | Syncopated FM lead and electro bass, drum-machine breaks, chord arpeggios, a driving final hook |

`compose_arcade_themes.py` contains the literal melodies, chord voicings, bass
patterns, drum patterns, section map, and deterministic oscillator / noise
instruments. The two compositions use different hooks, harmony, rhythm and lead
voices. There are no sampled recordings, external soundfonts, or service keys.
Each has forty bars plus a release tail (about 72 and 68 seconds respectively).

Rebuild both from the repository root:

```sh
python scripts/pgi_music/compose_arcade_themes.py daily_flyer/themes/pocket_gridiron_assets/music --catalog-output /tmp/pgi-arcade-themes-catalog.json
```

Use `--track coin-op-kickoff` or `--track turbo-touchdown` for one track, and
`--keep-score` to inspect the expanded note and drum events in a JSON score.
The optional catalog output contains only the new entries; merge it into the
curated game manifest rather than replacing the film scores or scoring cues.
The dependency versions in `requirements.txt` apply to this renderer too.

The mix gives the lead its own register, keeps the bass centered, applies a
short kick duck to the accompaniment, and uses light tempo-locked echoes. A
two-pass loudness master targets −16 LUFS with −1.5 dBTP headroom before
encoding 44.1 kHz stereo, 160 kbps MP3. Each `.render.json` records the decoded
MP3’s loudness, peak, duration, stereo correlation, onset, continuity, byte size
and digest. Rendering stops if signal-health checks fail. These measurements
verify playable audio and levels; they do not claim subjective listening
approval or physical iPhone speaker evaluation. The game continues to use its
shared AudioContext / decoded-MP3 transport.

## Scoring cues

Green Bay uses the approved eight-bar instrumental reconstruction of
**You Dropped a Bomb on Me** by The Gap Band. The 125-BPM cue runs **16.64
seconds** including its release tail. Bass and chords are one octave higher
than the initial reconstruction; the downward pitch dip stays at its original
lower octave, and drums are unchanged. The shipped MP3 is the exact approved
preview, without further rendering or mastering.

`music/green-bay-bomb-intro.mp3` serves both automatic Green Bay scores and the
**GB · You Dropped a Bomb on Me** preview. The editable MIDI is
`fights/green-bay-bomb-intro.mid`; source details are in `fights/PROVENANCE.md`.
To reproduce its MIDI and synthesized WAV in a separate directory:

```sh
python scripts/pgi_music/render_green_bay_intro.py /tmp/pgi-green-bay
```

Scoring cues stay outside the eight-track background catalog. The earlier
Lambeau Bounce asset and its renderer remain archived.

Two Green Bay comparison previews share a longer 3.81-second falling intro:
**Take 1** plays the body at **63 BPM**, and **Take 2** uses **112 BPM** with
more bass and clap emphasis. Both are in the soundtrack panel. Render them
with `python scripts/pgi_music/compose_green_bay_takes.py --render`; the
current automatic scoring song remains separate. The renderer supports a
shared normalization reference to keep their common intro at the same level.

## Original arcade album

Nine original instrumental songs, composed for Pocket Gridiron. The `gallop`,
`hybrid`, and `glam` families explore melodic heavy metal, electronic heavy rock,
and glam/hard rock respectively. No artist's song, riff, recording, sample,
lyrics, or vocal performance is an input. These are procedural instrumental
recordings, not recordings by the referenced bands.

The rendering approach is reused from Breach's `scripts/breach_music/render_preview.py`.
PGI adds a vibrato guitar lead, electronic pluck, electronic kick/clap, cowbell,
and a brass voice for separately authored stadium cues. All voices are generated
from oscillators and noise. The rendered MP3 files spare mobile browsers from
having to synthesize a full band in real time.

`compose_album.py` contains every written riff, motif, accompaniment, and section.
Each song has an introduction, contrasting development, a return, and a resolved
ending. Arrangement metadata can be emitted to a separate album manifest; do not overwrite the curated game manifest when rebuilding the archive. The score JSON
files and WAV intermediates are reproducible and do not need to be committed.

## Rebuild

Python 3.10+, NumPy, SciPy, and an `ffmpeg` installation with `libmp3lame` are
required. The versions used for this render are listed in `requirements.txt`.
From the repository root:

```sh
python scripts/pgi_music/compose_album.py /tmp/pgi-scores --manifest /tmp/pgi-scores/arcade-manifest.json
```

For each emitted score:

```sh
python scripts/pgi_music/render_preview.py /tmp/pgi-scores/fourth-and-thunder.json daily_flyer/themes/pocket_gridiron_assets/music/fourth-and-thunder --tail 1.2
```

The renderer writes a stereo 44.1 kHz, 112 kbps MP3 and a numeric `.render.json`
report. It removes the intermediate WAV unless `--keep-wav` is specified.
The renderer seeds its synthesis noise deterministically on each invocation.
`validate_album.py` checks the nine scores and decoded MP3s and emits the combined
quality report. Numerical checks establish duration, amplitude, and structural
integrity; they do not establish subjective musical quality or physical iPhone
speaker performance.
