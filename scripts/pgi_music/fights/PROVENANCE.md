# PGI scoring cues

Prepared 2026-11-02. These are new synthesized instrumental performances, with
new accompaniment, drum parts, orchestration and closing tags. No university,
commercial or fan recording, sample, downloaded MIDI, or modern band arrangement
is used. Only the two historic songs' single-note melodies are transcribed.

| Asset | Used for | Musical source | Rendering |
| --- | --- | --- | --- |
| `for-boston.mp3` | New England scoring | Thomas J. Hurley's **For Boston**, opening pickup and eight bars | B-flat major, quarter = 156, new tonic ending |
| `notre-dame-victory.mp3` | New York Jets scoring | Michael J. Shea's **Notre Dame Victory March**, opening eight + final eight chorus bars | E-flat major, half = 112, second ending; about 18 seconds |
| `lambeau-bounce.mp3` | Green Bay scoring | **Lambeau Bounce**, an original PGI synth-funk cue | D minor, quarter = 112, six bars; about 13 seconds |
| `pgi-score.mp3` | Other teams scoring | **Six on the Board**, an original PGI melody | D major, quarter = 152 |

## Green Bay: Lambeau Bounce

Added 2026-11-04. The creative reference is the springy synth-funk feel of
**You Dropped a Bomb on Me**: octave bass, syncopated synth answers, a clap
backbeat and arcade flourishes. The melody, bass figure, harmony and ending
are newly composed. No source recording, sample, lyric, MIDI transcription or
transcribed hook is used.

The revised arrangement starts with a continuous, nearly one-second descending
slide-whistle gesture. A compact low impact lands at 1.07 seconds; a spacious
bass pickup leads into the repeated two-bar funk groove at 2.14 seconds. The
backbeat uses eighth-note hats, and the short upper hook repeats instead of
continuously introducing new notes. A final hit at 10.71 seconds releases into
the crowd. Six bars at 112 BPM give a 13.21-second recording.

The cue plays once for Green Bay scores and follows the existing scoring-music
switch and next-play fade. The whistle and impact are baked into the scoring
recording, so their timing and level use the same playback path as the music.
It is also available through the soundtrack panel's **GB · Lambeau Bounce**
preview button. The main soundtrack rotation is unchanged.

Rebuild this cue alone:

```sh
python scripts/pgi_music/compose_green_bay.py --render
```

The source score is `lambeau-bounce.json`. Its bass and chip lead include
upper harmonics to keep the musical line present on smaller speakers; physical
iPhone speaker performance remains a listening check on that device.

## Sources and scope

**For Boston**

- Boston College's Burns Library catalogs the published sheet music
  [“For Boston College” by Thomas J. Hurley, 1915](https://findingaids.bc.edu/repositories/2/archival_objects/151897).
  This is the early-publication evidence used here; the song is commonly dated
  1885, but the arrangement does not depend on that earlier date.
- The melody was visually transcribed from page 1 of the
  [piano/vocal score scan](https://www.sheetmusicsinger.com/wp-content/uploads/2025/05/For-Boston-1885.pdf),
  linked from [Sheet Music Singer's song entry](https://www.sheetmusicsinger.com/for-boston/).
  This scan includes a publisher-permission notice. Its piano accompaniment and
  any later arrangement material are not reproduced. The melody alone is the
  underlying historic song; the accompaniment in `compose_fights.py` is new.
- The university's [Songs of BC history](https://web.bc.edu/umc/atbc/at.bc.edu/songsofbc/index.html)
  distinguishes the song from James Ecker's 1938 collected-song arrangements.
  Those arrangements are not used.

**Notre Dame Victory March**

- [Notre Dame's history](https://125.nd.edu/moments/notre-dame-victory-march-debut/)
  identifies the brothers Michael and John Shea as the original publishers and
  dates the first performance to 1908; Michael composed the music.
- The chorus melody was visually transcribed from printed pages 5–6 of the
  [1928 piano/vocal sheet music scan](https://www.sheetmusicsinger.com/wp-content/uploads/2023/12/Victory-March-1928.pdf),
  linked from [its catalog page](https://www.sheetmusicsinger.com/victory-march/).
  [Irish Sheet Music Archives](https://irishsheetmusicarchives.com/Sheet-Music-Catalog/Notre-Dame-Victory-March-IF-SM-02-023.htm)
  independently catalogs the 1928 Melrose edition.
- [BandMusicPDF's historical score listing](https://bandmusicpdf.org/victorymarchnotredame/)
  also records an original 1908 copyright. Its later-added band parts and modern
  transpositions are not copied. The game's organ and brass parts are new.

**Publication-age basis (United States)**

The [U.S. Copyright Office's Circular 22](https://www.copyright.gov/circs/circ22.pdf)
and [Circular 15A](https://www.copyright.gov/circs/circ15a.pdf) describe the maximum
95-year term for these published works and confirm that U.S. works published
before January 1, 1931 are in the public domain as of 2026. The source melodies
above predate that cutoff. This provenance concerns the underlying compositions,
not later recordings, arrangements, university marks, or lyrics (no lyrics are
included in these assets).

## Reproducible melody audit

The source melody lists are `BC_MELODY` and `ND_MELODY` in
`../compose_fights.py`. Pitch notation below uses middle C = C4 (MIDI 60), and
the number after each pitch is its duration in quarter-note beats. `r` is a rest.
Playback gives each note a small articulation gap; pitches and written rhythm
remain as below.

For Boston, B-flat major:

```text
Pickup: F4:1
1: Bb4:2 F4:1 F4:1
2: D5:2 Bb4:1 F4:1
3: G4:1 C5:1 Bb4:1 A4:1
4: Bb4:2 r:1 F4:1
5: C5:2 D5:1 C5:1
6: Bb4:2 A4:1 A4:1
7: C5:1 Bb4:1 A4:1 G4:1
8: F4:2
New closing tag, replacing the following rest/pickup: Bb4:4
```

Notre Dame Victory March, E-flat major, chorus:

```text
1: G4:4
2: F#4:2 G4:2
3: Ab4:1 Ab4:2 G4:1
4: Ab4:4
5: Ab4:1 Ab4:2 Ab4:1
6: G4:2 Ab4:2
7: Bb4:1 Bb4:2 A4:1
8: Bb4:4
9: C5:2 Eb5:2
10: D5:2 C5:2
11: Bb4:2 G4:2
12: Eb4:4
13: G4:1 F4:2 E4:1
14: G4:2 F4:2
15: E4:1 F4:3
16: Bb4:4
17: G4:1 G4:2 G4:1
18: F#4:2 G4:2
19: Ab4:3 G4:1
20: Ab4:4
21: Ab4:1 Ab4:2 Ab4:1
22: G4:2 Ab4:2
23: Bb4:1 Bb4:2 A4:1
24: Bb4:4
25: C5:2 Eb5:2
26: D5:2 C5:2
27: Bb4:2 G4:2
28: Eb4:2 F4:2
29: G4:1 Bb4:2 Ab4:1
30: G4:2 F4:2
31–32 (second ending): Eb4:6 r:2
```

The compact Jets cue plays bars 1–8 followed by bars 25–32 from the full
transcription above. It omits the contrasting middle and repeated chorus,
retains the final phrase and resolved second ending, and keeps the original
tempo. This cuts the previous 34.8-second arrangement to 17.6 seconds. The
accompaniment and drum fill remain newly written. For Boston and the generic
scoring fanfare are unchanged.

The generic cue's melody and all three accompaniments are authored directly in
`compose_fights.py`. To regenerate scores and audio:

```sh
python scripts/pgi_music/compose_fights.py --render
```

To rebuild only the compact Jets cue while leaving all other assets untouched:

```sh
python scripts/pgi_music/compose_fights.py --only notre-dame-victory --render
```

The shared renderer makes its own oscillators and percussion noise at 44.1 kHz,
then writes 112 kbps stereo MP3s. Per-asset `.render.json` files report duration,
peak/RMS levels, note counts, and rendering settings. Source scans are research
references only and are not redistributed with the game.
