#!/usr/bin/env python3
"""Compose and render PGI's two original arcade menu themes.

No soundfont, samples, model service or copyrighted recording is required. The
melodies and harmonic phrases below are authored note by note; all instruments
are synthesized deterministically. NumPy, SciPy and ffmpeg are the only runtime
dependencies. See README.md for the complete reproducible command.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import subprocess
import tempfile

import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 44100
TAIL = 1.65
PROVENANCE = (
    "Original PGI composition and deterministic procedural recording. "
    "All melodies, arrangements and synthesized instruments are authored in "
    "scripts/pgi_music/compose_arcade_themes.py. No third-party recordings or samples."
)
# Note names are deliberately literal: editing one phrase never changes another.
PITCH = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def midi(note: str | int) -> int:
    if isinstance(note, int):
        return note
    accidental = (1 if "#" in note else -1 if "b" in note else 0)
    return (int(note[-1]) + 1) * 12 + PITCH[note[0]] + accidental


def phrase(text: str) -> list[tuple[float, int, float]]:
    """Authoring format: beat:note:held-beats, separated by spaces."""
    return [(float(b), midi(n), float(d)) for b, n, d in (x.split(":") for x in text.split())]


# Four-bar question/answer: the short D–F#–A figure returns as the title hook.
KICKOFF_A = [
    phrase("0:D5:.36 .5:F#5:.36 1:A5:.62 1.75:F#5:.32 2.25:E5:.34 2.75:D5:.58 3.5:A4:.28"),
    phrase("0:E5:.36 .5:C#5:.36 1:E5:.48 1.75:A5:.65 2.5:G5:.32 3:E5:.72"),
    phrase("0:F#5:.36 .5:B5:.6 1.25:A5:.34 1.75:F#5:.52 2.5:D5:.32 3:F#5:.45 3.5:A5:.3"),
    phrase("0:G5:.58 .75:F#5:.43 1.5:E5:.5 2.25:D5:.42 2.75:B4:.32 3.5:D5:.35"),
]
KICKOFF_B = [
    phrase("0:B5:.6 .75:A5:.35 1.25:G5:.45 2:B5:.4 2.5:D6:.6 3.25:B5:.45"),
    phrase("0:C#6:.55 .75:A5:.55 1.5:G5:.4 2.25:E5:.4 3:A5:.75"),
    phrase("0:A5:.4 .5:F#5:.5 1.25:E5:.4 2:C#5:.5 2.75:F#5:.35 3.25:A5:.5"),
    phrase("0:B5:.8 1:A5:.4 1.75:F#5:.6 2.5:D5:.4 3:F#5:.75"),
    phrase("0:B5:.4 .5:D6:.65 1.25:B5:.4 2:A5:.4 2.5:G5:.6 3.25:F#5:.4"),
    phrase("0:E5:.4 .5:A5:.65 1.25:C#6:.4 2:B5:.4 2.5:A5:.5 3.25:E5:.5"),
    phrase("0:F#5:.4 .5:A5:.4 1:D6:.75 2:F#5:.4 2.5:E5:.4 3:D5:.8"),
    phrase("0:E5:.5 .75:C#5:.4 1.5:E5:.5 2.5:A5:.45 3.25:C#6:.45"),
]
KICKOFF_SOLO = [
    phrase("0:G5:.22 .25:B5:.22 .5:D6:.42 1:B5:.22 1.25:A5:.22 1.5:G5:.42 2:D5:.38 2.5:G5:.38 3:B5:.65"),
    phrase("0:A5:.22 .25:C#6:.22 .5:E6:.42 1:C#6:.42 1.5:B5:.42 2:A5:.42 2.5:G5:.42 3:E5:.65"),
    phrase("0:F#5:.3 .5:A5:.3 1:C#6:.3 1.5:A5:.3 2:F#5:.3 2.5:E5:.3 3:C#5:.6"),
    phrase("0:D5:.3 .5:F#5:.3 1:B5:.7 2:A5:.3 2.5:F#5:.3 3:D5:.75"),
]
# The second theme uses a different rhythm, mode, bass groove and lead voice.
TURBO_A = [
    phrase("0:C5:.32 .5:Eb5:.3 1:G5:.3 1.5:G5:.65 2.5:Bb5:.32 3:G5:.3 3.5:Eb5:.3"),
    phrase("0:Eb5:.65 1:C5:.3 1.5:Ab4:.6 2.5:C5:.3 3:Eb5:.3 3.5:G5:.3"),
    phrase("0:G5:.32 .5:Bb5:.3 1:Eb6:.6 2:D6:.32 2.5:Bb5:.3 3:G5:.65"),
    phrase("0:F5:.65 1:D5:.3 1.5:F5:.32 2:Bb5:.6 3:Ab5:.3 3.5:F5:.3"),
]
TURBO_B = [
    phrase("0:Ab5:.6 .75:G5:.35 1.5:F5:.35 2:C6:.7 3:Ab5:.65"),
    phrase("0:C6:.35 .5:Eb6:.6 1.25:C6:.35 2:Bb5:.35 2.5:Ab5:.7 3.5:G5:.28"),
    phrase("0:G5:.35 .5:Eb5:.35 1:C5:.6 2:Eb5:.35 2.5:G5:.35 3:Bb5:.65"),
    phrase("0:B5:.65 1:G5:.35 1.5:D5:.35 2:F5:.65 3:G5:.65"),
    phrase("0:Ab5:.35 .5:C6:.6 1.25:Ab5:.35 2:G5:.35 2.5:F5:.65 3.5:Eb5:.28"),
    phrase("0:Eb5:.35 .5:Ab5:.6 1.25:C6:.35 2:Eb6:.65 3:C6:.65"),
    phrase("0:C6:.65 1:Bb5:.35 1.5:G5:.6 2.5:Eb5:.35 3:C5:.65"),
    phrase("0:D5:.35 .5:F5:.35 1:G5:.6 2:B5:.65 3:D6:.65"),
]
TURBO_SOLO = [
    phrase("0:F5:.2 .25:Ab5:.2 .5:C6:.35 1:Ab5:.35 1.5:G5:.35 2:F5:.35 2.5:C5:.35 3:Ab5:.7"),
    phrase("0:Ab5:.2 .25:Bb5:.2 .5:C6:.35 1:Eb6:.35 1.5:C6:.35 2:Ab5:.35 2.5:G5:.35 3:Eb5:.7"),
    phrase("0:C5:.2 .25:Eb5:.2 .5:G5:.35 1:Bb5:.35 1.5:C6:.65 2.5:Bb5:.35 3:G5:.7"),
    phrase("0:B5:.35 .5:G5:.35 1:F5:.35 1.5:D5:.35 2:G5:.65 3:B5:.65"),
]


def chord(root: str, notes: str) -> tuple[int, list[int]]:
    return midi(root), [midi(n) for n in notes.split()]


D = chord("D2", "D4 F#4 A4 C#5")
AC = chord("C#2", "C#4 E4 A4 B4")
BM = chord("B1", "D4 F#4 A4 B4")
G = chord("G1", "D4 G4 B4 D5")
A = chord("A1", "C#4 E4 A4 B4")
FSM = chord("F#1", "C#4 E4 F#4 A4")
CM = chord("C2", "Eb4 G4 Bb4 C5")
AB = chord("Ab1", "Eb4 Ab4 Bb4 C5")
EB = chord("Eb2", "Eb4 G4 Bb4 D5")
BB = chord("Bb1", "D4 F4 Bb4 C5")
FM = chord("F1", "C4 F4 Ab4 C5")
G7 = chord("G1", "D4 F4 G4 B4")

THEMES = [
    {
        "id": "coin-op-kickoff", "title": "Coin-Op Kickoff", "bpm": 136, "key": "D major", "seed": 198603,
        "description": "An instant pulse-wave hook, bright FM bells, bouncing octave bass and punchy drum-machine backbeats.",
        "a": KICKOFF_A, "b": KICKOFF_B, "solo": KICKOFF_SOLO,
        "a_chords": [D, AC, BM, G], "b_chords": [G, A, FSM, BM, G, A, D, A],
        "lead": "pulse", "drum_style": "dance", "final_chord": D,
    },
    {
        "id": "turbo-touchdown", "title": "Turbo Touchdown", "bpm": 144, "key": "C minor", "seed": 198709,
        "description": "A bold FM-synth refrain, nimble electro bass, sparkling arcade arpeggios and a driving final chorus.",
        "a": TURBO_A, "b": TURBO_B, "solo": TURBO_SOLO,
        "a_chords": [CM, AB, EB, BB], "b_chords": [FM, AB, CM, G7, FM, AB, CM, G7],
        "lead": "fm", "drum_style": "electro", "final_chord": CM,
    },
]
# A recognisable theme arrives at beat zero, with new parts entering over four bars.
SECTIONS = [
    (0, "Title hook", 4, "intro"),
    (4, "Main arcade groove", 8, "a"),
    (12, "Stadium chorus", 8, "b"),
    (20, "Bass and bell break", 4, "break"),
    (24, "Full-power hook", 8, "return"),
    (32, "Bonus-round answer", 4, "solo"),
    (36, "Final hook and victory cadence", 4, "ending"),
]


def filt(y: np.ndarray, kind: str, cutoff: float | tuple[float, float], order: int = 2) -> np.ndarray:
    return signal.sosfilt(signal.butter(order, cutoff, kind, fs=SR, output="sos"), y).astype(np.float32)


def env(length: int, held: float, attack: float, decay: float, sustain: float, release: float) -> np.ndarray:
    t = np.arange(length, dtype=np.float64) / SR
    e = np.minimum(1.0, t / max(attack, 1 / SR))
    e *= sustain + (1 - sustain) * np.exp(-np.maximum(0, t - attack) / decay)
    r = np.clip((held + release - t) / release, 0, 1)
    e *= np.where(t > held, r * r, 1)
    return e.astype(np.float32)


def synth(kind: str, note: int, duration: float, seed: int) -> np.ndarray:
    """Band-limited harmonic voices with separate bass, lead and backing spectra."""
    release = {"bass": .055, "pulse": .10, "fm": .095, "bell": .33, "arp": .085, "stab": .11, "pad": .30}[kind]
    t = np.arange(max(1, int((duration + release) * SR)), dtype=np.float64) / SR
    f = 440.0 * 2 ** ((note - 69) / 12)
    phase = 2 * np.pi * f * t
    rng = np.random.default_rng(seed)
    if kind == "bass":
        wave = np.sin(phase) + .38 * np.sin(2 * phase) + .18 * np.sin(3 * phase) + .06 * np.sin(5 * phase)
        bright = .23 * np.sin(phase + 1.4 * np.sin(phase)) * np.exp(-t / .055)
        return ((np.tanh(1.35 * (wave + bright)) / 1.35) * env(len(t), duration, .004, .10, .63, release)).astype(np.float32)
    if kind in ("pulse", "fm"):
        # Six-harmonic pulse keeps the 8-bit identity without aliasing/raspy highs.
        vib = .003 * np.sin(2 * np.pi * 5.2 * t) * np.minimum(t / .18, 1)
        p = phase + 2 * np.pi * f * .00055 * np.sin(2 * np.pi * 5.2 * t) * np.minimum(t / .18, 1)
        pulse = sum(np.sin(h * p) * (1 if h % 2 else .17) / h ** 1.25 for h in range(1, min(10, int(9000 / f)) + 1))
        fm = np.sin(phase * (1 + vib * .12) + (1.1 if kind == "pulse" else 1.85) * np.sin(2 * phase) * (.22 + .78 * np.exp(-t / .11)))
        wave = .67 * pulse + .33 * fm if kind == "pulse" else .24 * pulse + .76 * fm
        wave += .10 * np.sin(phase * 1.003)
        return (filt(wave, "lowpass", 6500) * env(len(t), duration, .006, .14, .69, release)).astype(np.float32)
    if kind == "bell":
        wave = np.sin(phase + 1.2 * np.sin(phase * 3) * np.exp(-t / .07))
        wave += .18 * np.sin(phase * 2) * np.exp(-t / .11)
        return (wave * np.exp(-t / .28) * env(len(t), duration, .003, .2, .6, release)).astype(np.float32)
    if kind == "arp":
        wave = np.sin(phase) + .32 * np.sin(2 * phase) + .15 * np.sin(3 * phase)
        wave += .12 * np.sin(phase + .7 * np.sin(3 * phase))
        return (wave * env(len(t), duration, .003, .055, .24, release)).astype(np.float32)
    # Chord stabs and pad are deliberately softer than the lead and support its range.
    harmonics = min(8, int(6500 / f))
    wave = np.zeros(len(t))
    for h in range(1, harmonics + 1):
        spread = rng.uniform(-.0013, .0013)
        wave += (np.sin(phase * h * (1 + spread)) + .23 * np.sin(phase * h * .9985)) / h ** 1.5
    if kind == "pad":
        return (filt(wave, "lowpass", 2400) * env(len(t), duration, .10, .25, .66, release)).astype(np.float32)
    return (filt(wave, "lowpass", 4300) * env(len(t), duration, .008, .085, .27, release)).astype(np.float32)


def drum(kind: str, rng: np.random.Generator, variant: int = 0) -> np.ndarray:
    dur = {"kick": .31, "snare": .24, "clap": .22, "hat": .055, "open": .18, "crash": .75, "tom": .24, "tick": .075}[kind]
    t = np.arange(int(dur * SR)) / SR
    noise = rng.standard_normal(len(t))
    if kind == "kick":
        freq = 49 + 103 * np.exp(-t / .020)
        body = np.sin(2 * np.pi * np.cumsum(freq) / SR) * np.exp(-t / .077)
        punch = .20 * np.sin(2 * np.pi * 113 * t) * np.exp(-t / .018)
        click = filt(noise, "bandpass", (1800, 5200)) * np.exp(-t / .0027) * .20
        y = np.tanh((body + punch) * 1.45) * .80 + click
    elif kind == "snare":
        body = (.48 * np.sin(2 * np.pi * 182 * t) + .18 * np.sin(2 * np.pi * 335 * t)) * np.exp(-t / .039)
        wire = filt(noise, "bandpass", (1000, 9500)) * np.exp(-t / .057) * .60
        y = body + wire
        # A compact gated machine-room tail, no large low-frequency wash.
        for ms, gain in [(29, .19), (47, .13), (71, .085)]:
            s = int(ms / 1000 * SR)
            y[s:] += wire[:-s] * gain
    elif kind == "clap":
        burst = sum(np.exp(-np.maximum(t - start, 0) / tau) * (t >= start) for start, tau in [(0, .003), (.009, .003), (.018, .032)])
        y = filt(noise, "bandpass", (900, 6800)) * burst * .46
    elif kind in ("hat", "open", "crash"):
        metal = sum(np.sin(2 * np.pi * f * t) for f in (4221, 5137, 6533, 7249, 8311, 9743)) * .11
        metal += filt(noise, "highpass", 6200) * .43
        tau = {"hat": .012, "open": .060, "crash": .23}[kind]
        y = metal * np.exp(-t / tau)
    elif kind == "tom":
        f = (102 if variant else 143) + 41 * np.exp(-t / .024)
        y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / .070)
        y += filt(noise, "lowpass", 2600) * np.exp(-t / .010) * .10
    else:
        y = np.sin(2 * np.pi * 1160 * t + 1.2 * np.sin(2 * np.pi * 730 * t)) * np.exp(-t / .018)
    y *= np.minimum(t / .0006, 1) * np.clip((dur - t) / .008, 0, 1)
    return y.astype(np.float32)


class Session:
    def __init__(self, theme: dict):
        self.theme = theme
        self.spb = 60 / theme["bpm"]
        self.frames = int((160 * self.spb + TAIL) * SR)
        self.buses = {name: np.zeros((self.frames, 2), np.float32) for name in ("drums", "bass", "lead", "chords", "arp")}
        self.rng = np.random.default_rng(theme["seed"])
        self.kicks: list[float] = []
        self.events: list[dict] = []
        self.counter = 0

    def put(self, bus: str, y: np.ndarray, beat: float, gain: float, pan: float = 0):
        start = round(beat * self.spb * SR)
        if start >= self.frames:
            return
        length = min(len(y), self.frames - start)
        p = (pan + 1) * math.pi / 4
        self.buses[bus][start:start + length, 0] += y[:length] * gain * math.cos(p)
        self.buses[bus][start:start + length, 1] += y[:length] * gain * math.sin(p)

    def note(self, bus: str, kind: str, pitch: int, beat: float, held: float, gain: float, pan: float = 0):
        self.counter += 1
        y = synth(kind, pitch, held * self.spb, self.theme["seed"] + self.counter)
        self.put(bus, y, beat, gain, pan)
        self.events.append({"voice": kind, "bus": bus, "beat": round(beat, 4), "midi": pitch, "held_beats": held, "gain": gain, "pan": pan})

    def hit(self, kind: str, beat: float, gain: float, pan: float = 0, variant: int = 0):
        self.put("drums", drum(kind, self.rng, variant), beat, gain, pan)
        if kind == "kick":
            self.kicks.append(beat)
        self.events.append({"voice": kind, "bus": "drums", "beat": round(beat, 4), "gain": gain, "pan": pan})

    def melody(self, notes, beat: float, gain: float, kind: str | None = None, octave: int = 0):
        for offset, pitch, held in notes:
            self.note("lead", kind or self.theme["lead"], pitch + octave, beat + offset, held, gain)

    def accompaniment(self, bar: int, harmony, section: str, local: int):
        beat = bar * 4
        root, notes = harmony
        is_break = section == "break"
        is_intro = section == "intro"
        chorus = section in ("b", "return", "solo")
        # Bass has its own authored rhythmic hook. No random notes or scale walks.
        if self.theme["drum_style"] == "dance":
            bass_pattern = [(0, 0, .34), (.5, 12, .25), (1, 0, .32), (1.75, 7, .20), (2, 0, .32), (2.5, 12, .25), (3, 0, .34), (3.5, 7, .28)]
        else:
            bass_pattern = [(0, 0, .31), (.5, 0, .18), (.75, 12, .18), (1.5, 0, .30), (2, 0, .31), (2.75, 7, .18), (3.25, 12, .18), (3.5, 0, .31)]
        if is_intro and local == 0:
            bass_pattern = bass_pattern[::2]
        for off, octave, held in bass_pattern:
            self.note("bass", "bass", root + octave, beat + off, held, .43 if chorus else .40)
        # Short syncopated chords leave room for both the melody and bass.
        if not is_break:
            chord_hits = [(.5, .28), (1.5, .28), (2.5, .28), (3.5, .28)] if self.theme["drum_style"] == "dance" else [(0, .33), (1.75, .21), (2.5, .33), (3.5, .21)]
            if is_intro:
                chord_hits = [(0, .5), (2, .5)]
            for off, held in chord_hits:
                for j, n in enumerate(notes):
                    self.note("chords", "stab", n, beat + off, held, .045 if chorus else .036, (j - 1.5) * .20)
        if section in ("b", "return", "ending"):
            for j, n in enumerate(notes[:3]):
                self.note("chords", "pad", n - 12, beat, 3.65, .035, (j - 1) * .34)
        if not is_intro or local >= 2:
            arp_order = [0, 2, 1, 3, 2, 1, 2, 3]
            for step in range(16):
                if is_break and step % 2:
                    continue
                n = notes[arp_order[step % 8]] + (12 if is_break else 0)
                gain = (.044 if is_break else .031) * (1 if step % 4 else 1.18)
                self.note("arp", "bell" if is_break else "arp", n, beat + step / 4, .14 if not is_break else .20, gain, -.42 if step % 2 else .42)

    def drums(self, bar: int, section: str, local: int):
        beat = bar * 4
        is_break = section == "break"
        chorus = section in ("b", "return", "solo")
        if is_break:
            kicks = [0, 2] if local < 2 else [0, 1.5, 2.75]
        elif self.theme["drum_style"] == "dance" or section == "return":
            kicks = [0, 1, 2, 3]
            if local % 4 == 3 and section != "intro":
                kicks += [3.5]
        else:
            kicks = [0, 1.5, 2, 2.75]
            if local % 4 == 3:
                kicks += [3.5]
        for k in kicks:
            self.hit("kick", beat + k, .70 if chorus else .66)
        for k in ([3] if is_break else [1, 3]):
            self.hit("snare", beat + k, .41 if chorus else .36)
            self.hit("clap", beat + k + .014, .32 if chorus else .27, .10)
        # The hats support the pulse, with audible offbeats and gentle ghost hits.
        for k in range(8 if is_break else 16):
            off = k / (2 if is_break else 4)
            if section == "intro" and local == 0 and k % 2:
                continue
            if not is_break and k % 4 == 2 and (chorus or local >= 2):
                self.hit("open", beat + off, .13, .32)
            else:
                gain = .105 if k % 4 == 2 else .065 if k % 2 == 0 else .036
                self.hit("hat", beat + off, gain, .22 if k % 2 else -.18)
        if local == 0 and not is_break:
            self.hit("crash", beat, .17 if section != "intro" else .12, -.30)
        if local % 4 == 3 and section != "break":
            for j, off in enumerate([3.0, 3.25, 3.5, 3.75]):
                self.hit("tom" if j > 1 else "snare", beat + off, .17 + j * .025, (j - 1.5) * .18, j % 2)
        if is_break and local == 3:
            for j, off in enumerate([2, 2.5, 3, 3.25, 3.5, 3.75]):
                self.hit("snare", beat + off, .12 + j * .035, -.06 if j % 2 else .06)

    def arrange(self):
        theme = self.theme
        for start, _name, bars, section in SECTIONS:
            for local in range(bars):
                bar = start + local
                beat = bar * 4
                if section == "b":
                    harmony = theme["b_chords"][local]
                    melody = theme["b"][local]
                elif section == "solo":
                    harmony = theme["b_chords"][local]
                    melody = theme["solo"][local]
                else:
                    harmony = theme["a_chords"][local % 4]
                    melody = theme["a"][local % 4]
                if section == "ending" and local == 3:
                    # Final two beats resolve home rather than cutting off mid-phrase.
                    root, notes = theme["final_chord"]
                    self.hit("kick", beat, .69)
                    self.hit("crash", beat, .19, -.25)
                    self.hit("snare", beat + 1, .35)
                    self.hit("clap", beat + 1.015, .28)
                    self.note("bass", "bass", root, beat, 3.5, .42)
                    for j, n in enumerate(notes[:3]):
                        self.note("chords", "pad", n, beat, 3.4, .070, (j - 1) * .3)
                    tonic = root + 36
                    self.melody([(0, tonic + 7, .45), (.5, tonic + 4 if theme["key"] == "D major" else tonic + 3, .45), (1, tonic, 2.3)], beat, .17)
                    continue
                self.accompaniment(bar, harmony, section, local)
                self.drums(bar, section, local)
                if section == "break":
                    # Half the title theme in a lighter voice, then a drum build.
                    if local in (0, 2):
                        self.melody(theme["a"][local][:4], beat, .10, "bell", -12)
                else:
                    self.melody(melody, beat, .182 if section in ("b", "return") else .168)
                    if section == "return" and local >= 4:
                        # Quiet octave answer, staggered so it does not obscure the hook.
                        answer = [n for j, n in enumerate(melody) if j % 2 == 0]
                        self.melody(answer, beat, .035, "bell", -12)

    def mix(self) -> np.ndarray:
        # A short musical kick duck gives the bass attack headroom, no hard pumping.
        duck = np.ones(self.frames, np.float32)
        recover = np.exp(-np.arange(int(.19 * SR)) / (.061 * SR)).astype(np.float32)
        for beat in self.kicks:
            s = round(beat * self.spb * SR)
            n = min(len(recover), self.frames - s)
            duck[s:s+n] = np.minimum(duck[s:s+n], 1 - .28 * recover[:n])
        for bus in ("bass", "chords", "arp"):
            self.buses[bus] *= duck[:, None]
        # Tempo-locked stereo echoes: audible space without moving the main hook.
        lead = self.buses["lead"]
        echoes = np.zeros_like(lead)
        for beats, gain, flip in [(.75, .13, True), (1.5, .072, False), (2.25, .037, True)]:
            shift = round(beats * self.spb * SR)
            echo = lead[:-shift, ::-1] if flip else lead[:-shift]
            for c in range(2):
                echoes[shift:, c] += filt(echo[:, c], "lowpass", 3400) * gain
        mix = sum(self.buses.values()) + echoes
        # Small bright room, with high-pass sends to keep the low end tight/mono.
        room_source = self.buses["lead"] * .17 + self.buses["chords"] * .25
        for c in range(2):
            room_source[:, c] = filt(filt(room_source[:, c], "highpass", 500), "lowpass", 4800)
        for seconds, gain, swap in [(.041, .35, False), (.067, .29, True), (.101, .21, False), (.139, .15, True), (.211, .09, False), (.297, .055, True)]:
            s = round(seconds * SR)
            mix[s:] += room_source[:-s, ::-1] * gain if swap else room_source[:-s] * gain
        # Remove DC/subsonic energy before gentle tape saturation and mastering.
        for c in range(2):
            mix[:, c] = filt(mix[:, c], "highpass", 28)
        mix = (np.tanh(mix * 1.12) / 1.12).astype(np.float32)
        # End the reverberant tail cleanly; the transport handles song transitions.
        fade = int(.65 * SR)
        mix[-fade:] *= np.linspace(1, 0, fade, dtype=np.float32)[:, None] ** 2
        if not np.isfinite(mix).all():
            raise ValueError("Nonfinite render")
        return mix


def run(command: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(command, capture_output=True, text=True, check=True)


def loudness(path: Path, target: bool = False) -> dict:
    filt = "loudnorm=I=-16:TP=-1.5:LRA=8:print_format=json" if target else "loudnorm=I=-16:TP=-1.5:LRA=8:print_format=json"
    result = run(["ffmpeg", "-hide_banner", "-nostdin", "-i", str(path), "-af", filt, "-f", "null", "-"])
    begin = result.stderr.rfind("{")
    return json.loads(result.stderr[begin:])


def health(mp3: Path, tmp: Path, music_seconds: float) -> dict:
    decoded = tmp / "decoded.wav"
    run(["ffmpeg", "-v", "error", "-y", "-i", str(mp3), "-c:a", "pcm_f32le", str(decoded)])
    rate, samples = wavfile.read(decoded)
    measured = loudness(mp3)
    mono = samples.mean(axis=1)
    hop = int(.05 * rate)
    windows = len(mono) // hop
    rms_windows = np.sqrt(np.mean(mono[:windows * hop].reshape(windows, hop) ** 2, axis=1))
    music_windows = rms_windows[:int(music_seconds / .05) - 6]
    peak = float(np.max(np.abs(samples)))
    rms = float(np.sqrt(np.mean(samples ** 2)))
    correlation = float(np.corrcoef(samples[:, 0], samples[:, 1])[0, 1])
    first_sound = np.flatnonzero(np.max(np.abs(samples), axis=1) > .002)
    checks = {
        "finite": bool(np.isfinite(samples).all()),
        "no_decoded_clipping": bool(peak < .99),
        "duration_60_to_90_seconds": bool(60 <= len(samples) / rate <= 90),
        "hook_starts_immediately": bool(len(first_sound) and first_sound[0] / rate < .02),
        "no_mid_track_silence": bool(np.min(music_windows) > .001),
        "mono_compatible": bool(correlation > .50),
        "target_loudness": bool(-16.7 <= float(measured["input_i"]) <= -15.3),
        "true_peak_headroom": bool(float(measured["input_tp"]) <= -.9),
    }
    if not all(checks.values()):
        raise ValueError(f"Audio validation failed for {mp3.name}: {checks}")
    return {
        "sample_rate": int(rate), "channels": int(samples.shape[1]), "duration_seconds": round(len(samples) / rate, 3),
        "integrated_lufs": float(measured["input_i"]), "true_peak_dbtp": float(measured["input_tp"]),
        "loudness_range_lu": float(measured["input_lra"]),
        "sample_peak_dbfs": round(20 * math.log10(peak), 3), "rms_dbfs": round(20 * math.log10(rms), 3),
        "crest_factor_db": round(20 * math.log10(peak / rms), 3),
        "stereo_correlation": round(correlation, 5), "first_sound_seconds": round(first_sound[0] / rate, 5),
        "quietest_music_window_dbfs": round(20 * math.log10(float(np.min(music_windows))), 2),
        "checks": checks,
        "review_note": "Automated signal and encoded-output checks; these measurements do not claim subjective listening approval.",
    }


def render(theme: dict, output: Path, keep_score: bool):
    session = Session(theme)
    session.arrange()
    mix = session.mix()
    output.mkdir(parents=True, exist_ok=True)
    destination = output / f"{theme['id']}.mp3"
    with tempfile.TemporaryDirectory(prefix="pgi-arcade-") as directory:
        tmp = Path(directory)
        premaster = tmp / "premaster.wav"
        wavfile.write(premaster, SR, mix)
        measured = loudness(premaster, True)
        normalizer = (
            "loudnorm=I=-16:TP=-1.5:LRA=8:linear=true:"
            f"measured_I={measured['input_i']}:measured_TP={measured['input_tp']}:"
            f"measured_LRA={measured['input_lra']}:measured_thresh={measured['input_thresh']}:"
            f"offset={measured['target_offset']}:print_format=summary"
        )
        run(["ffmpeg", "-v", "error", "-y", "-i", str(premaster), "-af", normalizer,
             "-ar", str(SR), "-c:a", "libmp3lame", "-b:a", "160k", "-id3v2_version", "3",
             "-metadata", f"title={theme['title']}", "-metadata", "artist=Pocket Gridiron",
             "-metadata", "album=PGI Arcade Themes", "-metadata", "genre=Electronic",
             str(destination)])
        quality = health(destination, tmp, 160 * session.spb)
    sections = [{"at": round(start * 4 * session.spb, 3), "name": name} for start, name, _, _ in SECTIONS]
    record = {
        "id": theme["id"], "title": theme["title"], "family": "arcade", "bpm": theme["bpm"],
        "key": theme["key"], "description": theme["description"],
        "duration": quality["duration_seconds"], "src": f"./music/{theme['id']}.mp3",
        "sections": sections, "provenance": PROVENANCE,
    }
    metadata = {
        "composition": record, "renderer": "compose_arcade_themes.py", "render_version": 1,
        "seed": theme["seed"], "bars": 40, "meter": "4/4", "event_count": len(session.events),
        "encoding": "44.1 kHz stereo MP3, 160 kbps, two-pass -16 LUFS / -1.5 dBTP master",
        "bytes": destination.stat().st_size,
        "sha256": hashlib.sha256(destination.read_bytes()).hexdigest(),
        "quality": quality,
    }
    (output / f"{theme['id']}.render.json").write_text(json.dumps(metadata, indent=2) + "\n")
    if keep_score:
        (output / f"{theme['id']}.score.json").write_text(json.dumps({"composition": record, "events": session.events}, indent=2) + "\n")
    print(json.dumps({"id": theme["id"], "path": str(destination), "quality": quality}, indent=2), flush=True)
    return record


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="Destination for MP3s and measured render metadata")
    parser.add_argument("--track", choices=[t["id"] for t in THEMES], help="Render only one of the two themes")
    parser.add_argument("--keep-score", action="store_true", help="Also write the complete expanded note/drum event scores")
    parser.add_argument("--catalog-output", type=Path, help="Optional separate JSON with new catalog entries; does not rewrite the game's curated manifest")
    args = parser.parse_args()
    records = [render(t, args.output, args.keep_score) for t in THEMES if not args.track or t["id"] == args.track]
    if args.catalog_output:
        args.catalog_output.parent.mkdir(parents=True, exist_ok=True)
        args.catalog_output.write_text(json.dumps({"tracks": records}, indent=2) + "\n")


if __name__ == "__main__":
    main()
