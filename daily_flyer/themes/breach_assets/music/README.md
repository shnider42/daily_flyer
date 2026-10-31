# Containment Pulse

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
Neither file is downloaded until needed by a listener (the game only requests
the MP3, lazily on an eligible combat cue).

To regenerate, using Python with NumPy/SciPy and FFmpeg on your PATH:

```sh
python3 scripts/breach_music/compose.py /tmp/breach-music
python3 scripts/breach_music/render_preview.py /tmp/breach-music/score.json /tmp/breach-music/Breach-Containment-Pulse
```

Copy the `.mid` and `.mp3` outputs here using the lowercase filenames above.
Build/publish does not require any of these audio authoring dependencies.
