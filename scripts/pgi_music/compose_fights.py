#!/usr/bin/env python3
"""Reproducible PGI scoring stingers: two historic melodies + one original.

Only each historic song's monophonic melody is transcribed. All supporting
parts, cadences, instrumentation and sound synthesis are newly written.
See fights/PROVENANCE.md for the score scans and publication evidence.
Run from any directory; --render also creates the MP3 assets.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import subprocess
import sys

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
SCORES = HERE / "fights"
MUSIC = REPO / "daily_flyer/themes/pocket_gridiron_assets/music"

# Pitches are sounding MIDI notes. Durations are quarter-note beats.
# For Boston: pickup + opening eight bars, with the last pickup omitted.
# None means a rest. The final tonic tag is our addition, kept separate below.
BC_MELODY = [
    (65, 1),
    (70, 2), (65, 1), (65, 1),
    (74, 2), (70, 1), (65, 1),
    (67, 1), (72, 1), (70, 1), (69, 1),
    (70, 2), (None, 1), (65, 1),
    (72, 2), (74, 1), (72, 1),
    (70, 2), (69, 1), (69, 1),
    (72, 1), (70, 1), (69, 1), (67, 1),
    (65, 2),
]

# Notre Dame: first eight bars of the chorus in the 1928 piano/vocal score,
# printed page 5. The sustained end of bar 4 is A-flat, not B-flat.
ND_MELODY = [
    (67, 4),
    (66, 2), (67, 2),
    (68, 1), (68, 2), (67, 1),
    (68, 4),
    (68, 1), (68, 2), (68, 1),
    (67, 2), (68, 2),
    (70, 1), (70, 2), (69, 1),
    (70, 4),
]

ORIGINAL_MELODY = [
    (74, .5), (69, .5), (74, .5), (78, .5), (81, 1), (78, .5), (76, .5),
    (74, 1), (71, .5), (74, .5), (79, 1), (78, .5), (76, .5),
    (78, .5), (74, .5), (69, 1), (71, .5), (74, .5), (76, 1),
    (69, 1), (None, .5), (73, .5), (76, .5), (79, .5), (81, 1),
    (78, .5), (76, .5), (74, 1), (78, .5), (81, .5), (86, 1),
    (81, .5), (78, .5), (74, 3),
]


def note(pitch, start, duration, velocity=96):
    return dict(pitch=pitch, start=start, duration=round(duration, 5), velocity=velocity)


def melody_notes(sequence, start=0, transpose=0, velocity=104):
    notes = []
    cursor = start
    for pitch, duration in sequence:
        if pitch is not None:
            # A tiny breath between repeated notes keeps the brass articulation.
            notes.append(note(pitch + transpose, cursor, duration * .94, velocity))
        cursor += duration
    return notes


def track(name, instrument, volume, pan, notes):
    return dict(name=name, instrument=instrument, volume=volume, pan=pan, notes=notes)


def accompaniment(changes, end, pickup=0):
    """Original alternating bass, short brass answers, organ bed and field drums.

    changes: (beat, span, bass root, chord tones). This is intentionally an
    independent arrangement: no piano voicing or band-score harmony is copied.
    """
    bass, brass, organ, drums = [], [], [], []
    for start, span, root, chord in changes:
        for offset in range(int(span)):
            at = start + offset
            if at >= end:
                break
            bass.append(note(root if offset % 2 == 0 else root + 7, at, .66, 91 if offset % 2 == 0 else 78))
            if offset % 2:
                brass.extend(note(p, at, .48, 78) for p in chord)
        organ.extend(note(p, start, max(.2, span - .08), 61) for p in chord)

    # Low field bass drum and brisk snare taps, with short drags into accents.
    for step in range(int((end - pickup) * 2)):
        at = pickup + step * .5
        if step % 4 == 0:
            drums.append(note(36, at, .1, 102))
        if step % 2 == 0:
            drums.append(note(38, at, .1, 73 if step % 4 else 52))
        else:
            drums.append(note(38, at, .08, 38 if step % 4 == 1 else 45))
        if step % 8 == 7:
            drums.append(note(38, at + .25, .06, 45))
        if step % 8 == 0:
            drums.append(note(49, at, .1, 47))
    if pickup:
        drums += [note(38, x, .06, 30 + round(x * 35)) for x in (0, .25, .5, .75)]
    return [
        track("Original low brass bass", "bass", .48, 0, bass),
        track("Original brass responses", "brass", .24, -.23, brass),
        track("Original stadium organ", "organ", .16, .22, organ),
        track("Original field percussion", "drums", .34, 0, drums),
    ]


def cadence(tracks, at, duration, root, chord):
    tracks[0]["notes"].append(note(root, at, duration, 101))
    tracks[1]["notes"].extend(note(p, at, duration * .9, 91) for p in chord)
    tracks[2]["notes"].extend(note(p, at, duration, 73) for p in chord)
    tracks[3]["notes"] += [note(36, at, .1, 112), note(49, at, .1, 80)]


def make_score(slug, title, bpm, bars, melody, changes, end, pickup=0, final=None, historic=True):
    backing = accompaniment(changes, end, pickup)
    lead = melody_notes(melody)
    if final:
        at, duration, lead_pitch, root, chord = final
        cadence(backing, at, duration, root, chord)
        lead.append(note(lead_pitch, at, duration * .94, 111))
    tracks = [track("Historic melody" if historic else "Original touchdown melody", "brass", .72, .02, lead)] + backing
    # Light upper octave supports recognition on a phone speaker.
    tracks.append(track("Melody octave color", "organ", .085, -.08,
                        [dict(n, pitch=n["pitch"] + 12, velocity=72) for n in lead]))
    return dict(
        id=slug, title=title, bpm=bpm, bars=bars, beats_per_bar=4,
        preview_gain=.8, loop=False, purpose="team scoring stinger",
        provenance="scripts/pgi_music/fights/PROVENANCE.md",
        melody_source="Historic public-domain composition; newly arranged and synthesized" if historic else "New original PGI composition",
        tracks=tracks,
    )


def scores():
    # Chord pitches deliberately stay below the lead melody.
    bb = [58, 62, 65]
    f = [57, 60, 65]
    cm = [55, 60, 63]
    f7 = [57, 60, 63]
    bc = make_score(
        "for-boston", "For Boston — PGI scoring arrangement", 156, 9,
        BC_MELODY,
        [(1, 4, 46, bb), (5, 4, 46, bb), (9, 2, 48, cm), (11, 2, 41, f7),
         (13, 4, 46, bb), (17, 4, 41, f), (21, 2, 46, bb), (23, 2, 41, f),
         (25, 2, 48, cm), (27, 2, 41, f7), (29, 2, 41, f)],
        end=31, pickup=1, final=(31, 4, 70, 46, bb),
    )

    eb = [55, 58, 63]
    ab = [56, 60, 63]
    bb7 = [56, 58, 62]
    nd_changes = [
        (0, 4, 39, eb), (4, 2, 38, [54, 57, 60]), (6, 2, 39, eb),
        (8, 8, 44, ab), (16, 4, 44, ab), (20, 2, 39, eb), (22, 2, 44, ab),
        (24, 4, 46, bb7), (28, 4, 46, bb7),
    ]
    # Three statements of the same audited eight-bar melody. The quieter
    # middle statement and fuller final reprise extend the celebration without
    # claiming to transcribe additional bars from the historic composition.
    nd = make_score(
        "notre-dame-victory", "Notre Dame Victory March — PGI scoring arrangement", 224, 25,
        ND_MELODY * 3,
        [(start + offset, span, root, chord)
         for offset in (0, 32, 64) for start, span, root, chord in nd_changes],
        end=96, final=(96, 3.5, 75, 39, eb),
    )
    for part in nd["tracks"]:
        for n in part["notes"]:
            if 32 <= n["start"] < 64:
                n["velocity"] = round(n["velocity"] * (.80 if part["instrument"] == "drums" else .88))
            elif 64 <= n["start"] < 96:
                n["velocity"] = min(120, round(n["velocity"] * 1.06))
        if part["instrument"] == "drums":
            part["notes"] = [n for n in part["notes"]
                             if not (32 <= n["start"] < 48 and n["pitch"] == 49)]
            part["notes"] += [note(38, 94 + beat * .25, .06, 47 + beat * 7)
                              for beat in range(8)]
    nd["sections"] = [
        {"beat": 0, "name": "Opening brass statement"},
        {"beat": 32, "name": "Lighter stadium reprise"},
        {"beat": 64, "name": "Full-band return"},
        {"beat": 96, "name": "Tonic celebration ending"},
    ]

    d = [57, 62, 66]
    generic = make_score(
        "pgi-score", "Six on the Board — PGI scoring fanfare", 152, 6,
        ORIGINAL_MELODY,
        [(0, 4, 38, d), (4, 4, 43, [55, 59, 62]), (8, 4, 47, [54, 59, 62]),
         (12, 4, 45, [55, 61, 64]), (16, 4, 38, d), (20, 1, 45, [57, 61, 64])],
        end=21, historic=False,
    )
    cadence(generic["tracks"][1:5], 21, 2.7, 38, d)
    return [bc, nd, generic]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--render", action="store_true")
    parser.add_argument("--only", choices=("for-boston", "notre-dame-victory", "pgi-score"),
                        help="Rebuild one cue without rewriting the others")
    args = parser.parse_args()
    SCORES.mkdir(exist_ok=True)
    for score in scores():
        if args.only and score["id"] != args.only:
            continue
        output = SCORES / f'{score["id"]}.json'
        output.write_text(json.dumps(score, indent=2) + "\n")
        print(output.relative_to(REPO))
        if args.render:
            subprocess.run([sys.executable, str(HERE / "render_preview.py"), str(output),
                            str(MUSIC / score["id"]), "--tail", ".5"], check=True)


if __name__ == "__main__":
    main()
