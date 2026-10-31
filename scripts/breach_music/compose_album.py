"""Twelve independently authored MIDI cues for Breach. No source-song input.
Usage: python3 scripts/breach_music/compose_album.py OUTPUT_DIRECTORY
"""
import json, struct, sys
from pathlib import Path
OUT=Path(sys.argv[1]); OUT.mkdir(parents=True,exist_ok=True)
PPQ=480

def vlq(n):
 b=[int(n)&127]; n=int(n)>>7
 while n: b.insert(0,(n&127)|128); n>>=7
 return bytes(b)
def meta(k,d):
 if isinstance(d,str):d=d.encode()
 return bytes([255,k])+vlq(len(d))+d

def write(s,slug):
 end=round(s['bars']*s['beats_per_bar']*PPQ)
 def chunk(ev):
  b=bytearray();last=0
  for at,order,data in sorted(ev,key=lambda e:(e[0],e[1])):
   b.extend(vlq(at-last)+data);last=at
  b.extend(vlq(end-last)+b'\xff\x2f\x00')
  return b'MTrk'+struct.pack('>I',len(b))+b
 conductor=[(0,0,meta(3,s['title'])),(0,1,meta(81,round(60000000/s['bpm']).to_bytes(3,'big'))),
 (0,2,meta(88,bytes([6,3,36,8] if s['beats_per_bar']==3 else [4,2,24,8]))),
 (0,3,meta(1,'Original Breach composition; no sampled recordings.'))]
 chunks=[chunk(conductor)]
 for t in s['tracks']:
  t['notes'].sort(key=lambda n:(n['start'],n['pitch'])); prev={}
  for n in t['notes']:
   old=prev.get(n['pitch'])
   if old and old['start']+old['duration']>=n['start']:
    old['duration']=round(n['start']-old['start']-.01,5)
   prev[n['pitch']]=n
   assert 0<n['duration'] and n['start']+n['duration']<=end/PPQ+.01
  assert all(n['duration'] > 0 for n in t['notes']), (slug,t['name'])
  ch=t['channel']; ev=[(0,0,meta(3,t['name'])),(0,1,bytes([192|ch,t['program']])),(0,2,bytes([176|ch,7,round(t['volume']*100)])),(0,3,bytes([176|ch,10,round((t['pan']+1)*63.5)]))]
  for n in t['notes']:
   ev.extend([(round(n['start']*PPQ),10,bytes([144|ch,n['pitch'],n['velocity']])),(round((n['start']+n['duration'])*PPQ),5,bytes([128|ch,n['pitch'],0]))])
  chunks.append(chunk(ev))
 (OUT/(slug+'.mid')).write_bytes(b'MThd'+struct.pack('>IHHH',6,1,len(chunks),PPQ)+b''.join(chunks))
 (OUT/(slug+'.json')).write_text(json.dumps(s,indent=2))
 print(slug,round(end/PPQ*60/s['bpm'],2),sum(len(t['notes']) for t in s['tracks']))

def score(title,bpm,bars,beats=4,gain=.85):return dict(title=title,bpm=bpm,bars=bars,beats_per_bar=beats,preview_gain=gain,tracks=[])
def tr(s,name,ins,ch,prog,vol=.7,pan=0):
 t=dict(name=name,instrument=ins,channel=ch,program=prog,volume=vol,pan=pan,notes=[]);s['tracks'].append(t);return t
def n(t,at,p,d=.2,v=90):t['notes'].append(dict(start=round(at,5),pitch=p,duration=round(d,5),velocity=v))
def power(t,at,p,d=.3,v=100):
 n(t,at,p,d,v);n(t,at+.008,p+7,d-.008,v-15)

# Each tuple supplies a distinct rhythmic vocabulary and pitch contour, rather
# than transposing a common riff. Last phrase is a written exit, not a loop.
metal=[
 ('iron-wake','Iron Wake',92,12,36,[
 [(0,0,.7),(1.5,0,.22),(2.5,7,.46),(3.25,5,.38)],
 [(.5,0,.35),(1.25,3,.45),(2.5,2,.45)],
 [(0,0,1.1),(2,5,.36),(3,3,.6)],
 [(0,2,.4),(1.5,0,.3),(2.5,0,.8)]], 'straight'),
 ('dry-contact','Dry Contact',118,12,43,[
 [(0,0,.16),(.75,7,.18),(1.25,0,.16),(2,3,.22),(2.75,5,.2),(3.5,2,.18)],
 [(.25,0,.16),(1,7,.16),(1.75,5,.2),(2.5,3,.3)],
 [(0,2,.2),(.5,0,.16),(1.5,0,.16),(2.25,5,.23),(3.25,7,.25)]], 'busy'),
 ('crown-circuit','Crown Circuit',126,16,40,[
 [(0,0,.13),(.25,0,.12),(1,0,.15),(1.75,2,.16),(2.25,3,.18),(3,7,.28)],
 [(0,5,.32),(1,0,.13),(1.25,0,.12),(2,8,.3),(3.5,7,.2)],
 [(.5,0,.2),(1.25,3,.2),(2,2,.3),(3,5,.4)],
 [(0,7,.4),(1.5,5,.3),(2.5,2,.25),(3.25,0,.4)]], 'drive'),
 ('counterweight','Counterweight',98,12,41,[
 [(0,0,.28),(1.75,0,.25),(2.5,5,.32)],
 [(.5,3,.4),(2,0,.45),(3.5,2,.22)],
 [(0,5,.5),(1,0,.2),(2.75,3,.35)],
 [(.25,2,.25),(1.5,5,.3),(3,0,.5)]], 'toms'),
 ('glass-teeth','Glass Teeth',112,12,47,[
 [(0,0,.16),(.5,1,.16),(1.5,6,.18),(2.25,0,.18),(3,4,.24)],
 [(.25,6,.18),(1,4,.23),(2,1,.18),(2.75,0,.23),(3.5,7,.18)],
 [(0,4,.28),(1.25,0,.2),(2.5,6,.32)],
 [(.5,1,.24),(1.5,4,.24),(2.75,0,.5)]], 'brittle'),
 ('root-pressure','Root Pressure',86,12,35,[
 [(0,0,1.15),(2.5,3,.65)],
 [(.5,5,.85),(2,0,.3),(3,2,.55)],
 [(0,7,1.2),(2.25,5,.6)],
 [(.25,3,.7),(1.75,2,.6),(3,0,.6)]], 'half'),
 ('weight-of-stone','Weight of Stone',68,8,34,[
 [(0,0,1.7),(3,1,.6)],[(.5,6,1.3),(2.5,5,.9)],
 [(0,3,1.8),(3,5,.65)],[(0,1,1.1),(2.5,0,1.1)]], 'slow'),
 ('exit-load','Exit Load',116,12,38,[
 [(0,0,.18),(.5,0,.18),(1.5,5,.35),(2.25,0,.2),(3,9,.45)],
 [(0,7,.4),(1,0,.18),(1.5,0,.2),(2.75,5,.3),(3.5,3,.25)],
 [(.25,0,.18),(.75,2,.18),(1.75,3,.3),(2.5,7,.35)],
 [(0,9,.45),(1.25,7,.35),(2.25,3,.3),(3,0,.6)]], 'urgent'),
]
for slug,title,bpm,bars,root,patterns,style in metal:
 s=score(title,bpm,bars)
 muted=style not in ['half','slow','straight']
 g=tr(s,'Rhythm left','guitar_muted' if muted else 'guitar_open',0,28 if muted else 30,.73,-.65)
 h=tr(s,'Rhythm right','guitar_muted' if muted else 'guitar_open',1,28 if muted else 30,.65,.65)
 b=tr(s,'Independent picked bass','bass',2,34,.84)
 lead=tr(s,'Answer motif','lead',3,30,.31,.25)
 drums=tr(s,'Rock kit','drums',9,0,.85)
 for bar in range(bars):
  pattern=patterns[bar%len(patterns)]
  if bar==bars-1:pattern=[(0,5,.4),(1,3,.4),(2,0,1.35)]
  for i,(p,offset,d) in enumerate(pattern):
   at=bar*4+p
   if style=='brittle':
    n(g,at,root+offset+12,d,88);n(h,at+.012,root+offset+17,d*.9,81)
   else:power(g,at,root+offset,d,100);power(h,at+.012,root+offset,d*.94,94)
   bassroot=root-12+(offset if style not in ['brittle','toms'] else (bar%3)*2)
   n(b,at,bassroot,min(d+.1,.9),104)
   if i%2==0:n(drums,at,36,.15,105)
  if style=='busy':
   for at,off in [(1.5,2),(3,5)]:n(b,bar*4+at,root-12+off,.18,82)
  for p in ([2] if style in ['half','slow','toms'] else [1,3]):n(drums,bar*4+p,38,.15,104)
  hats=([0,2] if style=='slow' else [0,1,2,3] if style in ['half','toms'] else [i*.5 for i in range(8)])
  for i,p in enumerate(hats):n(drums,bar*4+p,45 if style=='toms' else 42,.12,58 if i%2 else 72)
  if bar in [0,bars//2]:n(drums,bar*4,49,.6,83)
  if bar%4==3 and bar!=bars-1:
   for p,pitch in [(3,50),(3.5,47),(3.75,45)]:n(drums,bar*4+p,pitch,.18,90)
  if bar%4==2:
   # Non-root answers differ with each rhythm's authored contour.
   contour={'straight':[7,5,3],'busy':[2,7,5],'drive':[9,7,2],'toms':[5,2,3],'brittle':[6,4,1],'half':[7,2,5],'slow':[1,6,5],'urgent':[9,5,7]}[style]
   for j,off in enumerate(contour):n(lead,bar*4+.5+j,root+24+off,.55,65)
 write(s,slug)

# Dead Carrier: compound meter, clean harmonics and sparse rolling toms.
s=score('Dead Carrier',76,12,3,.62)
g=tr(s,'Clean harmonics','clean',0,27,.72,-.3);b=tr(s,'Long bass','bass',1,33,.46);d=tr(s,'Distant toms','drums',9,0,.43)
for bar in range(12):
 root=[45,48,43,46][bar%4]
 n(b,bar*3,root-12,2.4,70)
 for beat,p in [(0,root+12),(1.5,root+15),(2.5,root+19)]:n(g,bar*3+beat,p,.4,70)
 if bar%2==1:
  for beat,p in [(0,45),(1.5,47),(2.5,50)]:n(d,bar*3+beat,p,.2,52)
write(s,'dead-carrier')

s=score('Below the Carrier',60,5,4,.38)
p=tr(s,'Low unfixed swell','atmosphere',0,92,.6,-.2);g=tr(s,'Isolated clean notes','clean',1,27,.56,.45)
for at,pitch,d in [(0,38,8.2),(3.7,45,6.8),(9.2,39,8),(12.9,50,5.9)]:n(p,at,pitch,d,60)
for at,pitch in [(2.3,74),(7.1,69),(11.8,75),(17.3,62)]:n(g,at,pitch,1.4,57)
write(s,'below-the-carrier')

s=score('The Room Replies',54,5,4,.46)
p=tr(s,'Room resonance','atmosphere',0,92,.48);g=tr(s,'Unanswered guitar dyads','guitar_muted',1,28,.6,-.3);h=tr(s,'Clean answer','clean',2,27,.43,.4)
n(p,0,31,19.5,58)
for at,root in [(1.25,55),(6.75,58),(10.5,54),(15.25,57)]:
 n(g,at,root,.7,75);n(g,at+.012,root+6,.7,58);n(h,at+1.3,root+13,1.2,58)
write(s,'the-room-replies')

s=score('Spare Air',82,5,4,.62)
g=tr(s,'Clean open voicings','clean',0,27,.76,-.35);b=tr(s,'Rounded bass','bass',1,33,.43);h=tr(s,'Upper answer','clean',2,27,.48,.4)
for bar,root in enumerate([43,48,45,41,43]):
 n(b,bar*4,root-12,3.5,70)
 for beat,offset in [(0,0),(.75,7),(1.75,14),(3,10)]:n(g,bar*4+beat,root+offset,.8,68)
 if bar in [1,3]:n(h,bar*4+1,root+19,.7,60);n(h,bar*4+2.5,root+21,.9,62)
write(s,'spare-air')
