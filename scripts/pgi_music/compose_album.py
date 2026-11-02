#!/usr/bin/env python3
"""Nine original PGI instrumental songs, rendered with Breach's procedural band.

No source songs, recordings, samples, lyrics, or artist performances are inputs.
The three families use broad heavy-metal, electronic-rock, and glam-rock traits.
Usage: python scripts/pgi_music/compose_album.py /tmp/pgi-scores
Then render each score with render_preview.py; source notes remain reproducible.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path

PROVENANCE = 'Original PGI composition and procedural recording. No third-party recordings, samples, lyrics, or copied riffs.'


def track(s, name, instrument, volume, pan=0):
    t = {'name': name, 'instrument': instrument, 'volume': volume, 'pan': pan, 'notes': []}
    s['tracks'].append(t)
    return t


def note(t, start, pitch, duration, velocity=96):
    t['notes'].append({'start': round(start, 4), 'pitch': pitch, 'duration': round(duration, 4), 'velocity': max(1, min(127, round(velocity)))})


def power(t, at, root, duration, velocity=96, full=False):
    for interval, scale in [(0, 1), (7, .77)] + ([(12, .62)] if full else []):
        note(t, at, root + interval, duration, velocity * scale)


def band(s, family):
    tracks = {
        'left': track(s, 'Left rhythm guitar', 'guitar_muted', .62, -.78),
        'right': track(s, 'Right rhythm guitar', 'guitar_muted', .59, .78),
        'open': track(s, 'Ringing power chords', 'guitar_open', .40, -.08),
        'bass': track(s, 'Electric bass', 'bass', .85),
        'lead': track(s, 'Main guitar melody', 'guitar_lead', .66, -.20),
        'answer': track(s, 'Harmony / answer guitar', 'guitar_lead', .42, .32),
        'kit': track(s, 'Electronic kit' if family == 'hybrid' else 'Rock drum kit', 'electronic_drums' if family == 'hybrid' else 'drums', .83),
        'clean': track(s, 'Clean guitar detail', 'clean', .43, -.37),
    }
    if family == 'hybrid':
        tracks['pulse'] = track(s, 'Digital pulse motif', 'electronic', .70, .32)
        tracks['pad'] = track(s, 'Low electronic atmosphere', 'atmosphere', .28, -.12)
    return tracks


def riff(parts, bar, root, phrase, strength=1, swing=0):
    for beat, offset, dur in phrase:
        at = bar * 4 + beat + (swing if beat % 1 == .5 else 0)
        vel = (106 if beat % 1 == 0 else 94) * strength
        power(parts['left'], at, root + offset, dur, vel)
        power(parts['right'], at + .011, root + offset, dur * .96, vel - 6)
        note(parts['bass'], at, root + offset - 12, min(dur + .08, .9), vel + 4)


def kit(t, bar, kicks, *, half=False, crash=False, fill=False, ride=False, cowbell=False, strength=1, swing=0, ghosts=False):
    hits = {}
    def hit(beat, pitch, duration, velocity):
        hits[(round(beat, 4), pitch)] = (duration, round(velocity * strength))
    for beat in kicks:
        hit(beat, 36, .12, 113 if beat % 1 == 0 else 99)
    for beat in ([2] if half else [1, 3]):
        hit(beat, 38, .16, 112)
    for eighth in range(8):
        beat = eighth * .5 + (swing if eighth % 2 else 0)
        hit(beat, 51 if ride else 42, .1, 72 if eighth % 2 == 0 else 49)
    if cowbell:
        for beat in [0, 1.5 + swing, 2.5 + swing, 3.5 + swing]:
            hit(beat, 56, .12, 73 if beat == 0 else 63)
    if ghosts:
        hit(1.75, 38, .09, 42)
        hit(2.75, 38, .08, 48)
    if crash:
        hit(0, 49, .65, 90)
    if fill:
        for beat, pitch in [(2.5, 50), (2.75, 47), (3.25, 45), (3.5, 43), (3.75, 38)]:
            hit(beat, pitch, .14, 87 + int(beat * 3))
    elif bar % 4 == 3:
        hit(3.5 + swing, 46, .22, 74)
    for (beat, pitch), (duration, vel) in sorted(hits.items()):
        note(t, bar * 4 + beat, pitch, duration, vel)


def melody(t, bar, root, phrase, strength=1):
    for beat, offset, dur in phrase:
        note(t, bar * 4 + beat, root + offset, dur, (94 if dur > .5 else 86) * strength)


def harmonize(pitch, root):
    scale = [root + octv * 12 + interval for octv in range(1, 5) for interval in [0, 2, 3, 5, 7, 8, 10]]
    i = min(range(len(scale)), key=lambda j: abs(scale[j] - pitch))
    return scale[min(i + 2, len(scale) - 1)]


def ending(parts, bars, root, family):
    for bar, intervals in [(bars - 2, [7, 5, 2]), (bars - 1, [0, 0])]:
        for n, offset in enumerate(intervals):
            beat = [0, 1.5, 3][n] if len(intervals) == 3 else n * 2
            dur = .35 if bar == bars - 2 else 1.68
            for k in ['left', 'right', 'open']:
                power(parts[k], bar * 4 + beat, root + offset, dur, 102, full=k == 'open')
            note(parts['bass'], bar * 4 + beat, root - 12 + offset, dur, 112)
            note(parts['kit'], bar * 4 + beat, 36, .15, 112)
        if bar == bars - 2:
            kit(parts['kit'], bar, [0, 1.5, 3], fill=True)
            melody(parts['lead'], bar, root, [(0, 31, .8), (1.5, 29, .8), (3, 26, .7)])
        else:
            note(parts['lead'], bar * 4, root + 24, 3.7, 94)
            note(parts['kit'], bar * 4, 49, .7, 92)
            note(parts['kit'], bar * 4 + 2, 38, .2, 110)
            if family == 'hybrid':
                note(parts['pulse'], bar * 4 + 2.5, root + 36, .7, 64)


SPECS = [
    {'id':'fourth-and-thunder','title':'Fourth and Thunder','family':'gallop','bpm':164,'bars':32,'root':40,'variant':0,
     'description':'Driving minor-key gallops, a rising twin-guitar refrain and a half-time siege.'},
    {'id':'midnight-formation','title':'Midnight Formation','family':'gallop','bpm':148,'bars':32,'root':38,'variant':1,
     'description':'Darker picked triplets, a winding harmonized lead and a clean middle passage.'},
    {'id':'run-to-the-lights','title':'Run to the Lights','family':'gallop','bpm':176,'bars':36,'root':45,'variant':2,
     'description':'Fast ascending runs, wide-open harmony and a climbing final refrain.'},
    {'id':'static-on-the-sideline','title':'Static on the Sideline','family':'hybrid','bpm':98,'bars':24,'root':36,'variant':0,
     'description':'Low syncopated guitars, a digital bell motif and a spacious quiet-to-heavy chorus.'},
    {'id':'pressure-circuit','title':'Pressure Circuit','family':'hybrid','bpm':112,'bars':24,'root':38,'variant':1,
     'description':'Clipped guitar stops, a restless electronic ostinato and a blunt half-time drop.'},
    {'id':'after-the-whistle','title':'After the Whistle','family':'hybrid','bpm':92,'bars':24,'root':35,'variant':2,
     'description':'Clean-guitar tension, a descending synthetic hook and a broad heavy release.'},
    {'id':'neon-end-zone','title':'Neon End Zone','family':'glam','bpm':132,'bars':28,'root':40,'variant':0,
     'description':'Swaggering blues-metal riffs, cowbell accents and an open major-key chorus.'},
    {'id':'saturday-voltage','title':'Saturday Voltage','family':'glam','bpm':140,'bars':32,'root':45,'variant':1,
     'description':'Driving arena-rock backbeats, a bright guitar hook and a climbing solo answer.'},
    {'id':'chrome-and-cleats','title':'Chrome and Cleats','family':'glam','bpm':124,'bars':28,'root':38,'variant':2,
     'description':'A swinging low-string riff, ringing chords and a high call-and-response lead.'},
]

GALLOP_RIFFS = [
    [[(0,0,.31),(.5,0,.16),(.75,0,.16),(1,7,.32),(1.5,0,.16),(1.75,0,.16),(2,3,.33),(2.5,0,.16),(2.75,0,.16),(3,5,.29),(3.5,7,.29)],
     [(0,0,.31),(.5,0,.16),(.75,0,.16),(1,10,.32),(1.5,7,.3),(2,5,.3),(2.5,3,.3),(3,2,.18),(3.5,0,.3)]],
    [[(0,0,.4),(.75,0,.17),(1,3,.31),(1.5,0,.16),(1.75,0,.16),(2,7,.38),(2.75,5,.17),(3,3,.25),(3.5,2,.25)],
     [(0,0,.31),(.5,0,.16),(.75,0,.16),(1,5,.31),(1.5,7,.31),(2,8,.3),(2.5,7,.16),(2.75,5,.16),(3,2,.33)]],
    [[(0,0,.29),(.5,0,.15),(.75,0,.15),(1,2,.29),(1.5,3,.15),(1.75,5,.15),(2,7,.29),(2.5,0,.15),(2.75,0,.15),(3,10,.3),(3.5,7,.3)],
     [(0,0,.29),(.5,0,.15),(.75,0,.15),(1,12,.3),(1.5,10,.31),(2,7,.29),(2.5,5,.15),(2.75,3,.15),(3,2,.3),(3.5,0,.3)]],
]
GALLOP_HOOKS = [
    [[(0,24,.66),(.75,27,.5),(1.5,31,.7),(2.5,29,.42),(3,27,.73)],[(0,26,.62),(.75,29,.5),(1.5,34,.65),(2.5,31,.4),(3,24,.8)]],
    [[(.25,31,.7),(1.25,29,.45),(2,27,.65),(3,26,.7)],[(0,24,.7),(1,26,.35),(1.5,27,.35),(2,29,.7),(3,23,.7)]],
    [[(0,24,.42),(.5,26,.42),(1,27,.42),(1.5,31,.65),(2.5,34,.45),(3,36,.72)],[(0,34,.7),(1,31,.35),(1.5,29,.35),(2,27,.42),(2.5,26,.42),(3,24,.72)]],
]


def compose_gallop(spec, s):
    p = band(s, 'gallop'); root=spec['root']; v=spec['variant']; bars=spec['bars']
    s['sections'] = [{'bar':0,'name':'Guitar entrance'},{'bar':4,'name':'Twin-lead refrain'},{'bar':12,'name':'Answer / chord lift'},{'bar':20,'name':'Half-time contrast'},{'bar':24,'name':'Full-band return'},{'bar':bars-2,'name':'Resolved ending'}]
    for bar in range(bars-2):
        intro=bar<4; bridge=20<=bar<24; answer=12<=bar<20
        shift = ([0,8,5,7][(bar-12)//2] if answer else [0,5,8,7][bar-20] if bridge else 0)
        phrase = GALLOP_RIFFS[v][bar%2]
        if bridge:
            phrase=[(0,0,.8),(1.5,7,.32),(2.5,0,.6),(3.5,7,.3)]
        riff(p,bar,root+shift,phrase,.78 if bridge else 1)
        kit(p['kit'],bar,[0,.75,2,2.75] if v==1 else [0,1.5,2,2.5,3.5] if v==2 else [0,.75,1.75,2,2.75],half=bridge,ride=answer or bar>=24,fill=bar in [3,11,19,23,bars-3],crash=bar in [0,4,12,20,24],strength=.82 if bridge else 1)
        if bar%4==0 or bridge:
            power(p['open'],bar*4,root+shift,2.4 if answer else 1.5,90,True)
        if bridge:
            for n,interval in enumerate([0,7,12,15,19,15,12,7]):
                note(p['clean'],bar*4+n*.5,root+shift+12+interval,.44,75)
            melody(p['lead'],bar,root,[(.5,[31,29,27,35][bar-20],2.8)],.78)
        elif not intro:
            hook=GALLOP_HOOKS[v][bar%2]
            lift=12 if answer and bar%4>=2 else 0
            melody(p['lead'],bar,root+lift,hook)
            if bar%4 in [0,1] or bar>=24:
                for beat,offset,dur in hook:
                    pitch=root+lift+offset
                    note(p['answer'],bar*4+beat+.015,harmonize(pitch,root),dur*.96,79)
            else:
                melody(p['answer'],bar,root,[(2.5,19,.35),(3,22,.35),(3.5,24,.35)],.9)
        elif bar in [1,3]:
            melody(p['lead'],bar,root,[(2,19,.4),(2.5,22,.4),(3,24,.8)],.8)
    ending(p,bars,root,'gallop')

HYBRID_RIFFS = [
    [[(0,0,.37),(.75,0,.2),(1.5,3,.3),(2.5,0,.22),(3.25,7,.31)],[(0,0,.65),(1.25,10,.3),(2,7,.33),(2.75,3,.24),(3.5,0,.22)]],
    [[(0,0,.19),(.5,0,.19),(1.25,1,.19),(1.75,0,.19),(2.5,7,.36),(3.5,0,.2)],[(0,0,.41),(.75,0,.19),(1.5,6,.22),(2.25,5,.31),(3,1,.19),(3.5,0,.2)]],
    [[(0,0,.75),(1.5,7,.27),(2.5,3,.46),(3.5,0,.24)],[(0,0,.45),(1,10,.65),(2,8,.32),(2.75,7,.25),(3.5,3,.25)]],
]
HYBRID_HOOKS = [
    [[(0,24,.8),(1,31,.65),(2,27,.6),(3,26,.7)],[(0,24,1.2),(1.5,22,.65),(2.5,27,.4),(3,26,.8)]],
    [[(.25,24,.45),(1,27,.55),(2,31,.6),(3,29,.75)],[(0,27,.4),(.75,26,.4),(1.5,24,.7),(2.5,23,1.1)]],
    [[(0,31,1.2),(1.5,29,.7),(2.5,27,.45),(3,26,.8)],[(.25,24,.75),(1.25,22,.5),(2,19,.7),(3,24,.8)]],
]


def compose_hybrid(spec,s):
    p=band(s,'hybrid');root=spec['root'];v=spec['variant'];bars=spec['bars']
    s['sections']=[{'bar':0,'name':'Electronic / clean introduction'},{'bar':4,'name':'Low-string verse'},{'bar':8,'name':'Heavy hook'},{'bar':16,'name':'Stripped breakdown'},{'bar':20,'name':'Final release'},{'bar':22,'name':'Resolved ending'}]
    for bar in range(bars-2):
        intro=bar<4; chorus=8<=bar<16 or bar>=20; break_=16<=bar<20
        shift=([0,8,3,10][(bar-8)//2%4] if chorus else [0,8,5,7][bar%4] if intro else 0)
        r=root+shift
        arp=[[0,7,12,15,12,7,10,7],[0,12,7,13,7,12,10,7],[12,7,3,7,10,7,3,2]][v]
        for n,interval in enumerate(arp):
            at=bar*4+n*.5
            note(p['pulse'],at,r+24+interval,.2 if v==1 else .32,73 if n%2==0 else 54)
            if intro or break_:
                note(p['clean'],at,r+12+interval,.55,68)
        if intro or break_:
            for interval in [0,7,12]:note(p['pad'],bar*4,r+12+interval,3.8,65)
            if bar%2==0:note(p['bass'],bar*4,r-12,3.4,96)
            kit(p['kit'],bar,[0,2.75] if intro else [0,1.5,3.25],half=True,strength=.59,ghosts=True,fill=bar in [3,19])
            if break_:
                riff(p,bar,root,[(0,0,.35),(2.5,7,.35)],.79)
                melody(p['lead'],bar,root,[(1,31 if bar%2==0 else 27,1.4)],.62)
        else:
            riff(p,bar,r,HYBRID_RIFFS[v][bar%2],1)
            kit(p['kit'],bar,[0,.75,2.5,3.25] if v==0 else [0,.5,1.75,2.5,3.5] if v==1 else [0,1.5,2.75],half=v==2,ride=chorus,crash=bar in [4,8,12,20],fill=bar in [7,15,21],ghosts=True)
            if chorus:
                power(p['open'],bar*4,r,2.5,96,True)
                melody(p['lead'],bar,root,HYBRID_HOOKS[v][bar%2],.96)
                melody(p['answer'],bar,root-12,HYBRID_HOOKS[v][bar%2],.63)
            elif bar%2:
                melody(p['lead'],bar,root,[(1.5,27,.4),(2.25,26,.45),(3,24,.7)],.69)
    ending(p,bars,root,'hybrid')

GLAM_RIFFS = [
    [[(0,0,.35),(.5,0,.24),(1.5,3,.29),(2,5,.35),(2.5,0,.23),(3.5,7,.29)],[(0,0,.35),(.75,7,.32),(1.5,5,.28),(2.5,3,.32),(3,2,.24),(3.5,0,.28)]],
    [[(0,0,.4),(1,7,.25),(1.5,9,.28),(2,0,.4),(3,10,.24),(3.5,7,.28)],[(0,0,.4),(.75,4,.3),(1.5,5,.3),(2.5,7,.3),(3,5,.23),(3.5,4,.28)]],
    [[(0,0,.39),(.5,3,.23),(1,4,.38),(1.5,0,.23),(2,7,.39),(2.5,5,.23),(3,3,.23),(3.5,0,.23)],[(0,0,.38),(.5,7,.23),(1,9,.38),(1.5,7,.23),(2,5,.38),(2.5,4,.23),(3,2,.23),(3.5,0,.23)]],
]
GLAM_HOOKS = [
    [[(0,24,.75),(1,28,.5),(1.75,31,.8),(3,33,.75)],[(0,34,.75),(1,31,.5),(1.75,28,.8),(3,26,.75)]],
    [[(.25,31,.5),(1,33,.7),(2,36,.75),(3,34,.75)],[(0,33,.4),(.75,31,.45),(1.5,28,.6),(2.5,26,.4),(3,24,.75)]],
    [[(0,24,.5),(.75,27,.3),(1.25,28,.55),(2,31,.75),(3,28,.75)],[(0,26,.75),(1,29,.5),(1.75,33,.7),(2.75,31,.4),(3.5,24,.4)]],
]


def compose_glam(spec,s):
    p=band(s,'glam');root=spec['root'];v=spec['variant'];bars=spec['bars'];swing=.07 if v==2 else .025
    s['sections']=[{'bar':0,'name':'Riff / cowbell entrance'},{'bar':4,'name':'Main swagger'},{'bar':8,'name':'Open chorus'},{'bar':16,'name':'Solo answer'},{'bar':20,'name':'Arena return'},{'bar':bars-2,'name':'Resolved ending'}]
    for bar in range(bars-2):
        intro=bar<4; chorus=8<=bar<16 or bar>=20; solo=16<=bar<20
        shift=[0,5,10,7][(bar-8)//2%4] if chorus else [5,7,0,7][bar-16] if solo else 0
        riff(p,bar,root+shift,GLAM_RIFFS[v][bar%2],.83 if intro else 1,swing)
        kit(p['kit'],bar,[0,1.5,2,3.5] if v==0 else [0,.75,2,2.75] if v==1 else [0,1.5,2.5,3.5],crash=bar in [0,4,8,16,20],fill=bar in [3,7,15,19,bars-3],ride=chorus,cowbell=intro or bar%4==1,swing=swing,ghosts=v==2)
        if chorus:
            power(p['open'],bar*4,root+shift,2.8,97,True)
            melody(p['lead'],bar,root,GLAM_HOOKS[v][bar%2])
            if bar%2:melody(p['answer'],bar,root,[(2,19,.3),(2.5,21,.3),(3,24,.6)],.85)
        elif solo:
            notes=[24,28,31,33,34,33,31,28] if v==0 else [24,26,28,31,36,34,33,31] if v==1 else [31,28,27,24,26,29,33,31]
            for n,interval in enumerate(notes):note(p['lead'],bar*4+n*.5,root+interval+(12 if bar%2 else 0),.39,88+n%3*3)
            melody(p['answer'],bar,root,[(0,19,1.2),(2,21,1.4)],.7)
        elif not intro:
            melody(p['lead'],bar,root,[(1.5,19,.42),(2.25,22,.45),(3,24,.7)],.75)
        elif bar==3:
            melody(p['lead'],bar,root,[(2,19,.3),(2.5,22,.3),(3,24,.8)],.8)
    ending(p,bars,root,'glam')


def compose(spec):
    s={'title':spec['title'],'bpm':spec['bpm'],'bars':spec['bars'],'beats_per_bar':4,'preview_gain':.88,'provenance':PROVENANCE,'tracks':[]}
    {'gallop':compose_gallop,'hybrid':compose_hybrid,'glam':compose_glam}[spec['family']](spec,s)
    for t in s['tracks']:
        t['notes'].sort(key=lambda n:(n['start'],n['pitch']))
        for n in t['notes']:
            assert 0 <= n['pitch'] <= 127 and n['duration'] > 0 and n['start'] + n['duration'] <= s['bars'] * 4 + .02
    return s


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output',type=Path)
    parser.add_argument('--manifest',type=Path)
    args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=True)
    entries=[]
    for spec in SPECS:
        s=compose(spec)
        (args.output/(spec['id']+'.json')).write_text(json.dumps(s,separators=(',',':'))+'\n')
        entries.append({**{k:spec[k] for k in ['id','title','family','bpm','description']},'duration':round(spec['bars']*4*60/spec['bpm']+1.2,3),'src':'./music/'+spec['id']+'.mp3','sections':[{'at':round(sec['bar']*4*60/spec['bpm'],3),'name':sec['name']} for sec in s['sections']],'provenance':PROVENANCE})
    if args.manifest:
        args.manifest.parent.mkdir(parents=True,exist_ok=True)
        args.manifest.write_text(json.dumps({'version':1,'title':'PGI — Stadium Voltage','recording':'Original instrumentals performed by procedural synthesis. No vocals or band recordings.','tracks':entries},indent=2)+'\n')
    print(json.dumps({'songs':len(entries),'minutes':round(sum(e['duration'] for e in entries)/60,2),'score_directory':str(args.output)}))

if __name__=='__main__':main()
