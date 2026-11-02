#!/usr/bin/env python3
"""Original football-film miniatures. Render with GeneralUser GS + TinySoundFont.
No NFL Films melodies, arrangements, or recordings are used. See FILM_SCORE.md.
Usage: PYTHONPATH=/path/to/tinysoundfont python compose_film_score.py font.sf2 outdir
"""
import argparse,json,subprocess,tempfile
from pathlib import Path
import numpy as np
from scipy.io import wavfile
from tinysoundfont import Synth
SR=44100
# title, family, tempo, tonic, mode, original 8-bar motif (scale degree, beats)
PIECES=[
 ('Sunday in Gold','march',112,62,'major',[(0,1.5),(4,.5),(5,1),(4,1),(2,1),(1,.5),(2,.5),(4,2),(5,1.5),(7,.5),(6,1),(4,1),(3,1),(2,1),(1,2),(2,.5),(4,.5),(5,1),(4,2),(2,1),(1,1),(0,2),(3,1),(5,1),(4,1),(1,1),(0,4)]),
 ('Leather and Thunder','drama',104,62,'minor',[(0,1),(4,1),(7,1.5),(6,.5),(4,2),(2,1),(1,1),(0,1.5),(2,.5),(3,1),(5,1),(4,3),(1,1),(2,.5),(3,.5),(4,1),(6,2),(5,1),(3,1),(2,2),(1,1),(4,1),(3,1),(1,1),(0,4)]),
 ('The Long Walk Home','reflective',82,65,'major',[(4,2),(2,1),(1,1),(0,3),(2,1),(3,1.5),(5,.5),(4,2),(2,4),(5,2),(4,1),(2,1),(3,3),(1,1),(2,1),(1,1),(0,2),(0,4)]),
 ('Seven Across the Line','march',122,58,'major',[(0,.5),(2,.5),(4,1),(2,1),(5,1),(4,1.5),(2,.5),(1,2),(3,.5),(4,.5),(5,1),(7,1),(6,1),(4,4),(5,1),(2,1),(4,.5),(5,.5),(4,1),(3,2),(1,2),(2,1),(4,1),(1,2),(0,4)]),
 ('Under the Floodlights','drama',116,64,'minor',[(0,.5),(1,.5),(4,1),(3,1.5),(2,.5),(1,2),(0,2),(2,1),(5,1),(4,.5),(3,.5),(2,1),(1,4),(4,1.5),(6,.5),(5,1),(3,1),(2,2),(4,2),(3,1),(2,1),(1,2),(0,4)]),
 ('The Last Yard','reflective',88,62,'major',[(0,2),(2,1.5),(4,.5),(5,3),(4,1),(3,2),(1,1),(2,1),(4,4),(7,2),(6,1),(4,1),(5,2),(3,2),(2,1.5),(1,.5),(4,2),(0,4)])]
PROGRAMS=[56,60,57,48,45,43,73,47,46,0]
PANS=[76,42,86,35,96,60,100,64,28,64]
def compose(title,family,bpm,tonic,mode,motif):
 scale=[0,2,4,5,7,9,11] if mode=='major' else [0,2,3,5,7,8,10]
 def pitch(d):return tonic+scale[d%7]+12*(d//7)
 notes=[]
 def n(ch,p,at,d,v=78):notes.append([round(at,4),round(d,4),ch,int(p),int(v)])
 progression=[0,5,3,4,0,2,3,4]
 for bar in range(28):
  at=bar*4;root=progression[bar%8];chord=[pitch(root-7),pitch(root-5),pitch(root-3)]
  if bar>=24:root=[3,4,0,0][bar-24];chord=[pitch(root-7),pitch(root-5),pitch(root-3)]
  bridge=12<=bar<16;ending=bar>=26;full=4<=bar<12 or 16<=bar<24
  for p in chord:n(3,p,at,3.8,56 if not full else 70)
  n(5,pitch(root-14),at,3.5 if family=='reflective' else 1.5,72)
  if family!='reflective':n(5,pitch(root-10),at+2,1.5,65)
  if not bridge:
   for beat in range(4):
    n(4,chord[beat%3],at+beat,.65,58)
    if family=='drama' and full:n(4,chord[(beat+1)%3],at+beat+.5,.35,51)
  if full and family!='reflective':
   for p in chord:n(2,p,at+2,.8,66)
   for beat in [0,2]:n(9,36,at+beat,.18,78)
   for beat in [1,3]:n(9,38,at+beat,.14,68)
   if bar%4==3:
    for beat in [3.25,3.5,3.75]:n(9,38,at+beat,.12,43+int((beat-3)*44))
  elif family=='march' and bar<4:
   for beat in [0,1,2,3,3.5]:n(9,38,at+beat,.13,45)
  if bar%4==0:
   n(7,pitch(root-14),at,1.9,74 if full else 50)
   if full:n(9,49,at,1.8,57)
  if bridge or family=='reflective':
   for i in range(8):n(8,chord[i%3]+12,at+i*.5,.8,45)
  if ending:
   for p in chord:n(1,p+12,at,3.8,64)
 # Two statements with an answering woodwind phrase in the middle.
 for start in [4,16]:
  t=start*4
  for j,(degree,dur) in enumerate(motif):
   if t>=start*4+32:break
   ch=1 if family=='reflective' else 0
   p=pitch(degree)+(12 if family=='march' else 0)
   n(ch,p,t,dur*.91,79+(8 if start==16 else 0))
   if start==16:n(3,p-12,t,dur*.96,56)
   t+=dur
 for bar in range(12,16):
  for beat,degree in [(0,4),(1,2),(2,3),(3,1)]:n(6,pitch(degree+7),bar*4+beat,.85,65)
 for p in [pitch(0),pitch(2),pitch(4)]:n(1,p,104,7.5,72)
 return notes

def render(notes,bpm,font,out):
 synth=Synth(gain=-8,samplerate=SR);sf=synth.sfload(font)
 for ch,program in enumerate(PROGRAMS):
  synth.program_select(ch,sf,128 if ch==9 else 0,program,is_drums=ch==9);synth.control_change(ch,10,PANS[ch]);synth.control_change(ch,7,95)
 events=[]
 for at,d,ch,p,v in notes:events.extend([(round(at*60/bpm*SR),1,ch,p,v),(round((at+d)*60/bpm*SR),0,ch,p,0)])
 events.sort();chunks=[];cursor=0
 for frame,on,ch,p,v in events:
  if frame>cursor:chunks.append(np.frombuffer(synth.generate(frame-cursor),dtype=np.float32).reshape(-1,2).copy());cursor=frame
  (synth.noteon(ch,p,v) if on else synth.noteoff(ch,p))
 chunks.append(np.frombuffer(synth.generate(2*SR),dtype=np.float32).reshape(-1,2).copy());y=np.concatenate(chunks)
 # Compact hall reflections, with a stable mono center for phone speakers.
 wet=y.copy()
 for delay,gain in [(.047,.14),(.083,.11),(.127,.08),(.179,.055),(.239,.04)]:
  k=int(delay*SR);wet[k:]+=y[:-k,::-1]*gain
 wet*=min(1,.86/max(.001,float(np.max(np.abs(wet)))))
 fade=min(SR,len(wet));wet[:int(.02*SR)]*=np.linspace(0,1,int(.02*SR))[:,None];wet[-fade:]*=np.linspace(1,0,fade)[:,None]
 with tempfile.TemporaryDirectory() as tmp:
  wav=Path(tmp)/'render.wav';wavfile.write(wav,SR,wet.astype(np.float32))
  subprocess.run(['ffmpeg','-v','error','-y','-i',str(wav),'-af','loudnorm=I=-18:TP=-2:LRA=9','-ar','44100','-codec:a','libmp3lame','-b:a','112k',str(out)],check=True)
 return round(len(wet)/SR,3)

def main():
 ap=argparse.ArgumentParser();ap.add_argument('font');ap.add_argument('out',type=Path);a=ap.parse_args();a.out.mkdir(parents=True,exist_ok=True);entries=[]
 for title,family,bpm,tonic,mode,motif in PIECES:
  ident=title.lower().replace(' ','-');notes=compose(title,family,bpm,tonic,mode,motif);duration=render(notes,bpm,a.font,a.out/(ident+'.mp3'))
  desc={'march':'A brass-led processional, field snare, and a full-string return.','drama':'Minor-key brass, urgent pizzicato strings, timpani, and a woodwind interlude.','reflective':'Warm horns, lyrical strings, harp, and a measured closing cadence.'}[family]
  entries.append(dict(id=ident,title=title,family=family,bpm=bpm,description=desc,duration=duration,src=f'./music/{ident}.mp3',provenance='Original PGI composition. GeneralUser GS instrument samples by S. Christian Collins; TinySoundFont rendering. No NFL Films recording or melody.',sections=[{'at':0,'name':'Opening'},{'at':round(16*60/bpm,2),'name':'Main theme'},{'at':round(48*60/bpm,2),'name':'Woodwind interlude'},{'at':round(64*60/bpm,2),'name':'Full ensemble return'},{'at':round(96*60/bpm,2),'name':'Final cadence'}]))
  print(title,duration,flush=True)
 (a.out/'manifest.json').write_text(json.dumps(dict(version=2,title='PGI — The Sunday Film Room',recording='Six original orchestral football-film instrumentals.',tracks=entries),indent=2)+'\n')
if __name__=='__main__':main()
