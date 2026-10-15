"""Nightly public-source collection. Never change the reviewed issue ledger or Auth.
Only official Steam announcements are auto-published; existing source links are checked
separately. Text, network destinations and payload sizes are treated as untrusted.
"""
from __future__ import annotations
import concurrent.futures, hashlib, html, json, re, time
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError
ROOT=Path('hllv_tracker');OUTPUT=ROOT/'official-feed.json'
API='https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=3079210&count=100&maxlength=0&feeds=steam_community_announcements'
HOSTS={'api.steampowered.com','steamcommunity.com','store.steampowered.com','steamstore-a.akamaihd.net','www.hellletloose.com','hellletloose.com','www.reddit.com','reddit.com'}

def allowed(url):
    u=urlsplit(url)
    if u.scheme!='https' or u.hostname not in HOSTS or u.username or u.password or u.port not in (None,443):return False
    if u.hostname=='api.steampowered.com':return u.path.startswith('/ISteamNews/GetNewsForApp/')
    if u.hostname=='steamstore-a.akamaihd.net':return u.path.startswith('/news/externalpost/steam_community_announcements/')
    return True

class Redirect(HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        if not allowed(newurl):raise ValueError('Redirect outside source allowlist')
        return super().redirect_request(req,fp,code,msg,headers,newurl)

def fetch(url,maxbytes=4_000_000):
    if not allowed(url):raise ValueError('URL outside source allowlist')
    request=Request(url,headers={'User-Agent':'Mozilla/5.0 HLLV-Source-Collection/1.0','Accept-Language':'en'})
    with build_opener(Redirect()).open(request,timeout=18) as r:
        raw=r.read(maxbytes+1)
        if len(raw)>maxbytes:raise ValueError('Source exceeds size limit')
        return r.status,r.url,raw

class Plain(HTMLParser):
    def __init__(self):super().__init__();self.parts=[];self.skip=0
    def handle_starttag(self,tag,attrs):
        if tag in ('script','style'):self.skip+=1
        if tag in ('p','br','li','div','h1','h2','h3'):self.parts.append(' ')
    def handle_endtag(self,tag):
        if tag in ('script','style'):self.skip=max(0,self.skip-1)
        self.parts.append(' ')
    def handle_data(self,text):
        if not self.skip:self.parts.append(text)

def plain(text):
    text=re.sub(r'\[img[^]]*\].*?\[/img\]|\[previewyoutube[^]]*\].*?\[/previewyoutube\]',' ',str(text),flags=re.S|re.I)
    text=re.sub(r'\[/?[a-zA-Z*][^]]*\]',' ',text)
    parser=Plain();parser.feed(text)
    return re.sub(r'\s+',' ',html.unescape(''.join(parser.parts))).strip()

def normalize(raw,now,issues):
    obj=json.loads(raw)
    if obj.get('appnews',{}).get('appid')!=3079210:raise ValueError('Wrong app ID')
    news=obj['appnews'].get('newsitems')
    if not isinstance(news,list) or not news:raise ValueError('Empty or malformed official feed')
    seen=set();items=[]
    stop={'the','and','can','could','while','after','when','with','from','into','not','are','was','were','for','but','all','some','only','more','than','have','has','their','does','did','now','without','over','get','one','new'}
    for post in news:
        if post.get('feedname')!='steam_community_announcements':continue
        gid=str(post.get('gid',''));title=plain(post.get('title',''));url=post.get('url','');timestamp=post.get('date')
        if not gid.isdigit() or gid in seen or not title or len(title)>300 or not allowed(url):raise ValueError('Invalid official entry')
        if urlsplit(url).hostname in {'api.steampowered.com','www.reddit.com','reddit.com'}:raise ValueError('Not an official announcement destination')
        if type(timestamp) is not int or timestamp>now.timestamp()+300 or timestamp<1609459200:raise ValueError('Invalid announcement date')
        seen.add(gid);body=plain(post.get('contents',''))
        if not body:raise ValueError('Official post has no text')
        matches=[];words=set(re.findall(r'[a-z]{4,}',body.lower()))
        for issue in issues:
            tokens=set(re.findall(r'[a-z]{4,}',issue['title'].lower()))-stop
            if len(tokens&words)>=max(2,min(4,len(tokens))):matches.append(issue['id'])
        limit=max(0,24-len(title.split()))
        items.append({'id':gid,'title':title,'url':url,'published_at':datetime.fromtimestamp(timestamp,timezone.utc).isoformat().replace('+00:00','Z'),'category':'Patch / update announcement' if re.search(r'\b(patch|hotfix|update \d)',title,re.I) else 'Developer / community announcement','excerpt':' '.join(body.split()[:min(18,limit)]),'content_sha256':hashlib.sha256((title+'\n'+body).encode()).hexdigest(),'candidate_issue_ids':matches,'review_state':'automatically_collected'})
    if not items:raise ValueError('No official announcements returned')
    return sorted(items,key=lambda p:p['published_at'],reverse=True)[:40]

def check(url,at):
    out={'checked_at':at,'scope':'accessibility_only'}
    try:
        code,final,raw=fetch(url);body=raw.decode('utf-8','replace');m=re.search(r'<title[^>]*>(.*?)</title>',body,re.S|re.I)
        out.update(http_status=code,final_url=final,title=plain(m[1])[:300] if m else '')
    except HTTPError as e:out.update(http_status=e.code,error='HTTP '+str(e.code))
    except Exception:out.update(http_status=None,error='Source could not be checked')
    return url,out

def collect_responses(issues,previous,now):
    import importlib.util
    module_path=Path(__file__).parent.parent/'hllv-source-discovery/enrich.py'
    spec=importlib.util.spec_from_file_location('hllv_source_responses',module_path)
    response_module=importlib.util.module_from_spec(spec);spec.loader.exec_module(response_module)
    return response_module.collect(issues,previous,now)

def main():
    ledger=ROOT/'data/issues.json';before=ledger.read_bytes();data=json.loads(before);now=datetime.now(timezone.utc);at=now.replace(microsecond=0).isoformat().replace('+00:00','Z')
    previous=json.loads(OUTPUT.read_text()) if OUTPUT.exists() else {'schema_version':1,'items':[],'last_success_at':None,'link_checks':{}}
    out={**previous,'last_attempt_at':at,'schedule':'Nightly around 03:23 America/New_York','source':'Steam official publisher announcements for app 3079210','state':'ok','warnings':[]}
    try:
        _,_,raw=fetch(API,8_000_000);items=normalize(raw,now,data['issues'])
        old={x['id']:x for x in previous['items']}
        for item in items:
            past=old.get(item['id'],{});item['first_seen_at']=past.get('first_seen_at',at);item['last_changed_at']=past.get('last_changed_at',at) if past.get('content_sha256')==item['content_sha256'] else at
        combined={x['id']:x for x in previous['items']};combined.update({x['id']:x for x in items})
        out.update(items=sorted(combined.values(),key=lambda p:p['published_at'],reverse=True)[:60],last_success_at=at)
    except Exception as e:
        out['state']='feed_unavailable';out['warnings'].append('Official feed failed validation or could not be reached; previously collected posts retained.')
        print('SOURCE_FEED_UNAVAILABLE',type(e).__name__)
    urls=sorted({s['url'] for i in data['issues'] for s in i.get('sources',[]) if allowed(s.get('url',''))})
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:checks=dict(pool.map(lambda u:check(u,at),urls))
    out['link_checks']={**previous.get('link_checks',{}),**checks}
    out['unreachable_links']=sum(c['http_status']!=200 for c in checks.values())
    if out['unreachable_links']:out['warnings'].append('Some link checks failed. This does not establish deletion or invalidate older evidence.')
    # Reply-level monitoring is independent of announcement collection.
    import importlib.util
    out['response_monitor']=collect_responses(data['issues'],previous.get('response_monitor',{}),now)
    quality_path=Path(__file__).parent.parent/'hllv-source-responses/content_review.py'
    quality_spec=importlib.util.spec_from_file_location('hllv_response_content_review',quality_path)
    quality=importlib.util.module_from_spec(quality_spec);quality_spec.loader.exec_module(quality)
    quality.apply(out['response_monitor'])
    coverage=out['response_monitor']
    print('RESPONSE_COVERAGE',json.dumps({k:v for k,v in coverage.items() if k not in ('threads','discovery','affiliate_monitor')}))
    if coverage['state'] not in ('complete','no_monitored_threads'):
        out['warnings'].append('Discussion reply coverage is incomplete; inspect response_monitor for per-thread results. Announcement freshness does not establish discussion coverage.')
    # Bounded discovery is separate from existing-source coverage.
    discovery=coverage.get('discovery',{})
    if discovery.get('state') not in ('window_checked',):
        out['warnings'].append('Discovery is partial or has a backlog; this does not invalidate the separate existing-source check.')
    tmp=OUTPUT.with_suffix('.tmp');tmp.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n');tmp.replace(OUTPUT)
    assert ledger.read_bytes()==before,'A collector must not mutate reviewed bug evidence'
    print('SOURCE_COLLECTION',json.dumps({'state':out['state'],'posts':len(out['items']),'links_checked':len(checks),'unreachable_links':out['unreachable_links'],'last_success_at':out['last_success_at'],'reviewed_issue_records_unchanged':True}))
    Path('/tmp/hllv-source-result').write_text(out['state'])
if __name__=='__main__':main()
