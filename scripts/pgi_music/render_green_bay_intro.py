"""Rebuild the approved eight-bar Green Bay MIDI and synthesized WAV preview."""
import argparse
import struct, math, json, wave
from pathlib import Path
import numpy as np
from scipy.signal import butter, sosfilt

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output_dir', type=Path, help='Directory for the MIDI and WAV preview')
OUT = parser.parse_args().output_dir
OUT.mkdir(parents=True, exist_ok=True)
BPM=125; SPB=60/BPM; PPQ=960; END=32; SR=44100
rng=np.random.default_rng(161)
tracks=[]; notes=[]; bends=[]
def vlq(n):
    out=[n&127]; n>>=7
    while n: out.insert(0,(n&127)|128); n>>=7
    return bytes(out)
def meta(t,typ,value):return (round(t*PPQ),bytes([255,typ])+vlq(len(value))+value)
def track(name,ch=None,prog=None,vol=100,pan=64):
    ev=[meta(0,3,name.encode())]
    if ch is not None:
        ev += [(0,bytes([0xb0+ch,7,vol])),(0,bytes([0xb0+ch,10,pan])),(0,bytes([0xb0+ch,91,20])),(0,bytes([0xb0+ch,11,127]))]
        if prog is not None:ev.append((0,bytes([0xc0+ch,prog])))
    tracks.append(ev);return ev

def note(ev,ch,n,b,d,v,kind):
    if ch not in (2, 9): n += 12
    ev.append((round(b*PPQ),bytes([0x90+ch,n,v])))
    ev.append((round((b+d)*PPQ),bytes([0x80+ch,n,0])))
    notes.append(dict(ch=ch,n=n,b=b,d=d,v=v,kind=kind))
def cc(ev,ch,c,v,b=0):ev.append((round(b*PPQ),bytes([0xb0+ch,c,v])))
def pb(ev,ch,value,b):
    value=int(np.clip(round(value),0,16383));ev.append((round(b*PPQ),bytes([0xe0+ch,value&127,value>>7])))

con=track('You Dropped a Bomb on Me - instrumental intro reconstruction')
con += [meta(0,0x51,round(60e6/BPM).to_bytes(3,'big')),meta(0,0x58,bytes([4,2,24,8])),meta(0,0x59,bytes([1,1])),meta(0,1,b'8-bar instrumental study. Approximate reconstruction; no original audio or vocals.'),meta(0,1,b'References: MIDI-HITS P428 public audio demo; Dynamic Drum School intro chart. Not a verified transcription.')]
con += [meta(0,6,b'Synth opening'),meta(16,6,b'Bass riff'),meta(32,6,b'End of excerpt')]
bass=track('Synth bass',0,38,108,64)
# Long low E foundation, followed by the chromatic bass figure.
for b,d in [(0,7.9),(8,7.85)]:note(bass,0,28,b,d,106,'bass')
phrase=[(16,28,1.7),(19.25,25,.47),(19.75,26,.47),(20.25,25,.47),(20.75,26,.88),
(23.25,25,.47),(23.75,26,.47),(24.25,25,.47),(24.75,26,.43),(25.25,28,.23),(25.5,30,.57),
(26.25,26,.67),(27.25,28,.85),(28.5,31,.65),(29.5,33,.22),(29.75,34,.22),(30,33,.22),
(30.25,31,.22),(30.5,33,.22),(30.75,35,.22),(31,33,.22),(31.25,31,.44)]
for b,n,d in phrase:note(bass,0,n,b,d,112 if n in [28,26] else 103,'bass')

chords=track('Quiet synth chord bed',1,62,62,72)
for b,d,ns in [(0,3.8,[52,55,59,62]),(4,3.8,[52,55,59]),(8,3.8,[52,55,59]),(12,3.6,[52,55,59]),(16,1.5,[52,55,59,62]),(20,1.4,[50,54,57,60]),(24,1.4,[50,54,57,60]),(28,1.2,[52,55,59,62])]:
    for n in ns:note(chords,1,n,b,d,65,'chord')

lead=track('Bomb whistle - continuous pitch bend',2,80,88,60)
# Explicit RPN bend range: 12 semitones. Keep the line editable as one note.
for c,v in [(101,0),(100,0),(6,12),(38,0),(101,127),(100,127)]:cc(lead,2,c,v)
# The approved downward pitch dip has a rising onset and a steeper final fall.
# Its channel stays at the original octave; bass and chords are one octave higher.
curve=[(0,69.5),(1.2,71.2),(2.4,73.0),(4.2,73.7),(5.2,73.7),(8.0,72.1),(10.0,71.8),(12.0,70.8),(14.0,69.5),(15.1,68.5),(15.8,60.5)]
note(lead,2,69,0,15.8,86,'sweep')
for b in np.linspace(0,15.8,700):
    pitch=np.interp(b,*zip(*curve));pb(lead,2,8192+(pitch-69)/12*8192,b);bends.append([float(b),float(pitch)])
pb(lead,2,8192,15.85)

kit=track('Drums - GM channel 10',9,None,108,64)
# Four-on-the-floor opening with snare backbeat and eighth-note hat pulse.
for bar in range(8):
    base=bar*4
    for q in range(4):note(kit,9,36,base+q,.10,111 if q%2==0 else 99,'kick')
    for q in [1,3]:
        note(kit,9,38,base+q,.14,115,'snare')
        note(kit,9,39,base+q+.018,.08,62,'clap')
    for j in range(8):note(kit,9,42,base+j*.5,.07,65 if j%2 else 46,'hat')
    if bar in [0,4]:note(kit,9,49,base,.65,94,'crash')
for b,v in [(30.5,65),(31,86),(31.25,75),(31.5,105),(31.75,113)]:note(kit,9,38,b,.12,v,'snare')
# Close every channel cleanly at the excerpt boundary.
for ev,ch in [(bass,0),(chords,1),(lead,2),(kit,9)]:
    cc(ev,ch,64,0,END);cc(ev,ch,123,0,END)
chunks=[]
for ev in tracks:
    ev.sort(key=lambda x:x[0]);data=b'';last=0
    for t,msg in ev:data+=vlq(t-last)+msg;last=t
    data+=vlq(round(END*PPQ)-last)+b'\xff\x2f\x00'
    chunks.append(b'MTrk'+struct.pack('>I',len(data))+data)
mid=b'MThd'+struct.pack('>IHHH',6,1,len(chunks),PPQ)+b''.join(chunks)
(OUT/'You-Dropped-a-Bomb-On-Me-intro.mid').write_bytes(mid)

# Synthesize the same event list locally for a convenient preview.
N=int((END*SPB+1.25)*SR);mix=np.zeros((N,2))
def add(sig,start,amp,pan=.5):
    i=round(start*SR);end=min(N,i+len(sig));sig=sig[:end-i]*amp
    mix[i:end,0]+=sig*np.sqrt(1-pan);mix[i:end,1]+=sig*np.sqrt(pan)
def env(t,d,attack=.006,rel=.08):return np.minimum(t/attack,1)*np.clip((d+rel-t)/rel,0,1)
for e in notes:
    b,d,n,v,k=e['b'],e['d']*SPB,e['n'],e['v']/127,e['kind'];start=b*SPB
    duration=d+(.12 if k in ['bass','chord','sweep'] else .75)
    t=np.arange(int(duration*SR))/SR;f=440*2**((n-69)/12)
    if k=='bass':
        sig=np.zeros_like(t)
        # Bright resonant bass attack, body sustained in long opening notes.
        for h in range(1,28):
            cutoff=4.5+17*np.exp(-t/.105)
            sig+=np.sin(2*np.pi*f*h*t+.03*h)/(h**1.06)*np.exp(-h/cutoff)
        sig=np.tanh(sig*1.7)*env(t,d,.004,.07)
        add(sig,start,.31*v)
    elif k=='chord':
        sig=sum(np.sin(2*np.pi*f*(1+det)*t*h)/(h**1.65) for det in [-.0018,.0018] for h in range(1,8))/2
        sig*=env(t,d,.025,.11)*(.25+.75*np.exp(-t/.25))
        add(sig,start,.042*v,.62)
    elif k=='sweep':
        pitch=np.interp(t/SPB,*zip(*curve));freq=440*2**((pitch-69)/12)
        phase=2*np.pi*np.cumsum(freq*(1+.0017*np.sin(2*np.pi*5.3*t)))/SR
        sig=(np.sin(phase)+.21*np.sin(2*phase)+.055*np.sin(3*phase))*env(t,d,.08,.11)
        add(sig,start,.11*v,.46)
        add(sig,start+.12,.018*v,.67)
    elif k=='kick':
        freq=49+95*np.exp(-t/.022);sig=np.sin(2*np.pi*np.cumsum(freq)/SR)*np.exp(-t/.105)
        sig+=rng.normal(0,1,len(t))*.07*np.exp(-t/.007)
        add(sig,start,.55*v)
    elif k in ['snare','clap']:
        noise=rng.normal(0,1,len(t));noise=sosfilt(butter(2,1600,fs=SR,btype='highpass',output='sos'),noise)
        sig=noise*np.exp(-t/(.10 if k=='snare' else .065))*.7
        if k=='snare':sig+=(np.sin(2*np.pi*185*t)+.4*np.sin(2*np.pi*330*t))*np.exp(-t/.055)*.65
        add(sig,start,(.37 if k=='snare' else .13)*v,.53)
    elif k in ['hat','crash']:
        noise=rng.normal(0,1,len(t));noise=sosfilt(butter(3,6500 if k=='hat' else 4200,fs=SR,btype='highpass',output='sos'),noise)
        sig=noise*np.exp(-t/(.033 if k=='hat' else .36))
        add(sig,start,(.18 if k=='hat' else .23)*v,.32 if k=='hat' else .70)
# Very light room response, then peak-normalization. No samples from the reference recording.
for delay,g in [(.041,.08),(.073,.05)]:
    count=int(delay*SR);mix[count:]+=mix[:-count,::-1]*g
mix=np.tanh(mix*1.1);mix*=.90/max(abs(mix).max(),.01)
with wave.open(str(OUT/'intro-preview.wav'),'wb') as w:
    w.setnchannels(2);w.setsampwidth(2);w.setframerate(SR);w.writeframes((mix*32767).astype('<i2').tobytes())
print(json.dumps({'midi_bytes':len(mid),'tracks':len(tracks),'note_events':len(notes),'bars':8,'bpm':BPM,'musical_seconds':END*SPB,'peak':float(abs(mix).max())}))
