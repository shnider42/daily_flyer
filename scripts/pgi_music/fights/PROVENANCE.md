# PGI scoring cues

Updated 2026-11-04. These are synthesized instrumental performances. The
historic fight songs use transcribed single-note melodies with newly written
accompaniment. The active Green Bay cue is an approximate reconstruction of a
short instrumental intro, described separately below. No original recording
samples or vocals are included in the shipped audio.

| Asset | Used for | Musical source | Rendering |
| --- | --- | --- | --- |
| `for-boston.mp3` | New England scoring | Thomas J. Hurley's **For Boston**, opening pickup and eight bars | B-flat major, quarter = 156, new tonic ending |
| `notre-dame-victory.mp3` | New York Jets scoring | Michael J. Shea's **Notre Dame Victory March**, opening eight + final eight chorus bars | E-flat major, half = 112, second ending; about 18 seconds |
| `green-bay-bomb-intro.mp3` | Green Bay scoring | Approximate instrumental intro reconstruction of **You Dropped a Bomb on Me** by The Gap Band | Quarter = 125, eight bars; 16.64 seconds |
| `pgi-score.mp3` | Other teams scoring | **Six on the Board**, an original PGI melody | D major, quarter = 152 |

## Green Bay: You Dropped a Bomb on Me intro

The selected version is the exact user-approved MP3 preview. It is an
approximate reconstruction, not a verified note-for-note transcription or an
original PGI composition. References used during construction were the
MIDI-HITS P428 public audio demo and Dynamic Drum School's intro chart. All
sounds in this asset are newly synthesized from oscillators and noise.

The eight bars last 15.36 seconds at 125 BPM; release tail and MP3 padding
bring the file to 16.64 seconds. The repeating bass figure enters at 7.68
seconds. Relative to the initial reconstruction, bass and chord notes are
raised 12 semitones. The downward pitch dip remains in its original lower
register, with its pitch-bend curve intact; the drums are unchanged.

`green-bay-bomb-intro.mid` preserves the editable source. Run
`python scripts/pgi_music/render_green_bay_intro.py /tmp/pgi-green-bay` from
the repository root to reproduce the MIDI and WAV. The approved MP3 uses
44.1 kHz stereo, 192 kbps encoding. Its `.render.json` records the exact
approved file's checksum and measured duration. The game and soundtrack
preview share this asset and the existing scoring switch and next-play fade.

## Archived Green Bay: Lambeau Bounce

Added 2026-11-04. The creative reference is the springy synth-funk feel of
**You Dropped a Bomb on Me**: octave bass, syncopated synth answers, a clap
backbeat and arcade flourishes. The melody, bass figure, harmony and ending
are newly composed. No source recording, sample, lyric, MIDI transcription or
transcribed hook is used.

Rebuilt from a new score at **126 BPM**, matching the tempo printed in
[Dynamic Drum School's drum chart](https://dynamicdrumschool.com/wp-content/uploads/2020/08/You-Dropped-a-Bomb-on-Me.pdf).
The reference is **You Dropped a Bomb on Me by The Gap Band**. This arrangement
keeps that pulse with quarter-note kicks and hats and claps on beats 2 and 4.
It does not reuse the previous 112-BPM score, its tune, or its bass pattern.
The melody and bass notes remain newly composed; the chart is used to check
tempo and the basic backbeat, not to redistribute its arrangement or lyrics.

A full-bar falling synth opens the cue, with a short snare pickup into the
band at 1.90 seconds. The low synth bass establishes a repeating groove for
two bars before a short two-bar answer enters at 5.71 seconds. The ending
continues at the same tempo through the last bar. Eight bars plus the release
tail give a 15.59-second recording. Dedicated bass, chord and falling-synth
patches replace the prior cue's sounds.

This was the previous Green Bay scoring cue. Its asset and renderer remain
archived; automatic scores and the main Green Bay preview now use the
approved intro above.

Rebuild this cue alone:

```sh
python scripts/pgi_music/compose_green_bay.py --render
```

The source score is `lambeau-bounce.json`. Its bass and chip lead include
upper harmonics to keep the musical line present on smaller speakers; physical
iPhone speaker performance remains a listening check on that device.

## Sources and scope

### Green Bay comparison takes

Two additional previews retain the accepted 126-BPM cue's original PGI musical
material while exploring the requested slower pacing. Both use a 3.8095-second
intro, twice the preceding cue's length, with the same falling synth and snare
pickup at the same absolute times. Their mastering reference is shared so the
intro's level is consistent as well. No recording or transcribed song hook is
used. They are auditions in the soundtrack panel; Green Bay's automatic cue
now uses `green-bay-bomb-intro.mp3`; these earlier auditions remain separate.

| Recording | Groove | Duration |
| --- | --- | --- |
| `lambeau-long-drop-63.mp3` | 63 BPM, half the reference tempo; the body keeps its pitches and seven-bar phrasing | 30.83 seconds |
| `lambeau-long-drop-112.mp3` | 112 BPM; louder repeating bass, firmer clap accents, shorter articulation and quieter upper answer | 19.16 seconds |

`compose_green_bay_takes.py --render` composes and renders both. The source
scores include the common intro duration and the separate body tempo. Their
fractional total bar counts express that fixed-duration intro on each body's
beat grid. `comparison-quality.json` records decoded audio checks and the
shared intro comparison. This is a timing and signal check, not a claim of
subjective listening quality or physical iPhone testing.

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
