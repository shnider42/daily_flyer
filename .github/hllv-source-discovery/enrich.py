"""Run existing evidence threads first, then bounded discovery and affiliate checks."""
import copy,importlib.util,json
from pathlib import Path
from datetime import datetime,timezone

def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
S=Path(__file__).parent

def collect(issues,previous,now,client=None):
    discovery=load('hllv_discovery',S/'discovery.py');c=discovery.c;client=client or c.Client()
    main=c.collect(issues,previous,now,client.get)
    try:
        main['discovery']=discovery.collect(issues,previous.get('discovery',{}),now,client)
    except Exception:
        saved=copy.deepcopy(previous.get('discovery',{}))
        saved.update(schema_version=1,enabled=True,state='unavailable',failure_kind='discovery_collector_error',last_attempt_at=c.stamp(now),threads_attempted_this_run=0,threads_complete_this_run=0)
        for t in saved.get('threads',[]):
            t['observed_this_run']=False;t['changes_this_run']=[]
            for r in t.get('replies',[]):r['observed_this_run']=False
        main['discovery']=saved
    main['affiliate_monitor']=load('hllv_affiliates',S/'affiliates.py').collect(previous.get('affiliate_monitor',{}),now)
    main['discovery_enabled']=True;main['affiliate_channels_enabled']=False
    main['scope']='Existing issue-source threads; bounded newly discovered Steam replies tracked separately. Affiliate content is not connected.'
    quality=load('hllv_quality',S.parent/'hllv-source-responses/content_review.py');quality.apply(main);quality.apply(main['discovery'])
    return main

def main():
    root=Path('hllv_tracker');path=root/'official-feed.json';raw=(root/'data/issues.json').read_bytes();feed=json.loads(path.read_text())
    feed['response_monitor']=collect(json.loads(raw)['issues'],feed.get('response_monitor',{}),datetime.now(timezone.utc))
    out=path.with_suffix('.tmp');out.write_text(json.dumps(feed,ensure_ascii=False,indent=2)+'\n');out.replace(path)
    assert (root/'data/issues.json').read_bytes()==raw
    d=feed['response_monitor']['discovery'];print('DISCOVERY_RESULT',json.dumps({k:v for k,v in d.items() if k not in('threads','candidates','listings')}))
if __name__=='__main__':main()
