"""Compose an original retro-metal Breach sketch and encode a type-1 GM MIDI.

No existing song, MIDI, recording, sample, or transcribed riff is used as input.
Beat positions are absolute quarter notes. Renderer consumes the same score.
"""
import json
import struct
import sys
from pathlib import Path

OUT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path.cwd()
OUT.mkdir(parents=True, exist_ok=True)
BPM, BARS, PPQ = 104, 16, 480
tracks = []

def track(name, channel, program, instrument, pan, volume):
    t = dict(name=name, channel=channel, program=program,
             instrument=instrument, pan=pan, volume=volume, notes=[])
    tracks.append(t)
    return t

def note(t, start, duration, pitch, velocity=90):
    assert start >= 0 and duration > 0 and start + duration <= BARS * 4 + .001
    t['notes'].append(dict(start=round(start, 5), duration=round(duration, 5),
                           pitch=pitch, velocity=velocity))

def chord(t, start, duration, root, velocity, octave=False):
    note(t, start, duration, root, velocity)
    note(t, start + .008, duration - .008, root + 7, max(30, velocity - 12))
    if octave:
        note(t, start + .014, duration - .014, root + 12, max(30, velocity - 18))

left = track('Muted rhythm L', 0, 28, 'guitar_muted', -.70, .82)
right = track('Muted rhythm R', 1, 28, 'guitar_muted', .70, .77)
open_g = track('Open power-chord accents', 2, 30, 'guitar_open', -.12, .58)
bass = track('Picked bass', 3, 34, 'bass', 0, .84)
pad = track('Listening-room drone', 4, 92, 'atmosphere', .20, .26)
lead = track('Signal motif', 5, 30, 'lead', .27, .32)
drums = track('Rock kit', 9, 0, 'drums', 0, .85)

# A four-bar phrase with spaced, unequal accents; its harmony is D / F / Eb.
# Tuple fields: beat, offset from D2, duration. No transcription input.
riff = [
    [(0,0,.20),(.375,0,.12),(.75,0,.16),(1.5,3,.30),(2,0,.16),
     (2.25,0,.13),(3,1,.30),(3.625,0,.12)],
    [(0,0,.23),(.5,0,.17),(1.25,5,.33),(2.25,3,.26),(3,1,.63)],
    [(0,3,.26),(.75,0,.15),(1,0,.15),(1.75,1,.28),(2.5,0,.17),(3.25,5,.34)],
    [(.25,1,.33),(1,0,.17),(1.375,0,.13),(2,1,.28),(2.75,3,.24),(3.5,0,.30)],
]

for bar in range(BARS):
    base = bar * 4
    pattern = riff[bar % 4]
    # Start as a stalking groove, then fill in the missing attacks.
    if bar < 4:
        pattern = [v for i, v in enumerate(pattern) if i % 2 == 0]
    # The final quarter takes a higher harmonic turn before landing on D.
    if 12 <= bar < 15:
        roots = [46, 43, 39]  # Bb2, G2, Eb2
        root = roots[bar - 12]
        pattern = [(0, root-38, .42),(.875,0,.16),(1.5,0,.20),
                   (2,root-38,.36),(2.75,0,.18),(3.5,1,.25)]
    if bar == 15:
        pattern = [(0,1,.30),(.75,1,.22),(1.5,0,.18),(2.25,0,.18),(3,0,.44)]
    for i, (pos, delta, duration) in enumerate(pattern):
        root = 38 + delta
        vel = 104 if pos % 1 == 0 else 88 + (i % 3) * 4
        chord(left, base+pos, duration, root, vel)
        chord(right, base+pos+.012, duration*.94, root, vel-4)
        note(bass, base+pos, min(duration+.10, .72), root-12, vel-5)
        # Kick follows selected riff attacks, without obscuring every note.
        if i % 2 == 0 or pos == 0:
            note(drums, base+pos, .15, 36, 105 if i == 0 else 94)
    if bar >= 4:
        for beat in (1,3):
            note(drums, base+beat, .15, 38, 113 if beat==3 else 108)
        for h in range(8):
            pitch = 46 if h == 7 and bar % 4 == 2 else 42
            note(drums, base+h*.5, .12 if pitch==42 else .28, pitch,
                 72 if h % 2==0 else 54)
        if bar in (4,8,12):
            note(drums, base, .65, 49, 95)
    else:
        note(drums, base+2, .15, 38, 88)
        for beat in (0,1,2,3):
            note(drums, base+beat, .1, 42, 45 if beat % 2 else 61)
    if bar in (7,11,15):
        for pos, pitch, vel in [(2.75,50,88),(3.25,47,97),(3.75,45,106)]:
            note(drums, base+pos, .18, pitch, vel)

# Low, unresolved colour: very quiet, with upper Eb rubbing against D.
for base in (0,16,32,48):
    note(pad, base, 15.6, 50, 53)
    note(pad, base+.25, 15.1, 57, 36)
    note(pad, base+8, 7.5, 63, 30)

for bar, root in [(4,38),(6,41),(8,38),(10,41),(12,46),(13,43),(14,39)]:
    chord(open_g, bar*4, 1.12 if bar<12 else .84, root, 92, octave=True)
    if bar in (8,10):
        chord(open_g, bar*4+2.5, .72, 39 if bar==8 else 43, 81, octave=True)

# A new, restrained signal-like melody appears only in the second half.
for start, pitch, length in [(33.5,74,.43),(34.25,69,.53),(35.25,75,.30),
                             (37,72,.70),(38.5,65,.44),(40.75,77,.52),
                             (42,75,.66),(43.25,74,.42),(46.25,69,.63)]:
    note(lead, start, length, pitch, 69)

for t in tracks:
    t['notes'].sort(key=lambda n:(n['start'],n['pitch']))
    # MIDI note-offs address channel+pitch, so retriggers must not overlap.
    previous = {}
    for n in t['notes']:
        prior = previous.get(n['pitch'])
        if prior and prior['start'] + prior['duration'] > n['start']:
            prior['duration'] = round(n['start'] - prior['start'] - .012, 5)
        previous[n['pitch']] = n

score = dict(title='Containment Pulse', subtitle='Breach original MIDI concept',
             bpm=BPM, bars=BARS, beats_per_bar=4, ppq=PPQ,
             loop_start_beat=0, loop_end_beat=BARS*4, tracks=tracks)
(OUT/'score.json').write_text(json.dumps(score, indent=2))

def vlq(number):
    number = int(number)
    data = [number & 127]
    while number >> 7:
        number >>= 7
        data.insert(0, (number & 127) | 128)
    return bytes(data)

def meta(kind, data):
    if isinstance(data,str): data=data.encode('utf-8')
    return bytes([255,kind])+vlq(len(data))+data

def chunk(events, end_tick=BARS*4*PPQ):
    result, last = bytearray(), 0
    for tick,priority,data in sorted(events,key=lambda e:(e[0],e[1])):
        result.extend(vlq(tick-last))
        result.extend(data)
        last=tick
    result.extend(vlq(end_tick-last))
    result.extend(b'\xff\x2f\x00')
    return b'MTrk'+struct.pack('>I',len(result))+result

tempo = round(60000000/BPM)
conductor=[(0,0,meta(3,'Containment Pulse — original Breach sketch')),
           (0,1,meta(81,tempo.to_bytes(3,'big'))),
           (0,2,meta(88,bytes([4,2,24,8]))),
           (0,3,meta(89,bytes([255,1]))),  # D minor; Eb is added colour
           (0,4,meta(6,'LOOP_START')),
           (16*PPQ,4,meta(6,'Combat entry')),
           (32*PPQ,4,meta(6,'Signal / full groove')),
           (48*PPQ,4,meta(6,'Containment turn')),
           (64*PPQ,4,meta(6,'LOOP_END'))]
chunks=[chunk(conductor)]
for t in tracks:
    ch=t['channel']
    events=[(0,0,meta(3,t['name'])),
            (0,1,bytes([0xC0|ch,t['program']])),
            (0,2,bytes([0xB0|ch,7,min(127,round(t['volume']*115))])),
            (0,3,bytes([0xB0|ch,10,round((t['pan']+1)*63.5)])),
            (0,4,bytes([0xB0|ch,91,16 if ch!=9 else 8]))]
    for n in t['notes']:
        events += [(round(n['start']*PPQ),10,bytes([0x90|ch,n['pitch'],n['velocity']])),
                   (round((n['start']+n['duration'])*PPQ),5,bytes([0x80|ch,n['pitch'],0]))]
    events.append((64*PPQ,20,bytes([0xB0|ch,123,0])))
    chunks.append(chunk(events))
midi=b'MThd'+struct.pack('>IHHH',6,1,len(chunks),PPQ)+b''.join(chunks)
(OUT/'Breach-Containment-Pulse.mid').write_bytes(midi)
print(json.dumps(dict(title=score['title'],bpm=BPM,bars=BARS,
                      seconds=round(64*60/BPM,3),tracks=len(tracks),
                      notes=sum(len(t['notes']) for t in tracks),midi_bytes=len(midi))))
