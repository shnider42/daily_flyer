#!/usr/bin/env python3
"""Rebuild CHALK's edited report banks from the credited M249 source preview.

Requires ffmpeg, numpy and scipy for this offline asset task only. The game and
Render builds use the checked-in WAVs and require none of these dependencies.
Source: Baelphazoar, '249 single shot.wav', Freesound568007, CC BY4.0.
Full attribution and adaptation notes are in public/audio/CREDITS.txt.
"""
import argparse
import json
import subprocess
import wave
from pathlib import Path

import numpy as np
from scipy import signal

RATE = 44100
SLOT = .6
ONSETS = [8.727667, 10.617063, 11.824292]


def build(source, destination):
    raw = subprocess.check_output([
        'ffmpeg', '-v', 'error', '-i', str(source), '-f', 'f32le',
        '-ac', '1', '-ar', str(RATE), 'pipe:1',
    ])
    original = np.frombuffer(raw, dtype='<f4')
    summaries = {}
    for family, duration in [('rifle', .42), ('saw', .28)]:
        bank = np.zeros(round(RATE * SLOT * len(ONSETS)), dtype=np.float64)
        takes = []
        for index, onset in enumerate(ONSETS):
            start = round((onset - .0015) * RATE)
            length = round(duration * RATE)
            take = original[start:start + length].astype(np.float64).copy()
            if len(take) != length:
                raise ValueError('Source is too short for the credited shot offsets')
            take = signal.sosfilt(signal.butter(2, 55, btype='highpass', fs=RATE, output='sos'), take)
            take = signal.sosfilt(signal.butter(2, 11000, btype='lowpass', fs=RATE, output='sos'), take)
            if family == 'rifle':
                edge = signal.sosfilt(signal.butter(1, 1500, btype='highpass', fs=RATE, output='sos'), take)
                take += edge * .32
            else:
                body = signal.sosfilt(signal.butter(2, [120, 650], btype='bandpass', fs=RATE, output='sos'), take)
                take += body * .18
            time = np.arange(length) / RATE
            body_time = np.maximum(0, time - .002)
            # Retain the recorded body at a useful level after the sharp crack;
            # suppress its distant range wash so the game's geometry owns space.
            take *= 1 + (.65 if family == 'rifle' else .9) * (1 - np.exp(-body_time / .004)) * np.exp(-body_time / .06)
            take *= np.exp(-np.maximum(0, time - .065) / (.13 if family == 'rifle' else .09))
            take *= np.minimum(1, time / .0003)
            take *= np.clip((duration - time) / .028, 0, 1)
            take -= np.mean(take)
            take *= .86 / max(.001, float(np.max(np.abs(take))))
            take[0] = take[-1] = 0
            begin = round(index * SLOT * RATE)
            bank[begin:begin + length] = take
            takes.append({
                'offset': index * SLOT,
                'duration': duration,
                'peak': round(float(np.max(np.abs(take))), 4),
                'rms': round(float(np.sqrt(np.mean(take ** 2))), 4),
                'peakAtMs': round(int(np.argmax(np.abs(take))) / RATE * 1000, 3),
                'tailRms': round(float(np.sqrt(np.mean(take[round(.12 * RATE):] ** 2))), 5),
            })
        path = destination / f'{family}-report-bank.wav'
        destination.mkdir(parents=True, exist_ok=True)
        with wave.open(str(path), 'wb') as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(RATE)
            output.writeframes(np.round(np.clip(bank, -1, 1) * 32767).astype('<i2').tobytes())
        summaries[path.name] = takes
    return summaries


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path, help='Unmodified credited HQ preview MP3')
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'public/audio')
    args = parser.parse_args()
    print(json.dumps(build(args.source, args.output), indent=2))
