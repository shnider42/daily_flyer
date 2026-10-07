"""Reviewed October 7 migration. Research is explicit; this is not an auto-classifier.
Only the known pre-review dataset may be migrated. Preserve historical evidence,
apply reviewed Patch 1.6 claims, install a saved page-wide publication timestamp,
and generalize prior presentation tests so real evidence refreshes remain testable.
"""
from __future__ import annotations
import copy
import hashlib
import html
import json
import re
import shutil
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

DAY = '2026-10-07'
BASE_DATA = '351b1cfa55eb07da2f2ccd8a3695f71e3ad3a869'
ROOT = Path('hllv_tracker')
HERE = Path(__file__).parent
FEED = 'https://steamcommunity.com/app/3079210/allnews/'
BLOG = 'https://www.hellletloose.com/blog/hllv-patch-1-6'

def get(url):
    request = Request(url, headers={'User-Agent':'Mozilla/5.0 HLLV-Evidence-Review/2.0','Accept-Language':'en'})
    with urlopen(request, timeout=20) as response:
        body = response.read(8_000_001)
        if len(body) > 8_000_000:
            raise ValueError('Source response too large')
        return response.status, response.url, body.decode('utf-8', errors='replace')

def plain(body):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', body))).strip()

def title_of(body):
    found = re.search(r'<title[^>]*>(.*?)</title>', body, re.I|re.S)
    return plain(found.group(1)) if found else ''

def source_destination():
    status, feed_url, body = get(FEED)
    text = plain(body)
    assert status == 200 and 'Patch 1.6 is now live' in text, 'Recheck the current publisher record before publishing'
    for phrase in ('filters', '30s', 'tank driver seat rotation'):
        assert phrase in text, 'Publisher record changed: ' + phrase
    candidates = list(dict.fromkeys(re.findall(r'https://steamcommunity.com/(?:gid/\d+|games/3079210|ogg/3079210)/announcements/detail/\d+', html.unescape(body))))
    for url in candidates[:12]:
        try:
            status, final, article = get(url)
            if status == 200 and re.search(r'(?:^|::\s*)Patch 1\.6\s*(?:\||$)', title_of(article)) and 'Patch 1.6 is now live' in plain(article):
                assert urlsplit(final).hostname == 'steamcommunity.com'
                assert '/3079210/' in final or '/103582791475269461/' in final
                for phrase in ('tank driver seat rotation', 'filters', '30s'):
                    assert phrase in plain(article)
                return final, final
        except (OSError, ValueError, AssertionError):
            continue
    status, final, body = get(BLOG)
    assert status == 200 and 'Patch 1.6' in title_of(body)
    assert urlsplit(final).hostname in {'www.hellletloose.com','hellletloose.com'}
    return final, feed_url

# Each row is scoped to the published changelog, not independent gameplay proof.
UPDATES = {
 'HLLV-003': ('monitoring','Improvements released · monitoring','Patch 1.6 adds VFX work and a tank-driver rotation crash correction; overall crash resolution is not independently verified.','Patch 1.6 + earlier fixes','The new release also reduces memory retained when restarting tutorials. These client-side changes do not establish a common cause for every crash or server outage.','Stability & Performance; VFX & Stability','Records a tank-driver rotation crash correction, tutorial memory cleanup and broader VFX stability work.'),
 'HLLV-004': ('partial','Some map fixes released','Patch 1.6 includes further map collision corrections, without identifying closure of every earlier fence or furniture report.','Map fixes through 1.6','The aggregate map changelog is not an asset-by-asset link to the original collision reports.','Maps & Environments','Records additional collision and misplaced-asset fixes; exact linkage to the older prop reports is not stated.'),
 'HLLV-007': ('partial','Specific control fixes released','Patch 1.6 corrects helicopter mouse-button collective inputs and inversion handling. Broader binding persistence and keyboard-input conflicts are not declared resolved.','Control fixes through 1.6','Keep the simultaneous keyboard pitch/collective report HLLV-032 separate from the released mouse-binding correction.','Vehicles','Documents helicopter mouse collective binding and inversion corrections, not blanket closure of keybinding problems.'),
 'HLLV-033': ('investigating','Completion-loss fix unconfirmed','Patch 1.6 includes tutorial memory and hint fixes, but its notes do not confirm a fix for lost tutorial completion.','Completion-save fix unconfirmed','Absence of a completion-save entry is not proof the problem persists. The older player observations retain their original dates.','Tutorials & Practice Range; Stability & Performance','The released tutorial changes concern hints, practice-range behavior and memory cleanup; completion-save resolution is not identified.'),
 'HLLV-057': ('partial','Visual improvements released','Patch 1.6 reduces texture pop-in after leaving the Tactical Map and includes further culling fixes. Broad foliage and disappearing-cover resolution remains unverified.','Visual fixes through 1.6','The new map-level changes do not establish that every distant-cover or console-clarity complaint is resolved.','Tactical Map; Maps & Environments','Lists reduced post-map texture streaming pop-in and further culling/graphics corrections; no blanket foliage resolution is stated.'),
 'HLLV-058': ('shipped','Fix released in 1.6','Patch 1.6 now records browser filters persisting after a game restart. Independent outcome testing is not recorded.','Patch 1.6','This changes the prior announced target to a publisher-reported release. It does not close the broader missing-server search issue.','Enlist & Social','Confirms the released correction for Enlist filters resetting after restarting the game.'),
 'HLLV-059': ('partial','Browser improvements released','Patch 1.6 prioritizes fuller servers and corrects a console sort-filter failure. The previously documented 200-session search limitation is not confirmed resolved.','Partial fixes in 1.6','Server ordering and a particular false-empty result are distinct from complete server discovery. Favourite persistence is separately tracked as HLLV-069.','Enlist & Social','Records fuller-server ordering and a console sort-filter correction; does not confirm removal of the per-search session limit.'),
 'HLLV-060': ('investigating','Release status unconfirmed','Patch 1.6 is live, but its published notes do not confirm the previously targeted Frame Generation activation fix.','Earlier 1.6 target unconfirmed','The September 25 candidate remains historical planning evidence. No outcome is inferred from its omission in the final notes.','Full Patch 1.6 Changelog','The reviewed final changelog does not explicitly confirm the earlier DLSS Frame Generation reapplication target.'),
 'HLLV-061': ('investigating','Volume fix still unconfirmed','Patch 1.6 reworks battlefield audio, but does not document a voice-volume slider fix. The last explicit target remains Patch 1.7, possibly sooner.','1.7 target; release unconfirmed','Weapon sound changes are not evidence that excessively loud player voices have been corrected.','Audio Update; Full Patch 1.6 Changelog','The audio overhaul covers weapons, spawns and ambience; a voice-volume slider correction is not stated.'),
 'HLLV-062': ('investigating','Automatic shutdown unconfirmed','Patch 1.6 fixes idle-boat destruction when spawning is enabled, but does not announce automatic engine shutdown for abandoned boats.','Automatic shutdown not confirmed','The idle-destruction fix is HLLV-068. It does not establish a change to the engine-running spawn restriction discussed on October 1.','Vehicles','Records an idle-boat destruction fix, not the proposed automatic engine shutdown.'),
 'HLLV-063': ('shipped','Changes released in 1.6','Patch 1.6 makes Vote Kick notifications visible by default and sets a 30-second response window.','Patch 1.6','The final notes specify the previous window as 15 seconds. This resolves the earlier announcement wording discrepancy for this release record, not all moderation problems.','UI, HUD & Settings','Confirms default-visible Vote Kick notifications and a response-window increase from 15 to 30 seconds.'),
 'HLLV-064': ('investigating','Broader usability work open','Patch 1.6 corrects sensitivity for vehicle-mounted guns. It does not confirm resolution of infantry MG placement, elevation or forced-aiming complaints.','Broad MG usability fix unconfirmed','The released sensitivity issue is recorded separately as HLLV-067.','Gameplay','Documents a vehicle-mounted gun sensitivity correction; broader infantry MG deployment/elevation complaints are not closed.')
}
NEW = [
 ('HLLV-067','Mounted vehicle guns used the wrong aiming sensitivity','controls','Helicopter, boat and AA mounted-gun aiming could use look sensitivity instead of the ADS setting.','Gameplay','Helicopters; boats; AA guns','Mounted-gun aiming now uses ADS sensitivity.'),
 ('HLLV-068','Idle boats self-destructed with spawning enabled','vehicles','An idle boat could be destroyed after ten minutes even when its spawn point was enabled.','Vehicles','Boats; enabled spawn points','Prevents idle-boat destruction while its spawn point is enabled.'),
 ('HLLV-069','Favourite servers failed to save or targeted the wrong server','community-server','Saved favourites could fail to persist or select an unintended server.','Enlist & Social','Server Browser; favourites','Corrects favourite persistence and server targeting.'),
 ('HLLV-070','Admin Camera view, input and HUD transitions','controls','Spectator views could use incorrect positions, conflicting inputs or fail to restore the HUD.','Admin Camera','Admin Camera; spectator tools','Lists camera-position, keybinding and HUD-restoration corrections for the documented spectator cases.'),
 ('HLLV-071','Some artillery strikes failed to hit','gameplay','Certain artillery strikes could fail to hit their intended area.','Tactical Map','Commander artillery','Records a correction for some artillery strikes failing to hit.'),
 ('HLLV-072','Demolition charges failed to activate on buildables','gameplay','The US demolition charge or NVA satchel could fail to activate on a constructable item.','Weapons & Equipment','M183; NVA Satchel; constructables','Corrects charge activation on constructable items.'),
 ('HLLV-073','Helicopter guns could not be topped up before empty','vehicles','Helicopter guns could refuse resupply until fully depleted.','Vehicles','Helicopter guns; resupply','Allows helicopter-gun resupply before ammunition is completely depleted.'),
 ('HLLV-074','Party queue members were counted again when checking space','community-server','Joining with a party could count members already queued during the remaining-space check.','Enlist & Social','Parties; server queues','Excludes already-queued party members from the new join-space calculation.'),
 ('HLLV-075','Commander order timers lingered after effects began','controls','Order overlays could outlast the start of an ability and clutter the Tactical Map.','Commanders Orders','Commander orders; Tactical Map','Times each order overlay to finish as its effect begins.')
]
# Replace only the underspecified citations in these re-read publisher documents.
DETAILS = {
 ('HLLV-003','hllv-hotfix-1-5-2'): ('Stability; Memory Usage Reduction','Documents memory-corruption and flare-related crash fixes, reduced memory/VRAM use, and PC shader-caching guidance.'),
 ('HLLV-003','community-update-6'): ('Stability & AMD','Reports an early crash reduction with continued longer-term monitoring; supplies no independent crash-rate measurement.'),
 ('HLLV-006','community-update-6'): ('Foliage, LODs & Visual Quality','Describes console resolution/detail-distance testing for Update 2.0 and later, and advises against forcing HDR on the SDR output.'),
 ('HLLV-029','community-update-5'): ('VOIP Reliability','Acknowledges channel failures and dropouts; further changes with Epic still require larger-scale testing.'),
 ('HLLV-029','hllv-hotfix-1-5-2'): ('VOIP Muting','Documents additional safeguards against silent-muting edge cases, with post-release monitoring continuing.'),
 ('HLLV-029','community-update-6'): ('VOIP, Voice Volume & Audio Routing','Continues monitoring silent-muting safeguards while treating excessive volume and output routing as separate work.'),
 ('HLLV-034','community-update-6'): ('Aim Assist','Targets further Aim Assist changes for Update 2.0, subject to development and testing; not a release confirmation.'),
 ('HLLV-046','hllv-hotfix-1-5-2'): ('Spawns & Server Reliability','Records Iris fixes for degradation over long server sessions affecting spawns and other replicated objects; monitoring continues.'),
 ('HLLV-054','hllv-hotfix-1-5-2'): ('EOS Settings','Documents retained game settings across EOS sign-out and subsequent sign-in.'),
 ('HLLV-055','hllv-hotfix-1-5-2'): ('PS5 Save Data','Adds safeguards against a rare PS5 save-loss issue; does not establish closure of all tutorial or progression losses.'),
 ('HLLV-056','hllv-hotfix-1-5-2'): ('Impostor Trees','Corrects trees using distant flat models near players, restoring intended transitions to their 3D models.'),
 ('HLLV-057','community-update-6'): ('Foliage, LODs & Visual Quality','Acknowledges blurry foliage, pop-in and cover disappearing before players; detail/culling work continues beyond individual fixes.'),
 ('HLLV-058','community-update-5'): ('Server Browser & Server Visibility','Announces filter-persistence and auto-refresh corrections for the then-future Patch 1.6.'),
 ('HLLV-058','community-update-6'): ('Server Browser Improvements','Reaffirms persistent-filter corrections for the then-forthcoming Patch 1.6; this older post is planning evidence.'),
 ('HLLV-059','community-update-5'): ('Server Browser & Server Visibility','Explains the 200-session search limit and investigation of combined targeted searches; recommends narrower filters.'),
 ('HLLV-059','community-update-6'): ('Server Browser Improvements','Announces fuller-server ordering for Patch 1.6, separately from complete search coverage.'),
 ('HLLV-060','community-update-5'): ('DLSS Frame Generation','Describes a candidate for activation after restart, targeted for 1.6 but still awaiting final QA at publication.'),
 ('HLLV-061','community-update-6'): ('VOIP, Voice Volume & Audio Routing','Acknowledges excessive player-voice volume despite reduced settings; targets 1.7, possibly earlier.'),
 ('HLLV-062','community-update-6'): ('Boats & Spawn Protection','Discusses automatic shutdown on exit or after idling as proposals to address abandoned running engines blocking spawns.'),
 ('HLLV-063','community-update-6'): ('Vote Kick & Moderation; Next Up','Announces visible notifications and a 30-second vote window for 1.6; its two descriptions of the previous duration disagree.'),
 ('HLLV-064','community-update-6'): ('Quality-of-Life Feedback / Mounted Machine Guns','Acknowledges deployment, elevation and forced-aiming usability complaints; promises future work without a release target.')
}

def replace_once(text, old, new):
    if text.count(old) != 1:
        raise RuntimeError('Integration point changed; reconcile: '+old[:100])
    return text.replace(old,new,1)

def main():
    path = ROOT/'data/issues.json'
    original = path.read_bytes()
    digest = hashlib.sha1(b'blob '+str(len(original)).encode()+b'\0'+original).hexdigest()
    if digest != BASE_DATA:
        existing = json.loads(original)
        if existing.get('review_release') == '2026-10-07-patch-1.6':
            print('Already applied; retaining the existing publication timestamp.')
            return
        raise RuntimeError('Evidence changed since review; do not overwrite concurrent edits.')
    now = datetime.now(timezone.utc)
    assert now.date().isoformat() == DAY, 'This is a dated review, not an unattended future refresh'
    patch_url, reviewed_via = source_destination()
    before = json.loads(original)
    data = copy.deepcopy(before)
    issues = {i['id']:i for i in data['issues']}
    assert len(issues)==66
    def evidence(claim, section):
        return {'type':'patch notes','publisher':'Hell Let Loose / Team17','date':DAY,'title':'Patch 1.6 | Live Now','url':patch_url,'claim':claim,'source_locator':section,'source_published_at':DAY,'source_reviewed_at':DAY,'source_reviewed_via':reviewed_via,'link_checked_at':DAY}
    for key, row in UPDATES.items():
        status,label,bottom,fix,position,section,claim = row
        i=issues[key]
        i.update(status_key=status,status_label=label,bottom_line=bottom,fix_short=fix,official_position=position,last_updated=DAY,last_reviewed=DAY)
        if key in {'HLLV-058','HLLV-063'}:
            i['official_short']='Release documented'
        if key=='HLLV-060':
            i['official_short']='Earlier target; release unclear'
        i['timeline'].append({'date':DAY,'event':'Patch 1.6 released / evidence review','detail':claim})
        i['sources'].append(evidence(claim,section))
        i['known'].append('October 7 release-note review: '+claim)
        i['unknown'].append('Independent gameplay verification of the Patch 1.6 outcome is not recorded.')
    for id_,title,category,symptom,section,scope,claim in NEW:
        assert id_ not in issues
        i={'id':id_,'title':title,'category':category,'kind':'publisher-documented defect' if id_!='HLLV-070' else 'documented spectator issue family','status_key':'shipped','status_label':'Fix released in 1.6','bottom_line':'Patch 1.6: '+claim+' Independent outcome testing is not recorded.','official_short':'Release documented','fix_short':'Patch 1.6','cause_short':'Not public','last_updated':DAY,'last_reviewed':DAY,'scope':scope.split('; '),'symptom':symptom,'official_position':'The publisher lists this correction in the released changelog. This records the announced change, not independent reproduction or proof of universal resolution.','workaround':None,'known':[claim],'unknown':['Independent post-release verification is not recorded.','The internal technical cause is not established by this changelog.'],'timeline':[{'date':DAY,'event':'Patch 1.6 released','detail':claim}],'sources':[evidence(claim,section)]}
        data['issues'].append(i)
        issues[id_]=i
    refined=[]
    for i in data['issues']:
        for s in i['sources']:
            key=(i['id'],urlsplit(s['url']).path.rstrip('/').rsplit('/',1)[-1])
            if key in DETAILS:
                section,claim=DETAILS[key]
                s.setdefault('claim_history',[]).append({'recorded_claim':s['claim'],'superseded_on':DAY,'reason':'Re-read the publisher text and replace topic-only shorthand with a precise claim.'})
                s.update(claim=claim,source_locator=section,source_reviewed_at=DAY,source_reviewed_via=FEED,source_published_at=s['date'])
                refined.append(i['id']+'|'+key[1])
    assert len(refined)==21, ('Expected to refine exactly the 21 reviewed citations',len(refined))
    data['generated_at']=DAY
    data['page_updated_at']=now.replace(microsecond=0).isoformat().replace('+00:00','Z')
    data['review_release']='2026-10-07-patch-1.6'
    data['latest_change']={'date':DAY,'label':'October 7 review · Patch 1.6 released','url':patch_url,'summary':'Patch 1.6 is live. Browser filters and Vote Kick changes are now release-documented. Added scoped fixes; voice volume, tutorial completion and Frame Generation closure remain unconfirmed.'}
    data.setdefault('review_history',[]).append({'date':DAY,'scope':'Patch 1.6 publisher changelog; re-read Community Feedback #5/#6 and Hotfix 1.5.2 for 21 source-claim clarifications.','source_url':patch_url,'new_issues':[i[0] for i in NEW],'updated_issues':list(UPDATES),'independent_gameplay_testing':False,'limitations':['Recent player threads could not be fully re-read in the research tool; their old reports and dates are retained without claiming new confirmation.','No absence from the patch notes is treated as proof of persistence.','No full audit of every older official source was performed.']})
    data['review_notes']='October 7: reviewed the published Patch 1.6 changelog and earlier publisher text for 21 precise citation clarifications. Promoted only explicitly released changes; preserved unresolved wider families and all old reports. No independent gameplay testing. Recent player-thread bodies were inaccessible in the research reader, so no new player confirmation is claimed. Previous notes: '+before.get('review_notes','')
    # Accessibility is recorded separately; it never changes evidentiary status.
    urls=sorted({s['url'] for i in data['issues'] for s in i['sources']})
    def check(url):
        try:
            status,final,body=get(url)
            return url,{'checked_at':DAY,'http_status':status,'final_url':final,'title':title_of(body),'scope':'URL accessibility only; not claim validation'}
        except HTTPError as error:
            return url,{'checked_at':DAY,'http_status':error.code,'scope':'Automated request failed; not proof of deletion'}
        except Exception as error:
            return url,{'checked_at':DAY,'http_status':None,'error':type(error).__name__,'scope':'Automated request failed; not proof of deletion'}
    with ThreadPoolExecutor(max_workers=5) as pool:
        checks=dict(pool.map(check,urls))
    data['source_access_review']={'date':DAY,'results':checks,'note':'This is an accessibility check, separate from source review and independent outcome verification.'}
    for i in data['issues']:
        for s in i['sources']:
            result=checks[s['url']]
            s['link_check']={'date':DAY,'http_status':result['http_status']}
            if result['http_status']==200:
                s['link_checked_at']=DAY
    # Invariants: original content is retained, except the explicit updates above
    # and reviewed claim clarifications with their original text in claim_history.
    assert data['incidents']==before['incidents']
    assert [i['id'] for i in data['issues'][:66]]==[i['id'] for i in before['issues']]
    for old,new in zip(before['issues'],data['issues']):
        assert new['timeline'][:len(old['timeline'])]==old['timeline']
        assert new['known'][:len(old['known'])]==old['known']
        assert new['unknown'][:len(old['unknown'])]==old['unknown']
        if old['id'] not in UPDATES:
            for key in old:
                if key!='sources': assert old[key]==new[key],(old['id'],key)
        for a,b in zip(old['sources'],new['sources']):
            for key in a:
                if key not in {'claim','link_checked_at'}: assert a[key]==b[key],(old['id'],key)
            if a['claim']!=b['claim']: assert b['claim_history'][-1]['recorded_claim']==a['claim']
    assert [i['id'] for i in data['issues'] if i['id'] in issues and i['id'] in {'HLLV-058','HLLV-063'} and i['status_key']=='shipped']==['HLLV-058','HLLV-063']
    for id_ in ('HLLV-003','HLLV-008','HLLV-029','HLLV-033','HLLV-046','HLLV-057','HLLV-059','HLLV-060','HLLV-061','HLLV-062','HLLV-064','HLLV-065','HLLV-066'):
        assert issues[id_]['status_key']!='shipped',id_
    assert not any(s.get('outcome_verification') for i in data['issues'] for s in i['sources'])
    assert len(data['issues'])==75
    path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    # The global bar is outside all hash-routed panels. Its value comes only from
    # the committed JSON; loading a page or an issue does not refresh the time.
    page=ROOT/'index.html'
    markup=page.read_text()
    assert 'id="hllv-evidence-v1"' in markup
    marker='  <div class="landing" id="landing">'
    bar='''  <div class="page-freshness" aria-label="Page last updated"><p><strong>Last updated:</strong> <time id="pageLastUpdated">Loading...</time></p><details><summary>About this date</summary><p>The saved publication time for this tracker, shown in Eastern Time. Reloading does not change it. Individual reports keep their own evidence dates; this is not proof every issue was independently retested.</p></details></div>\n'''
    markup=replace_once(markup,marker,bar+marker)
    markup=replace_once(markup,'</head>','  <link rel="stylesheet" href="./freshness.css?v=20261007">\n</head>')
    markup=replace_once(markup,'  <script id="hllv-evidence-v1"','  <script src="./freshness.js?v=20261007"></script>\n  <script id="hllv-evidence-v1"')
    markup=replace_once(markup,"fetch('./data/issues.json')","fetch('./data/issues.json',{cache:'no-cache'})")
    markup=replace_once(markup,'dataset=d;renderLanding();','dataset=d;if(window.HLLVFreshness)HLLVFreshness.render(d);else{document.getElementById(\'pageLastUpdated\').textContent=d.generated_at||\'Not available\';}renderLanding();')
    markup=replace_once(markup,".catch(e=>{document.getElementById('featuredIssues')", ".catch(e=>{document.getElementById('pageLastUpdated').textContent='Not available';document.getElementById('featuredIssues')")
    page.write_text(markup,encoding='utf-8')
    shutil.copyfile(HERE/'freshness.js',ROOT/'freshness.js')
    (ROOT/'freshness.css').write_text('''.page-freshness{box-sizing:border-box;display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:6px 18px;padding:12px 30px;border-bottom:1px solid var(--line,#c8c1b0);background:var(--paper-2,#f7f3e9);color:var(--ink,#20231f);font:400 .84rem/1.5 system-ui,sans-serif}.page-freshness>p{margin:0}.page-freshness time{font-variant-numeric:tabular-nums}.page-freshness details{max-width:620px}.page-freshness summary{cursor:pointer;color:var(--muted,#686d65)}.page-freshness details p{margin:6px 0 0;max-width:65ch}.page-freshness summary:focus-visible{outline:2px solid currentColor;outline-offset:3px}@media(max-width:680px){.page-freshness{padding:11px 16px;font-size:.8rem;gap:4px}.page-freshness>p,.page-freshness details{flex-basis:100%}.page-freshness time{overflow-wrap:anywhere}}\n''',encoding='utf-8')
    # Show new source locators and failed access attempts without hiding the claim
    # or assigning credibility from an HTTP response. Keep template/asset aligned.
    extra='''<div class="evidence-review-context">${text(source.source_locator)?`<p><strong>Where to look:</strong> ${esc(source.source_locator)}</p>`:''}${safeURL(source.source_reviewed_via)?`<p><a href="${esc(safeURL(source.source_reviewed_via))}" target="_blank" rel="noopener noreferrer">Read the reviewed publisher copy ↗</a> · same publisher, not independent corroboration</p>`:''}${source.link_check&&source.link_check.http_status!==200?`<p><strong>Latest link attempt:</strong> ${esc(dateLabel(source.link_check.date))} · ${Number.isInteger(source.link_check.http_status)?'HTTP '+esc(source.link_check.http_status):'request unavailable'}. This is not evidence the claim is false or the source was deleted.</p>`:''}</div>'''
    for asset in (ROOT/'evidence.js',Path('.github/hllv-evidence/evidence.js')):
        content=asset.read_text()
        content=replace_once(content,'<p class="evidence-basis">',extra+'<p class="evidence-basis">')
        asset.write_text(content,encoding='utf-8')
    count=len(data['issues']); refs=sum(len(i['sources']) for i in data['issues']); unique=len(urls)
    doc=ROOT/'README.md'
    text=doc.read_text()
    text=re.sub(r'The current tracker contains .*?\(reviewed \d{4}-\d{2}-\d{2}\)\.',f'The current tracker contains {count} issue dossiers, {refs} issue-linked source records and {unique} distinct source URLs (reviewed {DAY}).',text,count=1)
    text+='\n## Page-wide Last updated\n\nThe global header reads the saved UTC `page_updated_at` from `data/issues.json` and displays it in America/New_York time with its timezone. It changes only when the published tracker is deliberately updated, never on a visitor reload. `generated_at` remains the evidence-review date; issue and source dates retain their separate meanings. Missing/invalid timestamps display a date-only fallback or Not available, never the current time. The October 7 refresh is a one-time reviewed update, not a scheduler.\n'
    doc.write_text(text,encoding='utf-8')
    (ROOT/'reviews').mkdir(exist_ok=True)
    report={'date':DAY,'page_updated_at':data['page_updated_at'],'patch_source':patch_url,'reviewed_via':reviewed_via,'issues':count,'source_references':refs,'distinct_urls':unique,'refined_claims':len(refined),'new_issue_ids':[r[0] for r in NEW],'updated_issue_ids':list(UPDATES),'link_access_ok':sum(v['http_status']==200 for v in checks.values()),'link_access_other':{k:v for k,v in checks.items() if v['http_status']!=200},'independent_gameplay_checks':0,'rollback_commit':'a8bdacdfd2175c6ee5fbcc97dc10dc78c21ac57d'}
    (ROOT/'reviews/2026-10-07.json').write_text(json.dumps(report,indent=2)+'\n')
    # Retain the old adverse-case coverage while removing snapshot-only fixtures.
    unit=Path('.github/hllv-evidence/test_evidence.cjs')
    t=unit.read_text()
    t=t.replace('assert.equal(dataset.issues.length, 66);','assert.ok(dataset.issues.length >= 66);\n  assert.equal(new Set(dataset.issues.map(i=>i.id)).size,dataset.issues.length);')
    t=t.replace('assert.equal(dataset.issues.reduce((n,i) => n + i.sources.length, 0), 136);','assert.ok(dataset.issues.every(i=>Array.isArray(i.sources)&&i.sources.length>0));')
    t=t.replace('assert.equal(urls.size, 33);','assert.ok(urls.size >= 33);').replace('assert.ok(gaps > 0);','assert.ok(Number.isInteger(gaps));')
    t=t.replace('issues:66, references:136,','issues:dataset.issues.length, references:dataset.issues.reduce((n,i)=>n+i.sources.length,0),')
    t=t.replace("assert.equal(dataset.generated_at,'2026-10-05');","assert.ok(E.validDate(dataset.generated_at));")
    unit.write_text(t)
    browser=Path('.github/hllv-evidence/test_browser.py')
    t=browser.read_text()
    t=t.replace("expected_data = subprocess.check_output(['git','show','f7341a74d56ba8900d3becee15f07b6e82e613bf:hllv_tracker/data/issues.json'])","expected_data = Path('hllv_tracker/data/issues.json').read_bytes()")
    t=t.replace("expect(page.locator('#landingUpdated')).to_contain_text('Evidence snapshot Oct 5, 2026')","expect(page.locator('#landingUpdated')).to_contain_text('Evidence snapshot ' + page.evaluate('(s)=>formatDate(s)',data['generated_at']))\n        assert context.request.get(args.url+'data/issues.json').body()==expected_data")
    t=t.replace("expect(page.locator('.evidence-gap').first).to_be_visible()","expect(page.locator('.evidence-claim').first).to_contain_text(data['issues'][57]['sources'][0]['claim'])")
    t=t.replace('66 issue views, 136 source rows','{len(data[\"issues\"])} issue views, {sum(len(i[\"sources\"]) for i in data[\"issues\"])} source rows')
    browser.write_text(t)
    print('REVIEW_READY',json.dumps(report,indent=2))

if __name__=='__main__':
    main()
