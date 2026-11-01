"""Three original MIDI-era metal songs for Breach.

Driving picked riffs, syncopated bass, and a dark organ give this set its
retro shooter character. No source song, recording, MIDI, or sample is input.
Every cue has written contrasting phrases and an ending within the playback
budget, rather than a short riff repeated until a fade.

Usage: python3 scripts/breach_music/compose_hellbound.py OUTPUT_DIRECTORY
Render the emitted JSON scores with render_preview.py.
"""
from __future__ import annotations

import argparse
from pathlib import Path

from compose_shadow import score, track, note, power, melody, write


PROVENANCE = (
    'Original Breach retro-metal composition; written MIDI-era riffs, bass, '
    'melodies, and drum arrangements; procedural instruments; no source-song input.'
)


def band(s, with_organ=False):
    """Keep bass and lead readable against two short, widely panned guitars."""
    parts = (
        track(s, 'Left picked riff', 'guitar_muted', 0, 28, .66, -.72),
        track(s, 'Right picked riff', 'guitar_muted', 1, 28, .63, .72),
        track(s, 'Ringing power chords', 'guitar_open', 2, 30, .38, -.16),
        track(s, 'Independent picked bass', 'bass', 3, 34, .91, 0),
        track(s, 'Lead refrain', 'lead', 4, 30, .76, .17),
        track(s, 'Rock kit', 'drums', 9, 0, .85, 0),
    )
    if with_organ:
        return (*parts, track(s, 'Ash chapel organ', 'organ', 5, 19, .33, -.10))
    return parts


def riff(left, right, bar, root, phrase, strength=1):
    for beat, offset, duration in phrase:
        velocity = round((106 if beat % 1 == 0 else 96) * strength)
        power(left, bar * 4 + beat, root + offset, duration, velocity)
        power(right, bar * 4 + beat + .013, root + offset,
              duration * .94, velocity - 5)


def bass_line(bass, bar, root, phrase, strength=1):
    for beat, offset, duration in phrase:
        velocity = round((108 if beat % 1 == 0 else 94) * strength)
        note(bass, bar * 4 + beat, root - 12 + offset, duration, velocity)


def rock_kit(drums, bar, kicks, *, half=False, ride=False, fill=False,
             crash=False, ghosts=False, strength=1):
    # One map prevents simultaneous same-pitch hits when a fill meets a backbeat.
    hits = {}

    def hit(beat, pitch, duration, velocity):
        hits[(beat, pitch)] = (duration, round(velocity * strength))

    for beat in kicks:
        hit(beat, 36, .14, 111 if beat % 1 == 0 else 99)
    for beat in ([2] if half else [1, 3]):
        hit(beat, 38, .17, 111)
    for eighth in range(8):
        hit(eighth * .5, 51 if ride else 42, .11,
            74 if eighth % 2 == 0 else 55)
    if ghosts and not half:
        hit(2.75, 38, .09, 47)
    if fill:
        for beat, pitch, velocity in [(2.5, 50, 79), (2.75, 47, 85),
                                      (3.25, 45, 93), (3.5, 43, 99),
                                      (3.75, 38, 101)]:
            hit(beat, pitch, .16, velocity)
    elif bar % 4 == 3:
        hit(3.5, 46, .20, 73)
    if crash:
        hit(0, 49, .65, 91)
    for (beat, pitch), (duration, velocity) in sorted(hits.items()):
        note(drums, bar * 4 + beat, pitch, duration, velocity)


def ending(parts, first_bar, root, descent):
    """Two bars: a descending answer, then two clearly resolved tonic blows."""
    left, right, open_g, bass, lead, drums = parts[:6]
    for beat, offset in [(0, descent[0]), (1.5, descent[1]), (3, descent[2])]:
        at = first_bar * 4 + beat
        power(left, at, root + offset, .34, 105)
        power(right, at + .013, root + offset, .32, 100)
        power(open_g, at, root + offset, .61, 94)
        note(bass, at, root - 12 + offset, .65, 108)
    rock_kit(drums, first_bar, [0, 1.5, 3], fill=True)
    melody(lead, first_bar, root,
           [(0, 24 + descent[0], .8, 87),
            (1.5, 24 + descent[1], .8, 83),
            (3, 24 + descent[2], .65, 80)])
    at = (first_bar + 1) * 4
    for beat, duration, velocity in [(0, 1.3, 102), (2, 1.78, 96)]:
        power(left, at + beat, root, .43, velocity)
        power(right, at + beat + .013, root, .41, velocity - 5)
        power(open_g, at + beat, root, duration, velocity)
        note(bass, at + beat, root - 12, duration, velocity + 5)
        note(drums, at + beat, 36, .16, velocity + 4)
    note(lead, at, root + 24, 3.72, 88)
    note(drums, at, 49, .8, 88)
    note(drums, at + 2, 38, .17, 103)


def iron_teeth():
    s = score('Iron Teeth', 168, 32, .83)
    s['provenance'] = PROVENANCE
    s['sections'] = [(0, 'Ignition / picked engine'), (4, 'Iron Teeth refrain'),
                     (12, 'High road / answering theme'),
                     (20, 'Half-time pressure'), (24, 'Refrain returns'),
                     (30, 'Descending answer / tonic ending')]
    parts = band(s)
    left, right, open_g, bass, lead, drums = parts
    a = [
        [(0, 0, .19), (.5, 0, .17), (.75, 0, .12), (1.25, 7, .31),
         (2, 0, .19), (2.5, 3, .27), (3, 0, .18), (3.5, 10, .27)],
        [(0, 0, .31), (.75, 5, .25), (1.25, 3, .27), (2, 0, .18),
         (2.5, 7, .23), (3, 5, .25), (3.5, 3, .27)],
    ]
    b = [
        [(0, 0, .69), (1, 7, .23), (1.5, 0, .19), (2.25, 0, .2),
         (2.75, 7, .33), (3.5, 0, .25)],
        [(0, 0, .44), (.75, 7, .25), (1.5, 0, .2), (2, 5, .48),
         (3, 7, .27), (3.5, 0, .28)],
    ]
    hook = [
        [(.5, 24, .41, 88), (1.25, 27, .57, 94),
         (2.25, 26, .35, 84), (3, 31, .67, 96)],
        [(0, 29, .57, 89), (.75, 27, .32, 85),
         (1.5, 26, .53, 84), (2.5, 24, 1.12, 94)],
    ]
    answer = [
        [(0, 31, 1.12, 91), (1.5, 34, .59, 95), (2.5, 36, 1.1, 98)],
        [(.25, 34, .57, 89), (1.25, 31, .57, 86),
         (2.25, 29, .43, 85), (3, 27, .7, 89)],
    ]
    for bar in range(30):
        middle = 12 <= bar < 20
        bridge = 20 <= bar < 24
        root = [43, 45, 40, 47][(bar - 12) // 2] if middle else 40
        if bridge:
            root = [40, 40, 43, 42][bar - 20]
            phrase = [(0, 0, .65), (.75, 0, .2), (2, 0, .62),
                      (3.25, 7, .27), (3.5, 0, .2)]
        else:
            phrase = (b if middle else a)[bar % 2]
        riff(left, right, bar, root, phrase, .93 if bridge else 1)
        low = [(beat, offset, min(.69, duration + .08))
               for beat, offset, duration in phrase]
        bass_line(bass, bar, root, low)
        if bar % 4 == 3 and not bridge:
            note(bass, bar * 4 + 3.8, root - 10, .16, 87)
        rock_kit(drums, bar, [0, .75, 2, 2.5] if not bridge else [0, .75, 2, 3.5],
                 half=bridge, ride=middle or bar >= 24,
                 fill=bar in [3, 11, 19, 23, 29],
                 crash=bar in [0, 4, 12, 20, 24])
        if bar in [0, 4, 12, 16, 20, 24, 28]:
            power(open_g, bar * 4, root, 1.22, 95)
        if middle:
            melody(lead, bar, 40, answer[bar % 2])
        elif bridge:
            melody(lead, bar, 40,
                   [(1, [24, 22, 27, 26][bar - 20], 1.45, 80),
                    (3, 19, .65, 73)])
        elif bar >= 4:
            melody(lead, bar, 40, hook[bar % 2])
        elif bar >= 2:
            melody(lead, bar, 40, [(2, 19, .65, 75), (3, 22, .65, 79)])
    ending(parts, 30, 40, [5, 3, 2])
    return s


def blacksite_stomp():
    s = score('Blacksite Stomp', 124, 24, .82)
    s['provenance'] = PROVENANCE
    s['sections'] = [(0, 'Bass walk / locked groove'), (4, 'Stomp refrain'),
                     (10, 'Open chord answer'), (16, 'Low-room breakdown'),
                     (18, 'Stomp reprise'), (22, 'Three steps home / ending')]
    parts = band(s)
    left, right, open_g, bass, lead, drums = parts
    a = [
        [(0, 0, .36), (.75, 0, .17), (1.5, 3, .29),
         (2.75, 5, .39), (3.5, 3, .25)],
        [(0, 0, .31), (.5, 0, .18), (1.75, 10, .36),
         (2.5, 7, .29), (3.25, 1, .17), (3.5, 0, .31)],
    ]
    bass_a = [
        [(0, 0, .45), (.75, 0, .22), (1.25, 3, .24), (1.75, 7, .35),
         (2.5, 10, .31), (3, 12, .24), (3.5, 10, .33)],
        [(0, 0, .35), (.5, 0, .21), (1.25, 7, .27), (1.75, 10, .31),
         (2.5, 7, .31), (3.25, 1, .16), (3.5, 0, .34)],
    ]
    b = [
        [(0, 0, .88), (1.5, 0, .28), (2.25, 7, .56), (3.5, 0, .27)],
        [(0, 0, .57), (1, 7, .3), (1.75, 0, .28), (2.5, 5, .5),
         (3.5, 7, .27)],
    ]
    hook = [
        [(0, 24, .57, 90), (.75, 27, .31, 88), (1.5, 31, .37, 95),
         (2.25, 29, .52, 88), (3.25, 27, .52, 85)],
        [(.25, 26, .43, 86), (1, 24, .55, 90),
         (2, 22, .31, 80), (2.75, 24, .85, 94)],
    ]
    answer = [
        [(.5, 34, 1.0, 91), (2, 31, .61, 87), (3, 29, .68, 85)],
        [(0, 27, .77, 89), (1.25, 29, .58, 86), (2.25, 31, 1.35, 94)],
    ]
    for bar in range(22):
        middle = 10 <= bar < 16
        bridge = 16 <= bar < 18
        root = [41, 43, 38][(bar - 10) // 2] if middle else 38
        if bridge:
            phrase = [(0, 0, .52), (1.5, 0, .31), (2.75, 1, .22),
                      (3.25, 0, .41)]
            low = [(0, 0, .5), (.75, 12, .26), (1.5, 0, .29),
                   (2, 10, .32), (2.75, 1, .21), (3.25, 0, .46)]
        elif middle:
            phrase = b[bar % 2]
            low = [(0, 0, .65), (1, 7, .29), (1.5, 12, .31),
                   (2.25, 7, .38), (3, 5, .28), (3.5, 7, .31)]
        else:
            phrase, low = a[bar % 2], bass_a[bar % 2]
        riff(left, right, bar, root, phrase, .93 if bridge else 1)
        bass_line(bass, bar, root, low)
        rock_kit(drums, bar,
                 [0, .75, 2.5, 3.5] if bar % 2 == 0 else [0, .5, 1.75, 2.5],
                 half=bridge, ride=middle, ghosts=not bridge,
                 fill=bar in [3, 9, 15, 17, 21],
                 crash=bar in [0, 4, 10, 18])
        if middle or bar in [0, 4, 16, 18]:
            power(open_g, bar * 4, root, 1.27 if middle else .84, 92)
        if middle:
            melody(lead, bar, 38, answer[bar % 2])
        elif bridge:
            melody(lead, bar, 38,
                   [(.5, 19, .66, 78), (2, 22, .41, 82), (3, 24, .7, 88)])
        elif bar >= 4:
            melody(lead, bar, 38, hook[bar % 2])
        elif bar in [1, 3]:
            melody(lead, bar, 38, [(2.25, 22, .46, 76), (3, 24, .71, 83)])
    ending(parts, 22, 38, [7, 3, 1])
    return s


def ash_cathedral():
    s = score('Ash Cathedral', 142, 28, .81)
    s['provenance'] = PROVENANCE
    s['sections'] = [(0, 'Chapel warning / organ motif'), (4, 'Ash refrain'),
                     (12, 'Rising vaults'), (18, 'Half-time procession'),
                     (22, 'Full-band return'), (26, 'Falling arches / ending')]
    parts = band(s, with_organ=True)
    left, right, open_g, bass, lead, drums, organ = parts
    a = [
        [(0, 0, .31), (.75, 7, .28), (1.5, 0, .19), (2, 8, .36),
         (2.75, 7, .28), (3.5, 3, .27)],
        [(0, 0, .2), (.5, 0, .2), (1.25, 10, .32), (2, 8, .32),
         (2.75, 7, .25), (3.25, 1, .18), (3.5, 0, .28)],
    ]
    b = [
        [(0, 0, .72), (1, 7, .28), (1.75, 0, .19),
         (2.25, 0, .23), (3, 7, .54)],
        [(0, 0, .43), (.75, 0, .19), (1.5, 7, .36),
         (2.25, 5, .38), (3.25, 7, .42)],
    ]
    hook = [
        [(0, 24, .77, 89), (1.5, 27, .58, 91), (2.5, 31, 1.12, 96)],
        [(.25, 32, .62, 91), (1.25, 31, .58, 87),
         (2.25, 25, .34, 83), (3, 24, .77, 94)],
    ]
    answer = [
        [(0, 36, .82, 94), (1.25, 39, .58, 96),
         (2.25, 38, .48, 88), (3, 36, .72, 90)],
        [(.25, 34, .62, 87), (1.25, 31, .58, 85),
         (2.25, 35, 1.22, 93)],
    ]
    for bar in range(26):
        middle = 12 <= bar < 18
        bridge = 18 <= bar < 22
        root = [44, 41, 43][(bar - 12) // 2] if middle else 36
        if bridge:
            root = [36, 44, 41, 43][bar - 18]
            phrase = [(0, 0, .82), (1.5, 0, .29), (2.5, 7, .55),
                      (3.5, 0, .28)]
        else:
            phrase = (b if middle else a)[bar % 2]
        riff(left, right, bar, root, phrase, .92 if bridge else 1)
        bass_line(bass, bar, root,
                  [(beat, offset, min(.85, duration + .08))
                   for beat, offset, duration in phrase])
        rock_kit(drums, bar,
                 [0, 1.5, 2.5, 3.5] if bridge else [0, .75, 2, 2.75],
                 half=bridge, ride=middle or bar >= 22,
                 fill=bar in [3, 11, 17, 21, 25],
                 crash=bar in [0, 4, 12, 18, 22])
        if bar in [0, 4, 8, 12, 16, 18, 22]:
            power(open_g, bar * 4, root, 1.32, 94)
        if bar < 4:
            # Organ states the same thematic contour that the lead will answer.
            melody(organ, bar, 36, hook[bar % 2], .91)
        elif bridge:
            third = 4 if root in [43, 44] else 3
            for offset, velocity in [(12, 77), (12 + third, 65), (19, 69)]:
                note(organ, bar * 4, root + offset, 3.65, velocity)
            melody(lead, bar, 36,
                   [(1.5, [31, 32, 29, 35][bar - 18], 1.85, 80)])
        else:
            # Sustained fifths leave room for the written lead above them.
            for offset, velocity in [(12, 68), (19, 61)]:
                note(organ, bar * 4, root + offset, 2.6, velocity)
            melody(lead, bar, 36, answer[bar % 2] if middle else hook[bar % 2])
        if bar % 4 == 3 and not bridge:
            note(bass, bar * 4 + 3.8, root - 1, .16, 82)
    ending(parts, 26, 36, [8, 7, 1])
    for bar, root in [(26, 43), (27, 36)]:
        for offset, velocity in [(12, 70), (19, 61), (24, 65)]:
            note(organ, bar * 4, root + offset, 3.7, velocity)
    return s


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    for slug, make in [('iron-teeth', iron_teeth),
                       ('blacksite-stomp', blacksite_stomp),
                       ('ash-cathedral', ash_cathedral)]:
        write(make(), slug, args.output)


if __name__ == '__main__':
    main()
