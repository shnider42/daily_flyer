#!/usr/bin/env python3
"""Lambeau Bounce: an original, compact Green Bay scoring cue.

The creative reference is the springy synth-funk feel of You Dropped a Bomb
on Me. This score has its own bass figure, melody, harmony and ending; no
recording, lyrics, samples or transcribed hook are used.
Run: python scripts/pgi_music/compose_green_bay.py --render
"""
from __future__ import annotations
import argparse
import json
import subprocess
import sys
from compose_fights import HERE, MUSIC, SCORES, REPO, note, track


# Tempo checked against Dynamic Drum School's published drum chart.
REFERENCE_BPM = 126
TEMPO_SOURCE = 'https://dynamicdrumschool.com/wp-content/uploads/2020/08/You-Dropped-a-Bomb-on-Me.pdf'


def score():
    bass, chords, answer, drums = [], [], [], []
    # A full-bar falling synth opens the cue. The band arrives together on
    # beat four; the old one-second drop / isolated boom / pickup is discarded.
    drop = [note(95, 0, 3.72, 104)]
    drums.extend([note(38, 3.5, .08, 64), note(38, 3.75, .08, 81)])

    # A newly written low synth figure. Stable pitches, strong octave answers
    # and repeated placement make this a groove, without a busy chip solo.
    riff = [(0, 40, .35), (.5, 52, .20), (.75, 40, .18),
            (1.5, 47, .32), (2.25, 50, .23), (2.75, 52, .20),
            (3.5, 47, .32)]
    response = [
        [(0, 64, .50), (1, 67, .40), (1.75, 64, .40), (2.5, 62, .50), (3.25, 59, .55)],
        [(0, 67, .65), (1.5, 66, .32), (2, 64, 1.20)],
    ]
    for bar in range(1, 7):
        at = bar * 4
        for offset, pitch, length in riff:
            # The last answer turns back toward E without changing the rhythm.
            if bar % 2 == 0 and offset == 3.5:
                pitch = 43
            bass.append(note(pitch, at + offset, length, 111 if offset == 0 else 98))
        chord = [59, 62, 64, 67] if bar != 5 else [57, 61, 64, 67]
        for offset, length in [(.5, .32), (2.5, .48)]:
            chords.extend(note(p, at + offset, length, 84) for p in chord)
        # Let the opening bass groove establish itself for two whole bars.
        if bar >= 3:
            for offset, pitch, length in response[(bar - 3) % 2]:
                answer.append(note(pitch, at + offset, length, 91))
        # Straight quarter-note kick and hat pulse; snare/claps on 2 and 4.
        # The chart's 126-BPM pulse is preserved, not played in half time.
        for beat in range(4):
            drums.append(note(36, at + beat, .10, 105 if beat % 2 == 0 else 91))
            drums.append(note(42, at + beat, .06, 56 if beat % 2 == 0 else 48))
        drums.extend(note(38, at + beat, .10, 103) for beat in [1, 3])
        if bar == 1:
            drums.append(note(49, at, .12, 56))

    # Complete the final bar at the same pulse, then stop together.
    bass.extend([note(40, 28, .40, 107), note(52, 28.5, .25, 96),
                 note(47, 29, .38, 97), note(40, 30, 1.35, 109)])
    answer.extend([note(67, 28, .55, 89), note(66, 29, .40, 86), note(64, 30, 1.35, 94)])
    chords.extend(note(p, 30, 1.35, 91) for p in [59, 62, 64, 67])
    for beat in [28, 29, 30]:
        drums.extend([note(36, beat, .1, 103), note(42, beat, .06, 49)])
    drums.extend([note(38, 29, .1, 99), note(38, 30, .1, 78), note(49, 30, .1, 51)])
    return dict(
        id='lambeau-bounce', title='Lambeau Bounce', bpm=REFERENCE_BPM, bars=8,
        beats_per_bar=4, preview_gain=.88, loop=False, purpose='GB scoring stinger',
        revision='Recomposed at the reference 126-BPM pulse',
        tempo_reference={'artist': 'The Gap Band', 'song': 'You Dropped a Bomb on Me',
                         'bpm': REFERENCE_BPM, 'source': TEMPO_SOURCE},
        provenance='scripts/pgi_music/fights/PROVENANCE.md',
        melody_source='Original PGI synth-funk composition; source tempo reference only',
        sections=[{'beat': 0, 'name': 'Full-bar falling synth'},
                  {'beat': 4, 'name': 'Bass and straight backbeat enter together'},
                  {'beat': 12, 'name': 'Short synth answer'},
                  {'beat': 20, 'name': 'Repeat the answer over the groove'},
                  {'beat': 28, 'name': 'Final bar at the same pulse'}],
        tracks=[track('Opening falling synth', 'bomb_glide', .67, 0, drop),
                track('Repeating octave synth bass', 'stadium_bass', .78, 0, bass),
                track('Low chord punches', 'stadium_chord', .24, -.07, chords),
                track('Two-bar synth answer', 'stadium_chord', .39, .05, answer),
                track('Straight 126-BPM backbeat', 'electronic_drums', .44, 0, drums)],
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--render', action='store_true')
    args = parser.parse_args()
    composed = score()
    path = SCORES / 'lambeau-bounce.json'
    path.write_text(json.dumps(composed, indent=2) + '\n')
    print(path.relative_to(REPO))
    if args.render:
        subprocess.run([sys.executable, str(HERE / 'render_preview.py'), str(path),
                        str(MUSIC / composed['id']), '--tail', '.35'], check=True)


if __name__ == '__main__':
    main()
