"""Reply-level monitoring of existing, public HLLV Steam evidence threads.
No login, browser automation, status inference, or private application data.
Only reviewed staff IDs plus Steam's current developer marker qualify. New
identities wait for review. HTTP success alone never establishes full coverage.
"""
from __future__ import annotations
import copy, hashlib, json, math, re, time
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit, parse_qs
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.robotparser import RobotFileParser

AGENT='HLLV-Source-Monitor/1.0 (+https://hllv-bug-track.onrender.com/)'
HOST='https://steamcommunity.com'
BASE_ID=76561197960265728
MAX_PAGES=12
MAX_REQUESTS=100
MAX_SECONDS=300
REGISTRY=Path(__file__).with_name('staff.json')

class CoverageError(Exception):
    def __init__(self,kind): self.kind=kind;super().__init__(kind)

def stamp(d): return d.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z')
def date(s): return datetime.fromisoformat(s.replace('Z','+00:00'))
def thread_url(url):
    u=urlsplit(url)
    if u.scheme!='https' or u.hostname!='steamcommunity.com' or u.username or u.password or u.port not in (None,443):raise CoverageError('unsafe_destination')
    if not re.fullmatch(r'/app/3079210/discussions/[01]/[0-9]+/',u.path):raise CoverageError('outside_scope')
    if set(parse_qs(u.query)) - {'ctp','l'}:raise CoverageError('unsafe_query')
    return HOST+u.path

class Node:
    def __init__(self,tag='',attrs=()): self.tag=tag;self.attrs=dict(attrs);self.children=[]
    def has(self,c):return c in self.attrs.get('class','').split()
    def all(self,p):
        out=[]
        for n in self.children:
            if isinstance(n,Node):
                if p(n):out.append(n)
                out.extend(n.all(p))
        return out
    def first(self,p):
        ns=self.all(p);return ns[0] if ns else None
    def text(self,quotes=True):
        if self.tag in ('script','style') or (not quotes and (self.tag=='blockquote' or any(self.has(x) for x in ('bb_quote','quote','forum_quote')))):return ''
        return ' '.join(n.text(quotes) if isinstance(n,Node) else n for n in self.children)

class Tree(HTMLParser):
    VOID={'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}
    def __init__(self,html):
        super().__init__(convert_charrefs=True);self.root=Node();self.stack=[self.root];self.nodes=0;self.feed(html)
    def handle_starttag(self,tag,attrs):
        self.nodes+=1
        if self.nodes>60000 or len(self.stack)>120:raise CoverageError('markup_limit')
        n=Node(tag,attrs);self.stack[-1].children.append(n)
        if tag not in self.VOID:self.stack.append(n)
    def handle_startendtag(self,tag,attrs):self.handle_starttag(tag,attrs);self.handle_endtag(tag)
    def handle_endtag(self,tag):
        for i in range(len(self.stack)-1,0,-1):
            if self.stack[i].tag==tag:del self.stack[i:];break
    def handle_data(self,s):self.stack[-1].children.append(s)

def clean(s):return re.sub(r'\s+',' ',s).strip()
def timestamp(node,now):
    raw=node.attrs.get('data-timestamp','') if node else ''
    if not re.fullmatch(r'[0-9]{10}',raw):raise CoverageError('missing_timestamp')
    d=datetime.fromtimestamp(int(raw),timezone.utc)
    if int(raw)<1577836800 or (d-now).total_seconds()>300:raise CoverageError('invalid_timestamp')
    return stamp(d)

def author_identity(a):
    if a is None:raise CoverageError('missing_author')
    u=urlsplit(a.attrs.get('href',''));mini=a.attrs.get('data-miniprofile','')
    if u.scheme!='https' or u.hostname!='steamcommunity.com' or u.username or u.password or u.port not in (None,443):raise CoverageError('invalid_author')
    profile=re.fullmatch(r'/profiles/([0-9]{17})/?',u.path)
    vanity=re.fullmatch(r'/id/[A-Za-z0-9_-]+/?',u.path)
    if not(profile or vanity):raise CoverageError('invalid_author')
    inferred=str(BASE_ID+int(mini)) if mini.isdigit() and 0<int(mini)<2**32 else None
    direct=profile[1] if profile else None
    if direct and inferred and direct!=inferred:raise CoverageError('author_id_mismatch')
    if not(direct or inferred):raise CoverageError('missing_author_id')
    return direct or inferred

def parse_page(raw,url,now,registry,page=1):
    canonical=thread_url(url);topic=canonical.rstrip('/').split('/')[-1]
    html=raw.decode('utf-8','strict') if isinstance(raw,bytes) else raw
    doc=Tree(html).root
    op=doc.first(lambda n:n.attrs.get('id')=='forum_op_'+topic)
    if not op:raise CoverageError('missing_thread_markup')
    metas=[]
    for script in doc.all(lambda n:n.tag=='script'):
        text=''.join(x for x in script.children if isinstance(x,str))
        for match in re.finditer(r'InitializeCommentThread\(\s*"ForumTopic"\s*,\s*"[^"]+"\s*,\s*',text):
            try:obj,_=json.JSONDecoder().raw_decode(text[match.end():]);metas.append(obj)
            except ValueError:raise CoverageError('invalid_pagination')
    if len(metas)!=1:raise CoverageError('missing_pagination')
    meta=metas[0]
    try:extra=json.loads(meta['extended_data'])
    except (KeyError,TypeError,ValueError):raise CoverageError('invalid_pagination')
    if str(meta.get('feature2'))!=topic or extra.get('forum_appid')!=3079210 or extra.get('forum_public')!=1:raise CoverageError('wrong_thread')
    total,start,size=(meta.get(x) for x in ('total_count','start','pagesize'))
    if any(type(v)!=int for v in (total,start,size)) or not 0<=total<=100000 or not 1<=size<=100 or start!=(page-1)*size or meta.get('oldestfirst') is not True:raise CoverageError('invalid_pagination')
    comments=doc.all(lambda n:n.has('commentthread_comment'))
    if len(comments)!=min(size,max(0,total-start)):raise CoverageError('incomplete_comment_markup')
    seen=set();replies=[];unknown={}
    for c in comments:
        m=re.fullmatch(r'comment_([0-9]+)',c.attrs.get('id',''))
        if not m or m[1] in seen:raise CoverageError('invalid_comment_id')
        cid=m[1];seen.add(cid)
        header=c.first(lambda n:n.has('commentthread_comment_author'))
        if not header:raise CoverageError('missing_author')
        a=header.first(lambda n:n.tag=='a' and n.has('commentthread_author_link'))
        identity=author_identity(a)
        badge=header.first(lambda n:n.has('commentthread_workshop_authorbadge'))
        is_dev=a.has('commentthread_author_developer') and badge is not None and clean(badge.text()).lower()=='[developer]'
        account=registry.get(identity)
        permalink=canonical+'?ctp='+str(page)+'#c'+cid
        if not account or not account.get('active') or not is_dev or date(account['review_due_at'])<now:
            if is_dev or account:
                unknown[identity]={'steam_id':identity,'profile_url':HOST+'/profiles/'+identity,'evidence_url':permalink,'reason':'unreviewed_identity' if not account else 'identity_review_due' if date(account['review_due_at'])<now else 'badge_or_access_changed'}
            continue
        body=c.first(lambda n:n.has('commentthread_comment_text'))
        if body is None:raise CoverageError('missing_reply_text')
        own=clean(body.text(quotes=False))
        if not own:continue
        posted=timestamp(header.first(lambda n:n.has('commentthread_comment_timestamp') and 'data-timestamp' in n.attrs),now)
        audit=c.first(lambda n:n.has('forum_audit'))
        edited_node=audit.first(lambda n:'data-timestamp' in n.attrs) if audit else None
        edited=timestamp(edited_node,now) if edited_node else None
        if edited and edited<posted:raise CoverageError('invalid_edit_time')
        replies.append({'id':cid,'response_url':permalink,'steam_id':identity,'profile_url':HOST+'/profiles/'+identity,'author_label':account['label'],'source_category':account['category'],'published_at':posted,'source_edited_at':edited,'content_sha256':hashlib.sha256(own.encode()).hexdigest(),'_text':own,'authority_checked_at':stamp(now)})
    title=doc.first(lambda n:n.attrs.get('id')=='forum_op_topic_'+topic)
    return {'total':total,'pagesize':size,'start':start,'pages':max(1,math.ceil(total/size)),'comments':seen,'replies':replies,'identities_pending':list(unknown.values()),'title':clean(title.text())[:250] if title else 'Tracked discussion'}

class Client:
    """Anonymous public GETs only. Respect robots and stop on access restrictions."""
    def __init__(self):
        self.started=time.monotonic();self.requests=0;self.last=0.;self.blocked=None;self.delay=1.;self.rules=None
        class Redirect(HTTPRedirectHandler):
            def redirect_request(_,req,fp,code,msg,headers,newurl):
                if newurl!=HOST+'/robots.txt' and thread_url(newurl)!=thread_url(req.full_url):raise CoverageError('unexpected_redirect')
                return super().redirect_request(req,fp,code,msg,headers,newurl)
        self.opener=build_opener(Redirect())
    def get(self,url):
        if self.blocked:raise CoverageError('deferred_'+self.blocked)
        if url!=HOST+'/robots.txt':
            thread_url(url)
            if self.rules is None:
                robots=self.get(HOST+'/robots.txt').decode('utf-8','replace');self.rules=RobotFileParser();self.rules.parse(robots.splitlines());self.delay=max(1.,float(self.rules.crawl_delay(AGENT) or 1))
            if not self.rules.can_fetch(AGENT,url):raise CoverageError('robots_restricted')
        for attempt in range(2):
            if self.requests>=MAX_REQUESTS or time.monotonic()-self.started>MAX_SECONDS:raise CoverageError('run_budget')
            time.sleep(max(0,self.delay-(time.monotonic()-self.last)));self.last=time.monotonic();self.requests+=1
            try:
                with self.opener.open(Request(url,headers={'User-Agent':AGENT,'Accept-Language':'en','Accept':'text/html,text/plain'}),timeout=15) as r:
                    if url!=HOST+'/robots.txt' and thread_url(r.url)!=thread_url(url):raise CoverageError('wrong_destination')
                    raw=r.read(4000001)
                    if len(raw)>4000000:raise CoverageError('response_too_large')
                    return raw
            except HTTPError as e:
                if url==HOST+'/robots.txt' and e.code==404:return b'User-agent: *\nDisallow:\n'
                if e.code in (401,403,429):self.blocked='rate_limited' if e.code==429 else 'access_restricted';raise CoverageError(self.blocked)
                if e.code not in (500,502,503,504) or attempt:raise CoverageError('http_'+str(e.code))
            except (URLError,TimeoutError):
                if attempt:raise CoverageError('temporarily_unavailable')
            time.sleep(2)
        raise CoverageError('temporarily_unavailable')

def targets(issues):
    result={}
    for i in issues:
        for s in i.get('sources',[]):
            try:u=thread_url(s.get('url',''))
            except (ValueError,CoverageError):continue
            row=result.setdefault(u,{'url':u,'tracked_issue_ids':[]})
            if i['id'] not in row['tracked_issue_ids']:row['tracked_issue_ids'].append(i['id'])
    return sorted(result.values(),key=lambda x:x['url'])

def merge_replies(old,new,at,baseline):
    """Keep hash history, not a duplicate public archive of complete forum text."""
    saved={r['id']:copy.deepcopy(r) for r in old};changes=[]
    for r in new:
        r=copy.deepcopy(r);body=r.pop('_text');prior=saved.get(r['id']);r['_text']=body
        if prior:
            r.update(first_seen_at=prior['first_seen_at'],last_seen_at=at,last_changed_at=prior['last_changed_at'],change_kind=prior['change_kind'],previous_hashes=prior.get('previous_hashes',[]))
            if prior['content_sha256']!=r['content_sha256']:
                r['previous_hashes']=(r['previous_hashes']+[{'hash':prior['content_sha256'],'superseded_at':at}])[-10:]
                r.update(change_kind='edited',last_changed_at=at);changes.append({'id':r['id'],'kind':'edited','detected_at':at})
        else:
            # Newly discovered old replies are evidence discovery, not new activity.
            kind='baseline' if not baseline else 'new_reply' if r['published_at']>baseline else 'historical_discovery'
            r.update(first_seen_at=at,last_seen_at=at,last_changed_at=at,change_kind=kind,previous_hashes=[])
            if kind!='baseline':changes.append({'id':r['id'],'kind':kind,'detected_at':at})
        saved[r['id']]=r
    values=sorted(saved.values(),key=lambda x:(x['published_at'],x['id']),reverse=True)
    # At most eighteen quoted words per thread, on its latest available reply.
    preview=next((r for r in values if '_text' in r),None)
    for r in values:
        text=r.pop('_text',None)
        if r is preview:r['excerpt']=' '.join(text.split()[:18])
        elif preview:r.pop('excerpt',None)
    return values,changes

def collect(issues,previous,now,fetcher=None,registry=None):
    at=stamp(now);registry=registry if registry is not None else json.loads(REGISTRY.read_text())['accounts']
    reg={a['steam_id']:a for a in registry};fetcher=fetcher or Client().get
    old={x['url']:x for x in previous.get('threads',[])};out=[]
    for target in targets(issues):
        url=target['url'];past=old.get(url,{});seen=set();found=[];unknown={};pages_ok=0;expected=None;comments_expected=None;failure=None;title=past.get('title','Tracked discussion')
        try:
            first=None
            for page in range(1,MAX_PAGES+1):
                parsed=parse_page(fetcher(url+'?ctp='+str(page)+'&l=english'),url,now,reg,page)
                if first is None:first=parsed;expected=parsed['pages'];comments_expected=parsed['total'];title=parsed['title']
                if parsed['total']!=first['total'] or parsed['pagesize']!=first['pagesize']:raise CoverageError('thread_changed_during_scan')
                if seen & parsed['comments']:raise CoverageError('duplicate_page')
                seen.update(parsed['comments']);found.extend(parsed['replies']);unknown.update({a['steam_id']:a for a in parsed['identities_pending']});pages_ok+=1
                if page>=expected:break
            if pages_ok!=expected:raise CoverageError('page_budget')
            if len(seen)!=comments_expected:raise CoverageError('incomplete_comments')
        except CoverageError as e:failure=e.kind
        except Exception:failure='parser_error'
        state='complete' if failure is None else 'partial' if pages_ok else 'unavailable'
        replies,changes=merge_replies(past.get('replies',[]),found,at,past.get('baseline_at'))
        for r in replies:r['observed_this_run']=r['id'] in {x['id'] for x in found}
        if failure:
            for a in past.get('identities_pending',[]):unknown.setdefault(a['steam_id'],a)
        row={**target,'title':title,'state':state,'failure_kind':failure,'pages_checked':pages_ok,'pages_expected':expected,'comments_seen':len(seen),'comments_expected':comments_expected,'last_attempt_at':at,'last_complete_at':at if state=='complete' else past.get('last_complete_at'),'baseline_at':past.get('baseline_at') or (at if state=='complete' else None),'replies':replies,'identities_pending':list(unknown.values()),'changes_this_run':changes}
        out.append(row)
    complete=sum(t['state']=='complete' for t in out);qualifying=sum(len(t['replies']) for t in out)
    overall='complete' if out and complete==len(out) else 'partial' if complete or any(t['pages_checked'] for t in out) else 'unavailable' if out else 'no_monitored_threads'
    return {'schema_version':1,'scope':'Existing Steam discussion links in the reviewed tracker only','discovery_enabled':False,'affiliate_channels_enabled':False,'state':overall,'last_attempt_at':at,'last_complete_at':at if overall=='complete' else previous.get('last_complete_at'),'threads_total':len(out),'threads_complete':complete,'verified_responses_retained':qualifying,'identities_pending':len({a['steam_id'] for t in out for a in t['identities_pending']}),'new_replies_this_run':sum(c['kind']=='new_reply' for t in out for c in t['changes_this_run']),'edited_replies_this_run':sum(c['kind']=='edited' for t in out for c in t['changes_this_run']),'threads':out,'interpretation':'Response detection only; no reviewed bug status or developer commitment is inferred.'}

if __name__=='__main__':
    root=Path('hllv_tracker');path=root/'official-feed.json';feed=json.loads(path.read_text());before=(root/'data/issues.json').read_bytes()
    result=collect(json.loads(before)['issues'],feed.get('response_monitor',{}),datetime.now(timezone.utc));feed['response_monitor']=result
    tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(feed,ensure_ascii=False,indent=2)+'\n');tmp.replace(path)
    assert (root/'data/issues.json').read_bytes()==before
    print(json.dumps({k:v for k,v in result.items() if k!='threads'}))
