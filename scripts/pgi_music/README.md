# PGI stadium soundtrack

## Active game soundtrack

The default **Match the moment** rotation restores three earlier synthesized
arcade favorites and reserves three orchestral recordings for the final recap
and its recorded highlight reel. Each group rotates only within its collection:

| Moment | Opening track | Following tracks |
| --- | --- | --- |
| Main menu | Saturday Voltage | Neon End Zone, Fourth and Thunder |
| Pregame | Fourth and Thunder | Saturday Voltage, Neon End Zone |
| Halftime | Neon End Zone | Saturday Voltage, Fourth and Thunder |
| Postgame highlights | Sunday in Gold | Leather and Thunder, The Long Walk Home |

Transitions fade the outgoing song and start the new show at its opening. Late
downloads cannot restart the previous show’s music. Music stays off during
football unless **All the time** is selected. Players can preview all six tracks
or explicitly choose either collection in the soundtrack panel.

The active mixed catalog is `music/manifest.json`; scene ordering lives in
`SCENE_TRACKS` in `music.js`. Other historical recordings remain archived.
See `FILM_SCORE.md` for orchestral rendering and `fights/PROVENANCE.md` for cues.

Green Bay uses **Lambeau Bounce**, a compact original synth-funk scoring cue
rebuilt at the reference song’s 126 BPM, with a full-bar falling synth, a
steady quarter-note backbeat, repeating octave bass and a two-bar synth answer.
The new arrangement runs about 16 seconds. Rebuild
only this cue with `python scripts/pgi_music/compose_green_bay.py --render`.
Its source score and provenance live in `fights/`; the soundtrack panel offers
a **GB · Lambeau Bounce** preview. Scoring cues stay outside the six-track
background rotation.

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
