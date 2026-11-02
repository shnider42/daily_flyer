#!/usr/bin/env python3
"""Validate the written album and decoded audio; does not assess artistic quality."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import subprocess
import numpy as np
from compose_album import SPECS, compose


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory',type=Path)
    args=parser.parse_args();root=args.directory
    manifest=json.loads((root/'manifest.json').read_text())
    assert len(manifest['tracks'])==9
    assert Counter(t['family'] for t in manifest['tracks'])=={'gallop':3,'hybrid':3,'glam':3}
    hashes=set();audio_hashes=set();results=[]
    for spec,entry in zip(SPECS,manifest['tracks']):
        score=compose(spec)
        digest=hashlib.sha256(json.dumps(score,sort_keys=True).encode()).hexdigest()
        assert digest not in hashes;hashes.add(digest)
        assert entry['id']==spec['id']
        assert len(entry['sections'])>=5
        path=root/(entry['id']+'.mp3')
        encoded=path.read_bytes();adigest=hashlib.sha256(encoded).hexdigest()
        assert adigest not in audio_hashes;audio_hashes.add(adigest)
        decoded=subprocess.run(['ffmpeg','-v','error','-i',str(path),'-f','f32le','-ac','2','-ar','44100','pipe:1'],capture_output=True,check=True).stdout
        audio=np.frombuffer(decoded,dtype='<f4').reshape(-1,2)
        duration=len(audio)/44100
        assert 45<=duration<=70, (entry['id'],duration)
        peak=float(np.max(np.abs(audio)));rms=float(np.sqrt(np.mean(audio**2)))
        assert .15<peak<1, (entry['id'],peak)
        assert .035<rms<.35, (entry['id'],rms)
        active=audio[:int(spec['bars']*4*60/spec['bpm']*44100)]
        seconds=[float(np.sqrt(np.mean(active[n:n+44100]**2))) for n in range(0,len(active)-44100,44100)]
        min_rms=min(seconds)
        assert min_rms>.002, (entry['id'],'unintended silence',min_rms)
        assert np.std(audio[:,0]-audio[:,1])>.002, (entry['id'],'not stereo')
        results.append({'id':entry['id'],'duration':round(duration,3),'bytes':len(encoded),'peakDbfs':round(20*np.log10(peak),2),'rmsDbfs':round(20*np.log10(rms),2),'quietestWrittenSecondDbfs':round(20*np.log10(min_rms),2),'scoreSha256':digest,'audioSha256':adigest})
    result={'checks':'Nine unique scores and recordings; three per family; section metadata; valid decoded durations; no clipping; non-silent written sections; stereo content.','audition':'Numerical QC only; physical phone-speaker listening not verified.','totalBytes':sum(r['bytes'] for r in results),'tracks':results}
    (root/'quality.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2))

if __name__=='__main__':main()
