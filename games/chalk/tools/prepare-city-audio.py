#!/usr/bin/env python3
"""Rebuild CHALK's quiet footstep banks and short dog effect from CC0 sources.

Requires ffmpeg and Python's standard library for this offline asset task only.
The game and deployment use the checked-in WAVs, without these dependencies.

Inputs (download and extract separately; this script performs no network access):
  Fantozzi, "Fantozzi's Footsteps (Grass/Sand & Stone)", submitted by qubodup:
  https://opengameart.org/content/fantozzis-footsteps-grasssand-stone
  https://opengameart.org/sites/default/files/Fantozzi-footsteps.7z
  Brandon Morris, "Dog barking (Mono)", submitted by HaelDB:
  https://opengameart.org/content/dog-barking-mono
  https://opengameart.org/sites/default/files/dog_barking_mono.wav
Both sources explicitly offer CC0 1.0. Select that license for these adaptations.

Usage:
  python tools/prepare-city-audio.py /path/Fantozzi-footsteps/flac /path/dog_barking_mono.wav

The six .5-second slots alternate L1,R1,L2,R2,L3,R3. Shared bank gain retains
natural differences between takes. No compression, pitch shift or synthesized
layers are baked in. The dog is a short generic animal cue, not a continuous
loop or a recording claimed to come from 1993 Mogadishu.
"""
import argparse
import array
import hashlib
import json
import subprocess
import sys
import wave
from pathlib import Path

RATE = 22050
SLOT = .5
PEAK = .68


def decode(path, filters):
    raw = subprocess.check_output([
        'ffmpeg', '-v', 'error', '-i', str(path), '-ac', '1', '-ar', str(RATE),
        '-af', filters, '-f', 'f32le', 'pipe:1',
    ])
    data = array.array('f', raw)
    if sys.byteorder != 'little':
        data.byteswap()
    if not data or not max(abs(value) for value in data):
        raise ValueError(f'{path} contains no audible PCM')
    return data


def faded(samples, gain, fade_in=.002, fade_out=.016):
    start = max(1, round(RATE * fade_in))
    end = max(1, round(RATE * fade_out))
    length = len(samples)
    return [value * gain * min(1, index / start, (length - index - 1) / end)
            for index, value in enumerate(samples)]


def save(destination, name, samples):
    values = array.array('h', (max(-32768, min(32767, round(value * 32767))) for value in samples))
    peak = max(abs(value) for value in values) / 32767
    if sys.byteorder != 'little':
        values.byteswap()
    destination.mkdir(parents=True, exist_ok=True)
    path = destination / name
    with wave.open(str(path), 'wb') as output:
        output.setparams((1, 2, RATE, len(values), 'NONE', 'not compressed'))
        output.writeframes(values.tobytes())
    return {'file': name, 'seconds': len(values) / RATE, 'bytes': path.stat().st_size,
            'peak': round(peak, 4), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}


def build(footstep_directory, dog_source, destination):
    results = []
    for material, label in [('Sand', 'dirt'), ('Stone', 'stone')]:
        names = [f'Fantozzi-{material}{side}{take}.flac' for take in [1, 2, 3] for side in ['L', 'R']]
        clips = [decode(footstep_directory / name, 'highpass=f=80,lowpass=f=5400') for name in names]
        gain = PEAK / max(abs(value) for clip in clips for value in clip)
        bank = []
        for clip in clips:
            if len(clip) >= round(RATE * SLOT):
                raise ValueError('Footstep source exceeds its .5-second slot; verify the original source files')
            bank.extend(faded(clip, gain))
            bank.extend([0.0] * (round(RATE * SLOT) - len(clip)))
        result = save(destination, f'footsteps-{label}-bank.wav', bank)
        result['slots'] = [{'offset': index * SLOT, 'duration': SLOT, 'source': name}
                           for index, name in enumerate(names)]
        results.append(result)

    dog = decode(dog_source, 'highpass=f=180,lowpass=f=6000')
    if not 2 <= len(dog) / RATE <= 2.1:
        raise ValueError('Expected the complete 2.04-second original mono dog fragment')
    results.append(save(destination, 'ambient-dog.wav', faded(dog, PEAK / max(abs(value) for value in dog), .012, .025)))
    return results


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('footstep_directory', type=Path, help='Extracted original Fantozzi-footsteps/flac directory')
    parser.add_argument('dog_source', type=Path, help='Unmodified original dog_barking_mono.wav')
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'public/audio')
    args = parser.parse_args()
    print(json.dumps(build(args.footstep_directory, args.dog_source, args.output), indent=2))
