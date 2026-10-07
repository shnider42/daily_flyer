"""Reviewed patch archive: no scraping-based status decisions or recurrent job.
Build static native disclosures so notes remain readable without JavaScript.
Run after an intentional patch_notes edit, then publish_assets.py.
"""
from __future__ import annotations
import argparse
import copy
import hashlib
import html
import json
import re
import subprocess
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

ROOT=Path('hllv_tracker')
HERE=Path(__file__).parent
BASE_BLOB='9de0b9515ba0a83f3598a61f8740fe8d761eac47'
START='<!-- PATCH NOTES START -->'
END='<!-- PATCH NOTES END -->'
REVIEW_DATE='2026-10-07'
ALLOWED={'www.hellletloose.com','hellletloose.com','steamcommunity.com','store.steampowered.com'}


def blob(raw):
    return hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()


def validate(notes, data):
    assert isinstance(notes,list) and notes, 'No curated notes'
    ids=set(); issues={i['id'] for i in data['issues']}
    for n in notes:
        assert re.fullmatch(r'(patch|update|hotfix)-[0-9]+(?:-[0-9]+)+',n['id'])
        assert n['id'] not in ids; ids.add(n['id'])
        assert date.fromisoformat(n['date'])<=date.fromisoformat(REVIEW_DATE)
        for key in ['title','headline','date_label','scope','source_title','review_basis','caution']:
            assert isinstance(n[key],str) and n[key].strip(), key
        assert 1<=len(n['highlights'])<=4 and all(isinstance(x,str) and x.strip() for x in n['highlights'])
        u=urlsplit(n['source_url'])
        assert u.scheme=='https' and u.hostname in ALLOWED and not u.username and not u.password
        assert '/blog/hllv-' in u.path or '/games/3079210/announcements/detail/' in u.path
        assert 1<=len(n['related_issues'])<=3 and set(n['related_issues'])<=issues
    assert len(notes)==8, 'Reconsider coverage text when deliberately expanding the archive'


def render(notes, data):
    esc=lambda x:html.escape(str(x),quote=True)
    issues={i['id']:i for i in data['issues']}
    ordered=sorted(notes,key=lambda n:n['date'],reverse=True)
    rows=[]
    for number,n in enumerate(ordered):
        d=date.fromisoformat(n['date']); date_text=f'{d:%b} {d.day}, {d.year}'
        latest='<span class="patch-latest">Latest reviewed</span>' if number==0 else ''
        highlights=''.join('<li>'+esc(x)+'</li>' for x in n['highlights'])
        related=''.join(f'<a href="#{esc(i)}" data-patch-issue="{esc(i)}">{esc(issues[i]["title"])} →</a>' for i in n['related_issues'])
        date_note=f'<p>{esc(n["date_note"])}</p>' if n.get('date_note') else ''
        rows.append(f'''<details class="patch-entry" id="{esc(n['id'])}">
<summary><span class="patch-summary-copy"><span class="patch-titleline"><span class="patch-title">{esc(n['title'])}</span>{latest}</span><span class="patch-date">{esc(n['date_label'])} <time datetime="{esc(n['date'])}">{esc(date_text)}</time></span><span class="patch-headline">{esc(n['headline'])}</span></span></summary>
<div class="patch-body"><p class="patch-scope">{esc(n['scope'])}</p><ul class="patch-highlights">{highlights}</ul><p class="patch-caution"><strong>Keep in mind:</strong> {esc(n['caution'])}</p><div class="patch-links"><a class="patch-official" href="{esc(n['source_url'])}" target="_blank" rel="noopener noreferrer" aria-label="Read official notes for {esc(n['title'])}">Read official notes ↗</a></div><span class="patch-related-label">Related tracked issues — check their individual status</span><div class="patch-related">{related}</div><details class="patch-provenance"><summary>Source &amp; summary details</summary><p>Official publisher: Hell Let Loose / Team17. {esc(n['source_title'])}.</p><p>{esc(n['review_basis'])}</p>{date_note}<p>Summary reviewed {REVIEW_DATE}. Selected changes, not a complete changelog or independent gameplay verification.</p></details></div>
</details>''')
    return START+'''\n<section class="patch-archive" id="patch-notes" aria-labelledby="patchNotesHeading"><span class="section-kicker">Released updates</span><h2 id="patchNotesHeading" tabindex="-1">Patch notes, at a glance</h2><p class="patch-intro">Tap an update for the highlights and official notes. A released change is not a guarantee that every related bug is gone.</p><p class="patch-coverage">8 reviewed releases · August 21–October 7, 2026 · Newest first</p><div class="patch-entries">'''+''.join(rows)+'</div></section>\n'+END


def check_source(n):
    req=Request(n['source_url'],headers={'User-Agent':'Mozilla/5.0 HLLV-Patch-Summary-Check','Accept-Language':'en'})
    with urlopen(req,timeout=20) as r:
        assert r.status==200
        assert urlsplit(r.url).hostname in ALLOWED
        body=r.read(4_000_000).decode('utf-8',errors='replace')
        title=re.search(r'<title[^>]*>(.*?)</title>',body,re.S|re.I)
        assert title,'No document title'
        title=html.unescape(re.sub('<[^>]+>',' ',title.group(1)))
        assert n['title'].casefold() in title.casefold(), (n['id'],title)
    return {'id':n['id'],'url':n['source_url'],'http_status':200,'title':title,'checked_at':REVIEW_DATE,'scope':'Destination identity/accessibility, not independent claim validation'}


def replace_once(text,old,new):
    assert text.count(old)==1,'Reconcile changed integration point: '+old[:90]
    return text.replace(old,new,1)


def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--verify-links',action='store_true'); args=parser.parse_args()
    path=ROOT/'data/issues.json'; raw=path.read_bytes(); old=json.loads(raw)
    first='patch_notes' not in old
    if first:
        assert blob(raw)==BASE_BLOB,'Evidence changed; reconcile instead of overwriting'
    notes=json.loads((HERE/'notes.json').read_text()) if first else old['patch_notes']
    validate(notes,old)
    checks=[]
    if args.verify_links:
        with ThreadPoolExecutor(max_workers=4) as pool: checks=list(pool.map(check_source,notes))
    data=copy.deepcopy(old)
    if first:
        data['patch_notes']=notes
        data['patch_notes_reviewed_at']=REVIEW_DATE
        data['page_updated_at']=datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z')
    assert data['issues']==old['issues'] and data['incidents']==old['incidents']
    assert data['generated_at']==old['generated_at'] and data['latest_change']==old['latest_change']
    data_bytes=(json.dumps(data,ensure_ascii=False,indent=2)+'\n').encode()
    path.write_bytes(data_bytes)
    page=ROOT/'index.html'; markup=page.read_text(); section=render(notes,data)
    if START in markup:
        assert markup.count(START)==markup.count(END)==1
        a=markup.index(START); b=markup.index(END)+len(END)
        markup=markup[:a]+section+markup[b:]
    else:
        marker='      <div class="method-note"><strong>Evidence first.</strong><span>Sources show what each claim supports, its limits, and what has not been independently checked.</span></div>'
        markup=replace_once(markup,marker,marker+'\n      '+section)
        css=(HERE/'archive.css').read_text()
        markup=replace_once(markup,'</head>','  <style id="patch-archive-style">\n'+css+'  </style>\n</head>')
        old_button='<button class="primary-action" id="browseIssues">View current issues <span>→</span></button>'
        markup=replace_once(markup,old_button,old_button+'<a class="patch-jump" id="patchNotesJump" href="#patch-notes">Read patch summaries ↓</a>')
        markup=replace_once(markup,'<small>HLLV issue tracker</small>','<small>HLLV patches &amp; bugs</small>')
        markup=replace_once(markup,'See what is broken, what changed, and what is actually confirmed.','Catch up on patches. Check what is broken and what is confirmed.')
        markup=replace_once(markup,"document.title='HLLV Bug Tracker'","document.title='Infierno Liberado · Patch notes & bugs'")
        route="else if(hash==='issues')showHome(false);else showLanding(false)}"
        replacement="else if(hash==='issues')showHome(false);else if(hash==='patch-notes'){showLanding(false);requestAnimationFrame(()=>document.getElementById('patch-notes').scrollIntoView({behavior:'instant'}))}else showLanding(false)}"
        markup=replace_once(markup,route,replacement)
        listener="    document.getElementById('patchNotesJump').addEventListener('click',e=>{e.preventDefault();history.pushState(null,'','#patch-notes');showLanding(false);document.getElementById('patch-notes').scrollIntoView({behavior:'instant'});document.getElementById('patchNotesHeading').focus({preventScroll:true})});\n    document.querySelectorAll('[data-patch-issue]').forEach(a=>a.addEventListener('click',e=>{if(dataset){e.preventDefault();selectIssue(a.dataset.patchIssue,true)}}));\n"
        markup=replace_once(markup,"    window.addEventListener('popstate'",listener+"    window.addEventListener('popstate'")
    page.write_text(markup,encoding='utf-8')
    # Publication can move forward without rewriting the immutable evidence-review record.
    test=Path('.github/hllv-refresh-20261007/test_refresh.py'); text=test.read_text()
    text=text.replace("assert data['page_updated_at']==report['page_updated_at']","# Later UI publications retain the original evidence review time.\n    assert data['page_updated_at']>=report['page_updated_at']")
    test.write_text(text,encoding='utf-8')
    subprocess.run(['python3','.github/hllv-evidence/publish_assets.py'],check=True)
    report={'archive_reviewed_at':REVIEW_DATE,'page_updated_at':data['page_updated_at'],'releases':len(notes),'newest_release':'Patch 1.6','oldest_included_release':'Patch 1.2','issue_count':len(data['issues']),'issue_records_unchanged':True,'evidence_review_date_unchanged':True,'source_access_checks':checks,'note':'This adds selected patch summaries, not a complete release history or new independent gameplay checks. Older summaries reuse recorded official release evidence.','rollback_commit':'665850a5b5df703cc65dafd04ad09661902cb742'}
    review=ROOT/'reviews/2026-10-07-patch-archive.json'
    if first or not review.exists(): review.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    doc=ROOT/'PATCH_NOTES.md'
    doc.write_text('''# Patch summaries on Overview

The bottom of Overview contains native HTML details/summary disclosures, one per reviewed release, newest first. All begin collapsed. Official links and the summaries remain readable without JavaScript. Related-issue links use the existing bug tracker; a patch mention never changes the linked issue status.

Initial coverage: eight releases represented in the existing ledger, Patch 1.2 through Patch 1.6. This is selected coverage, not a claim of a complete launch-to-current archive. Do not include community feedback posts, preview videos or announced targets as released patches. Dates distinguish publication from live announcements where those differ. The initial summaries for 1.2, 1.3 and 1.4 reuse the ledger's previously reviewed release evidence; a fresh link check is not a new full-source audit.

## Deliberate future updates

Edit `patch_notes` inside `data/issues.json`, preserving source URLs, precise dates, release scope and caveats. Set `patch_notes_reviewed_at` only after reviewing the summaries and `page_updated_at` when deliberately publishing a page update. Do not bump bug-evidence dates for a UI-only edit. Run `.github/hllv-patches/build.py`, then the existing and archive tests. The builder invokes `publish_assets.py` so the rendered archive, page timestamp and content-addressed data are deployed together. Update the coverage assertion/caption when expanding beyond the initial eight releases. Never change old immutable snapshots.

The GitHub workflow is an on-change test-and-publication job, not a recurring news scraper. The separate ChatGPT daily watch sends alerts only; it does not edit or deploy the site.
''')
    print('PATCH_ARCHIVE_READY',json.dumps(report,ensure_ascii=False))

if __name__=='__main__': main()
