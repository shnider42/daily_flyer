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
    bass, lead, stabs, drums = [], [], [], []
    # The touchdown owns the opening: whistle down, a landing, then the band.
    # Two beats (1.07 seconds) make the setup audible without delaying the party.
    whistle = [note(88, 0, 1.85, 101)]
    landing = [note(38, 2, .65, 103)]
    bass.extend([note(38, 2, .7, 108), note(50, 3.5, .27, 91)])
    stabs.extend(note(p, 2, .65, 87) for p in [62, 65, 69])
    drums.extend([note(36, 2, .1, 95), note(38, 3, .1, 92)])

    # A repeatable two-bar vamp. Let the bass and backbeat carry the celebration;
    # the small upper hook answers them instead of playing over every beat.
    grooves = [
        [(0, 0, .65), (1.5, 12, .30), (2.25, 0, .38), (3.25, 7, .38)],
        [(0, 0, .65), (.75, 12, .25), (1.75, 0, .38), (2.5, 7, .35), (3.5, 10, .28)],
    ]
    hooks = [
        [(.5, 69, .45), (1.25, 74, .65), (2.75, 72, .50)],
        [(.5, 69, .65), (2.75, 74, .70)],
    ]
    for bar in range(4):
        at = 4 + bar * 4
        root = 38 if bar % 2 == 0 else 43
        chord = [62, 65, 69, 72] if bar % 2 == 0 else [62, 65, 67, 70]
        for offset, interval, length in grooves[bar % 2]:
            bass.append(note(root + interval, at + offset, length, 108 if offset == 0 else 96))
        for offset, pitch, length in hooks[bar % 2]:
            lead.append(note(pitch, at + offset, length, 91))
        for offset in [.75, 2.75]:
            stabs.extend(note(p, at + offset, .32, 82) for p in chord)
        for offset in [0, 2.5]:
            drums.append(note(36, at + offset, .1, 108 if offset == 0 else 94))
        for offset in [1, 3]:
            drums.append(note(38, at + offset, .1, 101))
        for step in range(8):
            drums.append(note(42, at + step / 2, .05, 45 if step % 2 == 0 else 33))

    # One final punctuation mark, with room for crowd noise and the next play.
    bass.append(note(38, 20, 2.6, 111))
    lead.append(note(74, 20, 1.9, 93))
    stabs.extend(note(p, 20, 2.6, 96) for p in [62, 65, 69, 74])
    drums.extend([note(36, 20, .1, 109), note(38, 20, .1, 82), note(49, 20, .1, 53)])
    return dict(
        id='lambeau-bounce', title='Lambeau Bounce', bpm=112, bars=6,
        beats_per_bar=4, preview_gain=.8, loop=False, purpose='GB scoring stinger',
        revision='Whistle, touchdown hit, repeated groove, final punctuation',
        provenance='scripts/pgi_music/fights/PROVENANCE.md',
        melody_source='Original PGI synth-funk composition',
        sections=[{'beat': 0, 'name': 'Falling slide-whistle opening'},
                  {'beat': 2, 'name': 'Touchdown impact and bass pickup'},
                  {'beat': 4, 'name': 'First two-bar celebration groove'},
                  {'beat': 12, 'name': 'Repeat the hook'},
                  {'beat': 20, 'name': 'Final hit and release'}],
        tracks=[track('Falling touchdown whistle', 'touchdown_whistle', .72, 0, whistle),
                track('Touchdown landing', 'touchdown_hit', .42, 0, landing),
                track('Rubbery octave bass', 'funk_bass', .84, 0, bass),
                track('Short repeated chip hook', 'chip_lead', .44, .02, lead),
                track('Spaced synth answers', 'funk_stab', .27, -.08, stabs),
                track('Kick clap and eighth-note hats', 'electronic_drums', .39, 0, drums)],
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
