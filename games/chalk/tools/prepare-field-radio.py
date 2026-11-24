#!/usr/bin/env python3
"""Prepare CHALK's complete radio performances from VoiceBosch's Radio Soldier.

Source: https://opengameart.org/content/radio-soldier-video-game-announcer
License: CC BY-SA 4.0, https://creativecommons.org/licenses/by-sa/4.0/
The adapted bank remains CC BY-SA 4.0; see public/audio/CREDITS.txt.
Download the named original WAV files separately into the input directory.
Usage: python tools/prepare-field-radio.py /path/to/original/wavs

These sources already have radio treatment. The game uses them only as
dispatch traffic, never as natural nearby voices. Complete original takes at
natural speed, mono 22.05 kHz PCM16, shared headroom target RMS .12 / peak .6,
3ms/15ms edge fades, 120ms silent separators. No speech generation, altered
words, pitch shift, or dynamic compression.
"""
import argparse
import array
import hashlib
import json
import math
import subprocess
import sys
import wave
from pathlib import Path

RATE = 22050
LINES = [
    ('six', '01._watch_your_six.wav', 'Watch your six.'),
    ('sniper', '03._take_out_that_sniper.wav', 'Take out that sniper.'),
    ('extraction', '06._get_to_the_extraction_point.wav', 'Get to the extraction point.'),
    ('ammo', '11._watch_your_ammo.wav', 'Watch your ammo.'),
    ('recovered', '13._good_work_soldier.wav', 'Good work, soldier.'),
    ('moving', '16._enemy_on_the_move.wav', 'Enemy on the move.'),
    ('perimeter', '22._secure_the_perimeter.wav', 'Secure the perimeter.'),
    ('hold', '23._hold_your_position.wav', 'Hold your position.'),
    ('attack', '25._were_under_attack.wav', "We're under attack."),
    ('arrival', '26._entering_hostile_territory.wav', 'Entering hostile territory.'),
]


def build(source):
    base = Path(__file__).resolve().parents[1] / 'public'
    bank, lines = [], []
    for name, filename, text in LINES:
        raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(source / filename),
                                       '-ac', '1', '-ar', str(RATE), '-f', 'f32le', 'pipe:1'])
        samples = array.array('f', raw)
        if sys.byteorder != 'little': samples.byteswap()
        assert 1 < len(samples) / RATE < 5 and all(math.isfinite(v) for v in samples)
        peak = max(abs(v) for v in samples)
        rms = math.sqrt(sum(v * v for v in samples) / len(samples))
        gain = min(.6 / peak, .12 / rms)
        clip = [v * gain * min(1, i / (RATE * .003), (len(samples) - i - 1) / (RATE * .015))
                for i, v in enumerate(samples)]
        lines.append({'id': f'dispatch-{name}', 'sample': 'fieldRadio', 'offset': len(bank) / RATE,
                      'duration': len(clip) / RATE, 'text': text, 'categories': [f'dispatch_{name}'],
                      'radioOnly': True})
        bank.extend(clip); bank.extend([0.] * round(RATE * .12))
    pcm = array.array('h', (round(v * 32767) for v in bank))
    if sys.byteorder != 'little': pcm.byteswap()
    path = base / 'audio/field-radio-bank.wav'
    with wave.open(str(path), 'wb') as stream:
        stream.setparams((1, 2, RATE, len(pcm), 'NONE', 'not compressed')); stream.writeframes(pcm.tobytes())
    (base / 'field-radio-lines.mjs').write_text(
        '// Human radio performances by VoiceBosch, adapted under CC BY-SA 4.0.\n'
        '// This catalog and field-radio-bank.wav retain CC BY-SA 4.0. See audio/CREDITS.txt.\n'
        'export const FIELD_RADIO_LINES = Object.freeze(' + json.dumps(lines, indent=2) +
        '.map(line => Object.freeze({ ...line, categories: Object.freeze(line.categories) })));\n')
    return {'lines': len(lines), 'seconds': len(bank) / RATE, 'bytes': path.stat().st_size,
            'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    print(json.dumps(build(parser.parse_args().source), indent=2))
