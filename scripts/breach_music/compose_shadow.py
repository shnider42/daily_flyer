"""Three original, phrase-led cues for Beneath The Shadow.

No song, recording, source MIDI, soundfont, or sampled instrument is an input.
The editable score and type-1 MIDI use the same deterministic note events.

Usage: python3 scripts/breach_music/compose_shadow.py OUTPUT_DIRECTORY
Render each JSON with the existing render_preview.py procedural synthesizer.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import struct

PPQ = 480


def score(title, bpm, bars, gain=.82):
    return dict(title=title, bpm=bpm, bars=bars, beats_per_bar=4,
                preview_gain=gain, ppq=PPQ, tracks=[], sections=[])


def track(s, name, instrument, channel, program, volume, pan=0):
    t = dict(name=name, instrument=instrument, channel=channel, program=program,
             volume=volume, pan=pan, notes=[])
    s['tracks'].append(t)
    return t


def note(t, at, pitch, duration=.2, velocity=90):
    t['notes'].append(dict(start=round(at, 5), pitch=pitch,
                           duration=round(duration, 5), velocity=velocity))


def power(t, at, root, duration, velocity=100):
    note(t, at, root, duration, velocity)
    note(t, at+.009, root+7, duration-.009, velocity-14)


def guitars(s, root):
    return (
        track(s, 'Picked rhythm left', 'guitar_muted', 0, 28, .70, -.7),
        track(s, 'Picked rhythm right', 'guitar_muted', 1, 28, .66, .7),
        track(s, 'Open chord answer', 'guitar_open', 2, 30, .39, -.18),
        track(s, 'Melodic picked bass', 'bass', 3, 34, .87),
        track(s, 'Recognizable lead hook', 'lead', 4, 30, .65, .18),
        track(s, 'Articulated rock kit', 'drums', 9, 0, .81),
    )


def rhythm(left, right, bass, drums, bar, root, pattern, strength=1):
    """A written riff drives guitar and bass; kick follows selected accents."""
    for i, (position, offset, duration) in enumerate(pattern):
        at = bar*4+position
        velocity = round((103 if position % 1 == 0 else 91)*strength)
        power(left, at, root+offset, duration, velocity)
        power(right, at+.013, root+offset, duration*.95, velocity-5)
        note(bass, at, root+offset-12, min(.72, duration+.09), velocity+2)
        if i in [0, 2, 4] or position == 2:
            note(drums, at, 36, .12, round(103*strength))


def kit(drums, bar, half=False, ride=False, fill=False, strength=1):
    for beat in ([2] if half else [1, 3]):
        note(drums, bar*4+beat, 38, .16, round(106*strength))
    for i in range(8):
        note(drums, bar*4+i*.5, 51 if ride else 42, .11,
             round((73 if i % 2 == 0 else 53)*strength))
    if fill:
        for at, pitch, velocity in [(2.75, 50, 79), (3.25, 47, 86), (3.75, 45, 93)]:
            note(drums, bar*4+at, pitch, .17, round(velocity*strength))


def melody(t, bar, root, phrase, strength=1):
    for beat, offset, duration, velocity in phrase:
        note(t, bar*4+beat, root+offset, duration, round(velocity*strength))


def shadow_running():
    s = score('Shadow Running', 140, 24)
    s['sections'] = [(0, 'Footfall / pickup'), (2, 'Running hook'),
                     (8, 'Open horizon / second phrase'), (16, 'Hook returns'),
                     (22, 'Written descent / ending')]
    left, right, open_g, bass, lead, drums = guitars(s, 40)
    # E minor; A is an eighth-note engine, B opens a different bass trajectory.
    a = [
        [(0,0,.19),(.5,0,.16),(1.25,7,.26),(2,0,.2),(2.5,3,.29),(3.5,2,.23)],
        [(0,0,.22),(.75,0,.18),(1.5,5,.3),(2.5,3,.26),(3,2,.2),(3.5,0,.25)],
    ]
    b = [
        [(0,0,.7),(1,7,.25),(1.75,0,.18),(2.5,2,.28),(3.25,7,.3)],
        [(0,0,.4),(.75,7,.25),(1.5,5,.35),(2.5,2,.3),(3.5,0,.22)],
    ]
    # A two-bar hook repeats with its rhythmic identity intact, then answers.
    hook = [
        [(0,24,.6,86),(.75,26,.36,77),(1.5,19,.34,76),
         (2,27,.68,88),(3,26,.34,80),(3.5,24,.36,80)],
        [(0,19,.7,80),(1,22,.35,77),(1.75,24,.7,86),(3,26,.32,76),(3.5,24,.36,84)],
    ]
    answer = [
        [(0,24,.8,84),(1.5,31,.7,87),(2.5,29,.35,78),(3.25,26,.5,79)],
        [(.5,27,.6,86),(1.5,26,.65,80),(2.5,24,1,82)],
    ]
    for bar in range(24):
        if bar >= 22:
            continue
        middle = 8 <= bar < 16
        root = [43,45,40,47][(bar-8)//2] if middle else 40
        pat = b[bar%2] if middle else a[bar%2]
        strength = .76 if bar < 2 else 1
        rhythm(left, right, bass, drums, bar, root, pat, strength)
        kit(drums, bar, ride=middle, fill=bar in [7,15,21], strength=strength)
        if bar in [2,8,12,16]:
            note(drums, bar*4, 49, .65, 88)
            power(open_g, bar*4, root, 1.2, 93)
        if 2 <= bar < 8 or 16 <= bar < 22:
            melody(lead, bar, 40, hook[bar%2])
        elif middle:
            melody(lead, bar, 40, answer[bar%2], .9)
        # The fourth bar walks back to E rather than repeating the guitars.
        if bar%4 == 3:
            note(bass, bar*4+3.75, 30, .18, 85)
    # Descending answer ends on a held tonic; drums leave the last two beats open.
    for beat, pitch, duration in [(88,45,.65),(89,43,.6),(90,42,.7),(92,40,2.7)]:
        power(open_g, beat, pitch, duration, 89)
        note(bass, beat, pitch-12, duration+.05, 93)
        note(drums, beat, 36, .17, 91)
    melody(lead, 22, 40, [(0,29,.6,78),(1,27,.6,76),(2,26,.9,74)])
    melody(lead, 23, 40, [(0,24,2.5,81)])
    note(drums, 92, 49, .7, 70)
    return s


def sever_the_echo():
    s = score('Sever the Echo', 154, 28, .83)
    s['sections'] = [(0,'Three knocks / first hook'), (8,'Answering heads'),
                     (16,'Suppression / half-time space'), (20,'Hook united'),
                     (26,'Severed ending')]
    left, right, open_g, bass, lead, drums = guitars(s, 37)
    # C-sharp minor with 3+3+2 accents against a clear 4/4 backbeat.
    a = [
        [(0,0,.18),(.25,0,.12),(.75,7,.28),(1.5,0,.18),(2.25,3,.3),(3,2,.22),(3.5,0,.22)],
        [(0,0,.35),(.75,3,.25),(1.5,7,.3),(2.25,5,.3),(3,3,.25),(3.5,2,.2)],
    ]
    b = [
        [(0,5,.5),(.75,0,.2),(1.25,0,.18),(2,3,.45),(3,7,.5)],
        [(0,8,.5),(1,7,.3),(1.75,0,.2),(2.5,5,.4),(3.25,3,.35)],
    ]
    hook = [
        [(.25,19,.5,87),(1,27,.35,87),(1.75,26,.35,78),(2.5,24,.7,91),(3.5,19,.3,80)],
        [(0,22,.6,86),(.75,24,.7,88),(2,26,.35,79),(2.75,27,.35,85),(3.5,24,.35,88)],
    ]
    second = [
        [(0,29,.65,88),(1,27,.65,84),(2,24,.5,80),(2.75,26,.8,84)],
        [(.25,27,.6,84),(1.25,31,.6,90),(2.25,29,.4,82),(3,27,.65,83)],
    ]
    for bar in range(26):
        bridge = 16 <= bar < 20
        root = 37
        if bridge:
            roots = [42,40,45,44]
            root = roots[bar-16]
            pattern = [(0,0,1.15),(1.5,0,.3),(2.5,7,.55)]
        else:
            pattern = b[bar%2] if 8 <= bar < 16 else a[bar%2]
        rhythm(left, right, bass, drums, bar, root, pattern, .85 if bridge else 1)
        kit(drums, bar, half=bridge, ride=bar>=20, fill=bar in [7,15,19,25], strength=.8 if bridge else 1)
        if bar in [0,8,16,20]:
            note(drums, bar*4, 49, .65, 90)
            power(open_g, bar*4, root, 1.05, 92)
        if bridge:
            melody(lead, bar, 37, [(1,19,1.2,69),(3,24,.7,74)], .86)
        else:
            melody(lead, bar, 37, second[bar%2] if 8 <= bar < 16 else hook[bar%2])
        if bar in [5,13,23]:
            # The bass briefly answers the hook while rhythm holds the pedal.
            for beat,pitch in [(1.25,32),(2.75,28)]:note(bass,bar*4+beat,pitch,.18,84)
    # Three separated blows, then a single sustained resolution, not a hard cut.
    for at,pitch,duration in [(104,44,.5),(105.5,40,.5),(107,39,.6),(108,37,2.6)]:
        power(open_g,at,pitch,duration,96)
        power(left,at,pitch,min(duration,.6),100)
        power(right,at+.013,pitch,min(duration,.6),95)
        note(bass,at,pitch-12,duration,103)
        note(drums,at,36,.17,102)
    melody(lead,26,37,[(0,27,.7,83),(1.5,26,.7,79),(3,24,.55,84)])
    melody(lead,27,37,[(0,24,2.55,85)])
    note(drums,108,49,.8,82)
    return s


def lanterns_below():
    s=score('Lanterns Below',80,16,.59)
    s['sections']=[(0,'Lantern signal'),(4,'Empty streets'),(8,'A human answer'),(12,'Lantern signal returns')]
    g=track(s,'Near lantern / clean guitar','clean',0,27,.75,-.35)
    h=track(s,'Far lantern / answering notes','clean',1,27,.55,.45)
    b=track(s,'Warm low floor','bass',2,33,.52)
    p=track(s,'Buried air','atmosphere',3,92,.29,.15)
    d=track(s,'Distant floor toms','drums',9,0,.32)
    # The opening's E–F#–B contour becomes a slow, incomplete human signal.
    roots=[40,43,45,40,48,43,47,42,45,40,43,47,40,43,42,40]
    near=[
        [(0,24,1.1,75),(1.5,26,.8,64),(3,19,.7,67)],
        [(.5,24,1.15,68),(2.25,22,1.1,63)],
        [(0,27,1.35,71),(2.5,26,.9,65)],
        [(.5,24,2.3,71)],
    ]
    for bar,root in enumerate(roots):
        note(b,bar*4,root-12,3.1,64)
        if bar%2==0:
            note(p,bar*4,root,6.6,54)
            note(p,bar*4+.35,root+7,6.2,38)
        if bar<4 or bar>=12:
            melody(g,bar,40,near[bar%4],.82 if bar==15 else 1)
        elif bar<8:
            # Harmony gets a different phrase and leaves whole beats unanswered.
            melody(g,bar,40,[(.5,19+(bar%2)*3,1,67),(2.5,26-(bar%2)*2,.9,65)])
        else:
            melody(g,bar,40,[(0,27,.85,74),(1.5,26,.8,68),(3,24,.75,70)])
            melody(h,bar,40,[(1,31,.65,61),(2.5,29,.7,58)])
        if bar in [3,7,11]:
            melody(h,bar,40,[(2.25,31,.65,55),(3.25,26,.55,57)])
        if bar in [8,10,12]:
            note(d,bar*4,45,.3,57)
            note(d,bar*4+2.5,47,.25,45)
    # Last notes stop before the end so the release returns naturally to silence.
    return s


def vlq(number):
    number=int(number)
    data=[number&127]
    while number>>7:
        number>>=7
        data.insert(0,(number&127)|128)
    return bytes(data)


def meta(kind,data):
    if isinstance(data,str):data=data.encode('utf-8')
    return bytes([255,kind])+vlq(len(data))+data


def write(s,slug,out):
    end=s['bars']*4
    def chunk(events):
        data=bytearray();last=0
        for at,priority,event in sorted(events,key=lambda e:(e[0],e[1])):
            data.extend(vlq(at-last)+event);last=at
        data.extend(vlq(end*PPQ-last)+b'\xff\x2f\x00')
        return b'MTrk'+struct.pack('>I',len(data))+data
    conductor=[(0,0,meta(3,s['title'])),
               (0,1,meta(81,round(60000000/s['bpm']).to_bytes(3,'big'))),
               (0,2,meta(88,bytes([4,2,24,8]))),
               (0,3,meta(1,'Original Beneath The Shadow composition; procedural instruments; no source-song input.'))]
    for bar,title in s['sections']:
        conductor.append((bar*4*PPQ,4,meta(6,title)))
    chunks=[chunk(conductor)]
    for t in s['tracks']:
        t['notes'].sort(key=lambda n:(n['start'],n['pitch']))
        prior={}
        for n in t['notes']:
            old=prior.get(n['pitch'])
            if old and old['start']+old['duration']>=n['start']:
                old['duration']=round(n['start']-old['start']-.01,5)
            prior[n['pitch']]=n
            assert 0<=n['start']<end and n['start']+n['duration']<=end
            assert 0<n['velocity']<=127 and 0<=n['pitch']<=127
        assert all(n['duration']>0 for n in t['notes']), (slug,t['name'])
        ch=t['channel']
        events=[(0,0,meta(3,t['name'])),(0,1,bytes([192|ch,t['program']])),
                (0,2,bytes([176|ch,7,round(t['volume']*100)])),
                (0,3,bytes([176|ch,10,round((t['pan']+1)*63.5)]))]
        for n in t['notes']:
            events.extend([(round(n['start']*PPQ),10,bytes([144|ch,n['pitch'],n['velocity']])),
                           (round((n['start']+n['duration'])*PPQ),5,bytes([128|ch,n['pitch'],0]))])
        chunks.append(chunk(events))
    (out/(slug+'.mid')).write_bytes(b'MThd'+struct.pack('>IHHH',6,1,len(chunks),PPQ)+b''.join(chunks))
    (out/(slug+'.json')).write_text(json.dumps(s,indent=2)+'\n')
    print(json.dumps(dict(id=slug,bpm=s['bpm'],seconds=end*60/s['bpm'],bars=s['bars'],
                          tracks=len(s['tracks']),notes=sum(len(t['notes']) for t in s['tracks']))))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output',type=Path)
    args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=True)
    for slug,make in [('shadow-running',shadow_running),('sever-the-echo',sever_the_echo),('lanterns-below',lanterns_below)]:
        write(make(),slug,args.output)


if __name__=='__main__':main()
