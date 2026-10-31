# Sixteen Signals — original Breach cue sketches

Original instrumental concept for Breach: 104 BPM, 4/4, 16 bars (36.923 seconds).
The MIDI contains separate rhythm, accent guitar, bass, drone, melody, and drum
parts. The MP3 is a rendering of those notes, with a short release tail.

The score was generated for this project from newly written note sequences.
No existing song, transcribed riff, downloaded MIDI, recording, soundfont,
third-party instrument sample, or voice imitation was used as an input. The
render uses procedural oscillators, filtered noise, and generated envelopes.
This documents provenance, rather than asserting legal clearance or exclusive
copyright in machine-generated material.

The game uses the MP3 for consistent playback and bounded mobile CPU use.
The editable MIDI is retained here as composition source; the browser does not
need a MIDI player or soundbank. Nothing is streamed from external services.
MIDI is downloaded only on request. Since 0.8.4, the game prepares a mission’s assigned opening
MP3 after Start; silent arrivals prepare nothing. The menu theme loads after
a user gesture, and later sections load on demand. Preparation
does not grant permission to play.

To regenerate, using Python with NumPy/SciPy and FFmpeg on your PATH:

```sh
python3 scripts/breach_music/compose.py /tmp/breach-music
python3 scripts/breach_music/render_preview.py /tmp/breach-music/score.json /tmp/breach-music/Breach-Containment-Pulse
```

Copy the `.mid` and `.mp3` outputs here using the lowercase filenames above.
Build/publish does not require any of these audio authoring dependencies.

## Twelve additional cues (0.8.2)

The album composer writes twelve separate scores and standard Type-1 MIDI
files with tempo, meter, named parts, program changes, velocity and pan.
Rhythmic patterns, pitch contours, meters, densities and orchestration vary
across the palette. This is not twelve transpositions of the first cue.
Clean guitar and atmospheric pieces deliberately omit the full rock kit.

```sh
python3 scripts/breach_music/compose_album.py /tmp/breach-album
# Render each <cue>.json (exclude *.render.json diagnostics):
python3 scripts/breach_music/render_preview.py /tmp/breach-album/iron-wake.json /tmp/breach-album/iron-wake
```

Repeat the render command for each score; copy its lowercase `.mid` and
`.mp3` here. Generated WAVs/JSON diagnostics stay outside the shipped assets.
The renderer uses NumPy/SciPy and FFmpeg; game builds need none of them.
MIDI uses General MIDI program suggestions. A DAW's patches will sound
different from these procedural preview instruments.

The same source/provenance statement above applies to every new cue. No
reference recordings or existing MIDI were used. Independent listening for
unintended resemblance and a human musical revision pass remain useful before
a commercial release; MIDI format itself does not confer legal clearance.

See `../music-cues.mjs` for exact catalog entries and `../soundtrack.html` for
explicit auditions and MIDI downloads. The game lazily loads a maximum of two
decoded buffers; the full album is never fetched on arrival.

## Beneath The Shadow — three further compositions

`compose_shadow.py` authors three new scores with explicit phrase markers in
the MIDI conductor track. These are composed A/B/return forms, not randomized
playlists or transpositions of an earlier cue:

| Cue | Tempo and form | Rendered length | Musical purpose |
| --- | --- | --- | --- |
| Shadow Running | 140 BPM; 24 bars; two-bar hook, contrasting middle, hook return and written descent | 42.94 s | An urgent arrival and forward motion through the exposed works |
| Sever the Echo | 154 BPM; 28 bars; 3+3+2 accents over 4/4, answering melody, half-time bridge and resolved ending | 45.44 s | Boss pressure, with a distinct hook and space in its suppression bridge |
| Lanterns Below | 80 BPM; 16 bars; clean-guitar call and answer, restrained bass, sparse distant toms | 49.80 s | The buried district's quieter human traces; the opening contour heard more slowly |

The fast cues use independently written rhythmic and melodic phrases. The
quiet cue intentionally recalls a short contour from Shadow Running to bind
this mission's sound together. No existing songs, recordings, downloaded MIDI,
sample libraries or vocal imitations were used. The source/provenance statement
above applies to all three; it is not a legal clearance claim.

```sh
python3 scripts/breach_music/compose_shadow.py /tmp/breach-shadow-score
python3 scripts/breach_music/render_preview.py /tmp/breach-shadow-score/shadow-running.json /tmp/breach-shadow-score/shadow-running
python3 scripts/breach_music/render_preview.py /tmp/breach-shadow-score/sever-the-echo.json /tmp/breach-shadow-score/sever-the-echo
python3 scripts/breach_music/render_preview.py /tmp/breach-shadow-score/lanterns-below.json /tmp/breach-shadow-score/lanterns-below
```

Copy only the `.mid` and `.mp3` files into this directory. Scores, intermediate
WAVs and render diagnostics remain outside the shipped assets. Each MP3 is
44.1 kHz stereo at 192 kbps, with a written ending and 1.8-second release tail.
The game should allow the full cue length and apply its contextual fades when
entering quiet areas. Do not cut these at the older 40-second cue limit.
