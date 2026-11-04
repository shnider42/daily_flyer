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


def score():
    bass, lead, stabs, clav, drums, sparks = [], [], [], [], [], []
    # D minor, with a fourth-degree answer and a dominant turnaround.
    harmony = [
        (38, [62, 65, 69, 72]), (38, [60, 65, 69, 74]),
        (43, [62, 65, 67, 70]), (38, [60, 64, 65, 69]),
        (46, [62, 65, 68, 72]), (43, [62, 65, 69, 70]),
        (45, [61, 64, 67, 71]), (38, [62, 65, 69, 74]),
    ]
    # Tuple: offset, pitch above root, duration. Leave air around the backbeat.
    groove = [(0, 0, .38), (.75, 12, .17), (1.5, 0, .18),
              (1.75, 10, .18), (2.5, 7, .34), (3.25, 12, .16),
              (3.75, 0, .18)]
    hooks = [
        [(0, 74, .35), (.75, 69, .18), (1.5, 72, .2), (2, 77, .55), (3, 76, .2), (3.5, 74, .3)],
        [(.5, 69, .2), (1.25, 72, .2), (2, 74, .3), (2.75, 81, .2), (3.25, 77, .4)],
        [(.25, 79, .4), (1, 77, .2), (1.75, 74, .2), (2.5, 70, .3), (3.25, 74, .45)],
        [(0, 77, .3), (.75, 76, .2), (1.5, 74, .4), (2.5, 72, .2), (3.25, 69, .4)],
        [(0, 77, .35), (.75, 74, .2), (1.5, 72, .2), (2, 80, .5), (3, 77, .2), (3.5, 74, .3)],
        [(.5, 79, .3), (1.25, 77, .2), (2, 74, .3), (2.75, 77, .2), (3.25, 81, .4)],
        [(0, 76, .35), (.75, 73, .2), (1.5, 71, .2), (2.25, 69, .2), (3, 73, .2), (3.5, 76, .3)],
        [(0, 77, .3), (.75, 76, .2), (1.5, 72, .25), (2.25, 74, 1.45)],
    ]
    for bar, (root, chord) in enumerate(harmony):
        at = bar * 4
        for i, (offset, interval, length) in enumerate(groove):
            if bar == 7 and offset >= 2.25:
                continue
            bass.append(note(root + interval, at + offset, length, 107 if i == 0 else 91))
        for offset, pitch, length in hooks[bar]:
            lead.append(note(pitch, at + offset, length, 102 if bar >= 4 else 96))
        for offset in [0, 1.75, 3]:
            if bar == 7 and offset >= 2.25:
                continue
            stabs.extend(note(p, at + offset, .20, 86 if offset == 0 else 74) for p in chord)
        for i, offset in enumerate([.5, 1.25, 2.75, 3.5]):
            if bar == 7 and offset >= 2.25:
                continue
            clav.extend(note(p + 12, at + offset, .105, 67 + i % 2 * 9) for p in chord[:3])
        for offset in [0, 1.5, 2.5, 3.75]:
            if bar == 7 and offset >= 2.25:
                continue
            drums.append(note(36, at + offset, .1, 107 if offset == 0 else 83))
        for offset in [1, 3]:
            if bar == 7 and offset >= 2.25:
                continue
            drums.append(note(38, at + offset, .1, 93))
        for step in range(16):
            offset = step / 4 + (.025 if step % 2 else 0)
            if bar == 7 and offset >= 2.25:
                continue
            drums.append(note(46 if step == 14 else 42, at + offset, .05,
                              55 if step % 2 == 0 else 31))
        # A short, written chip cascade answers the hook at the phrase break.
        if bar in [3, 6]:
            sparks.extend(note(p, at + 3.25 + i * .125, .10, 59)
                          for i, p in enumerate([86, 81, 77, 74]))
    # A resolved chord and bass stop; no looping or long dead-air tail.
    bass.append(note(38, 30.25, 1.45, 114))
    stabs.extend(note(p, 30.25, 1.45, 94) for p in [62, 65, 69, 74])
    drums.extend([note(36, 30.25, .1, 112), note(49, 30.25, .1, 61)])
    return dict(
        id='lambeau-bounce', title='Lambeau Bounce', bpm=120, bars=8,
        beats_per_bar=4, preview_gain=.8, loop=False, purpose='GB scoring stinger',
        provenance='scripts/pgi_music/fights/PROVENANCE.md',
        melody_source='Original PGI synth-funk composition',
        sections=[{'beat': 0, 'name': 'Immediate funk hook'},
                  {'beat': 8, 'name': 'Call and response'},
                  {'beat': 16, 'name': 'Upper-register celebration'},
                  {'beat': 24, 'name': 'Turnaround and touchdown stop'}],
        tracks=[track('Rubbery octave bass', 'funk_bass', .70, 0, bass),
                track('Original chip hook', 'chip_lead', .67, .02, lead),
                track('Syncopated synth stabs', 'funk_stab', .28, -.12, stabs),
                track('Sixteenth-note clav answers', 'funk_clav', .21, .13, clav),
                track('Electronic kick clap and hats', 'electronic_drums', .35, 0, drums),
                track('Arcade sparkle reply', 'chip_lead', .21, -.08, sparks)],
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
