#!/usr/bin/env python3
"""Rebuild CHALK's short, unradioed squad speech bank from Kenney's CC0 pack.

Requires ffmpeg and Python's standard library for this offline asset task only.
Download and extract the original archive separately; this script does no network I/O:
  https://opengameart.org/content/voiceover-pack-40-lines
  https://opengameart.org/sites/default/files/Voiceover%20Pack.zip

The pack's License.txt offers CC0 1.0. Credits.txt names the male performer as
Jeffrey M. Smith. We use only complete tactical phrases from the Male directory,
not the pack's kill, victory, scoring, or other game-announcer recordings.
The source page's phrase list and original filenames identify the spoken scripts.

Usage: python tools/prepare-squad-voice.py /path/to/extracted/VoiceoverPack

Keep the natural speed and complete phrase. A gentle 75 Hz high-pass / 7,600 Hz
low-pass removes rumble and excess hiss while retaining a full voice bandwidth
for diegetic local speech. Per-clip gain aims at RMS .15 with a .68 peak ceiling;
no dynamic compression, pitch shift, synthesis, or radio effect is baked in.
Three-millisecond entrance / 12-millisecond exit fades suppress edge clicks.
Every clip has at least 100 ms silence before the next recording in the bank.
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
PEAK = .68
RMS = .15
LINES = [
    ('go', 'go', 'Go!', ['move']),
    ('hurry-up', 'hurry_up', 'Hurry up!', ['move']),
    ('go-go-go', 'war_go_go_go', 'Go, go, go!', ['move', 'smoke']),
    ('hold', 'hold', 'Hold!', ['hold']),
    ('watch-my-back', 'war_watch_my_back', 'Watch my back!', ['cover']),
    ('cover-me', 'war_cover_me', 'Cover me!', ['cover']),
    ('look-out', 'war_look_out', 'Look out!', ['warning', 'flash']),
    ('get-down', 'war_get_down', 'Get down!', ['warning', 'flash']),
    ('reloading', 'war_reloading', 'Reloading!', ['reload']),
    ('medic', 'war_medic', 'Medic!', ['help']),
    ('suppressing-fire', 'war_suppressing_fire', 'Suppressing fire!', ['suppression']),
    ('fire-in-the-hole', 'war_fire_in_the_hole', 'Fire in the hole!', ['frag']),
    ('target-engaged', 'war_target_engaged', 'Target engaged!', ['contact']),
    ('sniper', 'war_sniper', 'Sniper!', ['sniper']),
    ('call-for-backup', 'war_call_for_backup', 'Call for backup!', ['backup']),
]


def decode(path):
    raw = subprocess.check_output([
        'ffmpeg', '-v', 'error', '-i', str(path), '-ac', '1', '-ar', str(RATE),
        '-af', 'highpass=f=75,lowpass=f=7600', '-f', 'f32le', 'pipe:1',
    ])
    samples = array.array('f', raw)
    if sys.byteorder != 'little':
        samples.byteswap()
    if not samples or not all(math.isfinite(value) for value in samples):
        raise ValueError(f'{path}: invalid decoded audio')
    peak = max(abs(value) for value in samples)
    rms = math.sqrt(sum(value * value for value in samples) / len(samples))
    if peak < .01 or not .2 < len(samples) / RATE < 2:
        raise ValueError(f'{path}: expected the complete short spoken recording')
    gain = min(PEAK / peak, RMS / rms)
    start, end = round(RATE * .003), round(RATE * .012)
    return [value * gain * min(1, index / start, (len(samples) - index - 1) / end)
            for index, value in enumerate(samples)]


def build(source, output, catalog):
    bank, lines = [], []
    for name, filename, text, categories in LINES:
        clip = decode(source / 'Male' / f'{filename}.ogg')
        lines.append({'id': name, 'sample': 'squadVoice', 'offset': len(bank) / RATE,
                      'duration': len(clip) / RATE, 'text': text, 'categories': categories})
        bank.extend(clip)
        bank.extend([0.] * round(RATE * .1))
    pcm = array.array('h', (max(-32768, min(32767, round(value * 32767))) for value in bank))
    if sys.byteorder != 'little':
        pcm.byteswap()
    output.mkdir(parents=True, exist_ok=True)
    path = output / 'squad-voice-bank.wav'
    with wave.open(str(path), 'wb') as stream:
        stream.setparams((1, 2, RATE, len(pcm), 'NONE', 'not compressed'))
        stream.writeframes(pcm.tobytes())
    catalog.write_text(
        "// Complete human performances from Kenney's CC0 Voiceover Pack.\n"
        "// Male voice: Jeffrey M. Smith. See audio/CREDITS.txt and tools/prepare-squad-voice.py.\n"
        "// Full bandwidth; local/radio filtering belongs to the live audio graph.\n"
        "import { FIELD_RADIO_LINES } from './field-radio-lines.mjs';\n"
        "export const VOICE_SAMPLE_FILES = Object.freeze({ squadVoice: 'squad-voice-bank.wav', fieldRadio: 'field-radio-bank.wav' });\n"
        "export const VOICE_LINES = Object.freeze([..." + json.dumps(lines, indent=2) +
        ", ...FIELD_RADIO_LINES].map(line => Object.freeze({ ...line, categories: Object.freeze(line.categories) })));\n",
        encoding='utf-8')
    return {'file': path.name, 'lines': len(lines), 'seconds': len(bank) / RATE,
            'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path, help='Extracted original pack directory containing Male/ and License.txt')
    base = Path(__file__).resolve().parents[1] / 'public'
    parser.add_argument('--output', type=Path, default=base / 'audio')
    parser.add_argument('--catalog', type=Path, default=base / 'squad-voice-lines.mjs')
    args = parser.parse_args()
    print(json.dumps(build(args.source, args.output, args.catalog), indent=2))
