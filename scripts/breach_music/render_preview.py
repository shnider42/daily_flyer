#!/usr/bin/env python3
"""Render the Breach score with a small entirely procedural retro rock synth.

No recordings, sample banks, copied patches, or third-party musical material.
Usage: python render_preview.py score.json output_stem
Score timing is in quarter-note beats; pan is -1..1 or MIDI 0..127.
"""
from __future__ import annotations
import argparse
import json
import math
from pathlib import Path
import subprocess
import time

import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 44100
RNG = np.random.default_rng(816207)


def filt(y, kind, cutoff, order=2):
    return signal.sosfilt(signal.butter(order, cutoff, btype=kind, fs=SR, output='sos'), y)


def release_envelope(n, duration, attack=.002, release=.035):
    t = np.arange(n) / SR
    env = np.minimum(t / max(attack, 1 / SR), 1)
    env *= np.minimum(np.maximum((duration - t) / max(release, 1 / SR), 0), 1)
    return env


def osc_harmonics(t, freq, rolloff=1.2, bright=18, detune=0., decay=None):
    """Band-limited saw-like pluck with fresh deterministic per-note pick phase."""
    phase = RNG.uniform(-.12, .12)
    y = np.zeros(len(t), dtype=np.float64)
    for h in range(1, min(bright, int((SR / 2 - 100) / freq)) + 1):
        # A short pick-position comb gives individual strings a woody bite.
        amp = (1 / h ** rolloff) * (.75 + .25 * math.cos(h * .41))
        envelope = np.exp(-t * h * decay) if decay else 1
        y += amp * np.sin(2 * np.pi * freq * h * (1 + detune) * t + phase) * envelope
    return y


def guitar(pitch, duration, velocity, muted):
    # Chugs stop at their written note-off. Ringing notes have a small release.
    dur = max(.04, duration + (.04 if muted else .11))
    t = np.arange(int(dur * SR)) / SR
    f = 440 * 2 ** ((pitch - 69) / 12)
    p = osc_harmonics(t, f, 1.12, 24, -.00065, 3.2 if muted else .5)
    p += .62 * osc_harmonics(t, f, 1.2, 20, .00075, 3.8 if muted else .6)
    p *= .62
    # A tiny broad-band pick scrape stays below the pitched sound.
    pick = filt(RNG.standard_normal(len(t)), 'highpass', 1700) * np.exp(-t / .006)
    p += .05 * pick
    env = np.exp(-t / (.135 if muted else 1.05))
    if muted:
        env *= 1 + .25 * np.exp(-t / .012)
    p = np.tanh(3.7 * p * env)
    p = filt(p, 'highpass', 90, 2)
    p = filt(p, 'lowpass', 3850 if muted else 4650, 3)
    # Mild cabinet/pickup coloration; original filter, not an impulse sample.
    p = signal.lfilter([1., 0., 0., 0., -.2], [1.], p)
    p *= release_envelope(len(t), dur, .0012, .03 if muted else .085)
    return p * .36 * (velocity / 127) ** .7


def clean_guitar(pitch, duration, velocity):
    dur = max(.1, duration + .3)
    t = np.arange(int(dur * SR)) / SR
    f = 440 * 2 ** ((pitch - 69) / 12)
    p = osc_harmonics(t, f, 1.65, 14, decay=.8)
    p = filt(p, 'lowpass', 4800, 2)
    p *= np.exp(-t / 1.15) * release_envelope(len(t), dur, .003, .25)
    return p * .48 * (velocity / 127)


def bass(pitch, duration, velocity):
    dur = max(.05, duration + .055)
    t = np.arange(int(dur * SR)) / SR
    f = 440 * 2 ** ((pitch - 69) / 12)
    phase = 2 * np.pi * f * t
    p = .78 * np.sin(phase) + .29 * np.sin(2 * phase) + .1 * np.sin(3 * phase)
    p += .08 * np.sin(5 * phase) * np.exp(-t / .11)
    p = np.tanh(1.4 * p) / 1.15
    p = filt(p, 'lowpass', 1200, 2)
    p *= release_envelope(len(t), dur, .002, .05) * np.exp(-t / 1.8)
    return p * .62 * (velocity / 127) ** .7


def pad(pitch, duration, velocity, lead=False):
    dur = max(.15, duration + (.22 if lead else .7))
    t = np.arange(int(dur * SR)) / SR
    f = 440 * 2 ** ((pitch - 69) / 12)
    p = np.zeros(len(t))
    for mult, level, detune in [(1., .65, -.001), (1., .45, .0015), (2., .16, .0008), (3., .07, -.0015)]:
        p += level * np.sin(2 * np.pi * f * mult * (1 + detune) * t + .005 * np.sin(t * 3.1))
    if lead:
        p += .17 * osc_harmonics(t, f, 1.5, 8, decay=.4)
        p = filt(np.tanh(p * 1.8), 'lowpass', 2600, 2)
    else:
        p = filt(p, 'lowpass', 1700, 2)
    p *= release_envelope(len(t), dur, .025 if lead else .38, .2 if lead else .65)
    return p * (.25 if lead else .23) * (velocity / 127)


def drum(pitch, duration, velocity):
    if pitch in [35, 36]:
        dur = .38
        t = np.arange(int(dur * SR)) / SR
        # Sweep reaches 49 Hz quickly, without an exaggerated electronic bend.
        phase = 2 * np.pi * (48 * t + 95 * .013 * (1 - np.exp(-t / .013)))
        p = np.sin(phase) * np.exp(-t / .105)
        p += .19 * filt(RNG.standard_normal(len(t)), 'highpass', 2500) * np.exp(-t / .006)
        p += .14 * np.sin(2 * phase) * np.exp(-t / .023)
        p = np.tanh(p * 1.35) * .92
    elif pitch in [38, 40]:
        dur = .34
        t = np.arange(int(dur * SR)) / SR
        noise = RNG.standard_normal(len(t))
        body = np.sin(2 * np.pi * 183 * t) * np.exp(-t / .055)
        body += .35 * np.sin(2 * np.pi * 329 * t) * np.exp(-t / .038)
        wire = filt(noise, 'bandpass', [1100, 9500], 2)
        p = .62 * body + .48 * wire * np.exp(-t / .075)
        p += .12 * filt(noise, 'highpass', 4200) * np.exp(-t / .008)
        p = np.tanh(p * 1.1) * .79
    elif pitch in [42, 44, 46, 49, 51, 52, 55, 57, 59]:
        crash = pitch in [49, 52, 55, 57]
        ride = pitch in [51, 59]
        dur = 1.45 if crash else (.65 if ride else (.44 if pitch == 46 else .095))
        t = np.arange(int(dur * SR)) / SR
        noise = filt(RNG.standard_normal(len(t)), 'highpass', 4000 if not crash else 2600, 3)
        metal = np.zeros(len(t))
        for freq, level in [(4143, .13), (5713, .09), (7431, .06), (9721, .04)]:
            metal += level * np.sin(2 * np.pi * freq * t + RNG.uniform(0, 6.28))
        decay = .35 if crash else (.16 if ride else (.11 if pitch == 46 else .025))
        p = (noise * .28 + metal) * np.exp(-t / decay)
        p *= .65 if crash else (.43 if ride else .32)
    elif pitch in [41, 43, 45, 47, 48, 50]:
        dur = .46
        t = np.arange(int(dur * SR)) / SR
        f = {41:88,43:98,45:113,47:135,48:151,50:174}[pitch]
        phase = 2 * np.pi * (f * t + 32 * .025 * (1 - np.exp(-t / .025)))
        p = (.8 * np.sin(phase) + .15 * np.sin(phase * 1.61)) * np.exp(-t / .12)
        p += .15 * filt(RNG.standard_normal(len(t)), 'lowpass', 3000) * np.exp(-t / .017)
        p *= .62
    else:
        dur = .14
        t = np.arange(int(dur * SR)) / SR
        p = .2 * RNG.standard_normal(len(t)) * np.exp(-t / .025)
    p *= release_envelope(len(t), dur, .0005, .02)
    return p * (velocity / 127) ** .8


def equal_power(pan):
    if abs(pan) > 1:
        pan = (pan - 64) / 63
    pan = float(np.clip(pan, -1, 1))
    return math.cos((pan + 1) * math.pi / 4), math.sin((pan + 1) * math.pi / 4)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('score')
    parser.add_argument('output_stem')
    parser.add_argument('--tail', type=float, default=1.8)
    args = parser.parse_args()
    started = time.time()
    score = json.loads(Path(args.score).read_text())
    bpm = float(score['bpm'])
    beat = 60 / bpm
    loop_s = score['bars'] * score.get('beats_per_bar', 4) * beat
    length = int((loop_s + args.tail) * SR)
    mix = np.zeros((length, 2), np.float64)
    room = np.zeros_like(mix)
    instrument_notes = {}
    for track_idx, track in enumerate(score['tracks']):
        ins = track.get('instrument', 'guitar_muted')
        vol = float(track.get('volume', .7))
        if vol > 1:
            vol /= 127
        left, right = equal_power(float(track.get('pan', 0)))
        count = 0
        for note in track['notes']:
            start = float(note['start']) * beat
            duration = float(note['duration']) * beat
            pitch, velocity = int(note['pitch']), int(note['velocity'])
            if not 0 <= pitch <= 127 or not 0 < velocity <= 127 or duration <= 0 or start < 0:
                raise ValueError(f'Invalid note in {track.get("name", track_idx)}: {note}')
            if ins == 'drums' or int(track.get('channel', -1)) == 9:
                wave = drum(pitch, duration, velocity)
                # Spread cymbals/toms a little even on a single drum MIDI channel.
                drum_pan = {42:.28,46:.28,49:-.42,51:.45,45:-.23,47:0.,50:.23}.get(pitch, 0.)
                lp, rp = equal_power(drum_pan)
            elif ins in ['guitar_muted', 'guitar_open']:
                wave = guitar(pitch, duration, velocity, ins == 'guitar_muted')
                lp, rp = left, right
            elif ins == 'clean':
                wave = clean_guitar(pitch, duration, velocity)
                lp, rp = left, right
            elif ins == 'bass':
                wave = bass(pitch, duration, velocity)
                lp, rp = left, right
            else:
                wave = pad(pitch, duration, velocity, ins == 'lead')
                lp, rp = left, right
            index = round(start * SR)
            n = min(len(wave), length - index)
            if n <= 0:
                continue
            y = wave[:n] * vol
            mix[index:index+n, 0] += y * lp
            mix[index:index+n, 1] += y * rp
            send = .11 if ins in ['atmosphere','lead'] else .055 if ins == 'guitar_open' else .018
            if ins == 'drums':
                send = .075 if pitch == 38 else .015
            room[index:index+n, 0] += y * lp * send
            room[index:index+n, 1] += y * rp * send
            count += 1
        instrument_notes[track.get('name', str(track_idx))] = count
    # Short, decorrelated room. No long wash to obscure attacks or gunfire.
    for delay_s, gain, swap in [(.037,.52,True),(.061,.4,False),(.089,.28,True),(.127,.19,False),(.181,.1,True)]:
        d = int(delay_s * SR)
        r = room[:-d, ::-1] if swap else room[:-d]
        mix[d:] += r * gain
    mix = filt(mix.T, 'highpass', 28, 2).T
    # Fast, gentle whole-mix soft saturation and peak normalization.
    raw_peak = float(np.max(np.abs(mix)))
    mix = np.tanh(mix * .78)
    peak = float(np.max(np.abs(mix)))
    target = 10 ** (-1.0 / 20)
    mix *= target / max(peak, 1e-8) * float(score.get("preview_gain", 1.0))
    # Only final release tail fades: the written loop attack stays clean.
    fade_n = min(int(.15 * SR), len(mix))
    mix[-fade_n:] *= np.linspace(1, 0, fade_n)[:,None]
    pcm = np.int16(np.clip(mix, -1, 1) * 32767)
    stem = Path(args.output_stem)
    stem.parent.mkdir(parents=True, exist_ok=True)
    wav_path = stem.with_suffix('.wav')
    mp3_path = stem.with_suffix('.mp3')
    wavfile.write(wav_path, SR, pcm)
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(wav_path),'-codec:a','libmp3lame','-b:a','192k','-metadata','title=' + score.get('title', 'Breach original cue'),'-metadata','artist=Breach procedural music sketch',str(mp3_path)], check=True)
    stats = {
        'sample_rate': SR, 'channels': 2, 'loop_seconds': round(loop_s, 4),
        'preview_seconds': round(length / SR, 4), 'peak_dbfs': round(20 * math.log10(np.max(np.abs(mix)) + 1e-12), 3),
        'rms_dbfs': round(20 * math.log10(np.sqrt(np.mean(mix**2)) + 1e-12), 3),
        'pre_master_peak': round(raw_peak, 4), 'notes_per_track': instrument_notes,
        'wav': str(wav_path), 'mp3': str(mp3_path), 'render_seconds': round(time.time() - started, 2),
        'audio_source': 'Original procedural oscillators and noise; no third-party samples.'
    }
    stem.with_suffix('.render.json').write_text(json.dumps(stats, indent=2) + '\n')
    print(json.dumps(stats, indent=2))


if __name__ == '__main__':
    main()
