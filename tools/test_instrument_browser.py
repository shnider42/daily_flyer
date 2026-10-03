"""Isolated DOM smoke tests for a rendered Instrument Journey HTML document.

This explicitly simulates the Storage interface and blocks external images.
It tests UI logic, layout and failure paths, NOT live deployment, real device
Safari, actual browser persistence or reachability/licensing of photography.

Usage:
  python tools/build_instrument_preview.py
  python tools/test_instrument_browser.py --html instrument_journey_preview.html
Requires optional development dependency playwright and a Chromium executable.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import shutil

from playwright.sync_api import sync_playwright

STORE = 'dailyflyer.instrument_journey.v1'
CAR_KEY = 'garage-journey-test-sentinel'
IDS = ['player-mexico','american-pro-ii','les-paul-1959','multiac-encore','sonic-ht-h']
NODES = ['strings','neck','bridge','electronics','output','fit']


def run(html_path: Path, output: Path, chromium: str | None) -> dict:
    html = html_path.read_text(encoding='utf-8')
    output.mkdir(parents=True, exist_ok=True)
    checks = []
    def check(condition, name):
        assert condition, name
        checks.append(name)
    with sync_playwright() as p:
        options = {'headless':True}
        if chromium: options['executable_path']=chromium
        browser = p.chromium.launch(**options)
        pages=[]
        def fresh(initial=None, denied=False, quota=False, width=1440):
            page=browser.new_page(viewport={'width':width,'height':900},device_scale_factor=1)
            pages.append(page)
            page.route('https://**/*',lambda route:route.abort())
            errors=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            if not denied:
                page.evaluate('''({initial,quota})=>{
                  const data=new Map(Object.entries(initial)); window.__storageWrites=[];
                  const storage={getItem:k=>data.has(String(k))?data.get(String(k)):null,
                    setItem:(k,v)=>{if(quota)throw new DOMException('Quota exceeded','QuotaExceededError');data.set(String(k),String(v));window.__storageWrites.push(String(k));},
                    removeItem:k=>data.delete(String(k)),clear:()=>data.clear(),
                    key:i=>[...data.keys()][i]??null,get length(){return data.size;}};
                  Object.defineProperty(window,'localStorage',{value:storage,configurable:true});
                  window.__storageDump=()=>Object.fromEntries(data);
                }''',{'initial':initial or {CAR_KEY:'untouched'},'quota':quota})
            # Capture export contents without relying on file downloads in a
            # sandbox that may prohibit navigations/downloads.
            page.evaluate('''()=>{const make=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{window.__exportBlob=blob;return make(blob)};document.addEventListener('click',e=>{if(e.target.closest('a[download]'))e.preventDefault()},true)}''')
            page.set_content(html,wait_until='domcontentloaded')
            page.wait_for_selector('.ij-rack-item')
            return page,errors
        def go(page,mid=None,view='overview',node=None):
            fragment=f'#/{mid}/{view}'+(f'/{node}' if node else '') if mid else '#/rack'
            page.evaluate('(hash)=>location.hash=hash',fragment)
            expect={'mid':mid or '', 'view':view if mid else 'rack', 'node':node or ('strings' if mid and view=='workbench' else '')}
            page.wait_for_function('''e=>{const r=document.querySelector('#ij-app');return r.dataset.instrument===e.mid&&r.dataset.view===e.view&&r.dataset.node===e.node}''',arg=expect)
        page,errors=fresh()
        check(page.locator('.ij-rack-item').count()==5,'All five instruments render')
        check(page.locator('.journey-mode-switch a[aria-current="page"]').inner_text()=='Guitars','Guitars mode visibly selected')
        check(page.locator('.journey-mode-switch a').first.get_attribute('href')=='/?theme=garage','Cars link preserves server route')
        check(not page.locator('#ij-notice').is_visible(),'Clean storage has no warning')
        page.wait_for_timeout(80)
        check(page.locator('img[data-failed]').count()==6,'All failed external photos use fallback drawings')
        page.screenshot(path=str(output/'desktop-rack.png'),full_page=True)
        for mid in IDS:
            for view in ['overview','journey','gigbag','workbench']:
                go(page,mid,view)
                check(page.locator('.ij-detail-copy h1').inner_text()!='',f'{mid}: {view} renders')
                if view=='gigbag':check(page.locator('.ij-resource').count()>=5,f'{mid}: real source library present')
                if view=='journey':check('No entries yet' in page.locator('#ij-view').inner_text(),f'{mid}: no fabricated maintenance records')
            for node in NODES:
                go(page,mid,'workbench',node)
                check(page.locator('.ij-checks li').count()==3,f'{mid}: {node} has scoped checks')
                check(page.locator('.ij-hotspot').count()==6,f'{mid}: {node} has accessible part controls')
        go(page,'american-pro-ii','workbench','electronics')
        page.locator('#ij-neck-add').check()
        check('Active: Bridge + Neck' in page.locator('#ij-signal-output').inner_text(),'American SSS position 1 neck-add')
        page.locator('[data-action=signal][data-position="2"]').click()
        check('Active: Bridge + Middle + Neck' in page.locator('#ij-signal-output').inner_text(),'American SSS position 2 all three pickups')
        page.locator('[data-action=signal][data-position="3"]').click()
        check('Active: Middle' in page.locator('#ij-signal-output').inner_text(),'Neck-add does not alter position 3')
        page.locator('[data-action=signal][data-position="1"]').click()
        page.evaluate('window.scrollTo(0,0)')
        page.screenshot(path=str(output/'desktop-workbench.png'),full_page=True)
        go(page,'player-mexico','workbench','electronics')
        check(page.locator('#ij-neck-add').count()==0,'Mexican Player does not inherit American circuit')
        page.locator('[data-action=signal][data-position="5"]').click()
        check('Active: Neck' in page.locator('#ij-signal-output').inner_text(),'Player five-way neck position')
        go(page,'les-paul-1959','workbench','electronics')
        page.locator('[data-action=signal][data-position="2"]').click()
        check('Active: Neck PAF + Bridge PAF' in page.locator('#ij-signal-output').inner_text(),'Les Paul two-branch both position')
        check('Do not desolder original joints' in page.locator('.ij-stop').inner_text(),'Vintage conservation stop condition')
        go(page,'sonic-ht-h','workbench','electronics')
        check(page.locator('[data-action=signal]').count()==0,'HT H has no fabricated selector')
        go(page,'multiac-encore','workbench','electronics')
        page.locator('#ij-blend').fill('100')
        check(page.locator('#ij-blend-label').inner_text().startswith('100%'),'Nylon blend responds')
        check(page.locator('.ij-pickup[data-active=true]').count()==1,'Nylon teaching map changes source indication')
        check('not a calibrated gain ratio' in page.locator('#ij-signal-output').inner_text(),'Nylon blend model limitation visible')
        # Filters remain keyboard-editable; search does not replace the input.
        go(page,'player-mexico','gigbag')
        page.locator('#ij-source-kind').select_option('Community')
        check(page.locator('.ij-resource-tag').count()>0 and all(t.casefold()=='community' for t in page.locator('.ij-resource-tag').all_inner_texts()),'Source-type filter')
        page.locator('#ij-source-search').fill('no-such-document-xyz')
        check('No matching sources' in page.locator('#ij-resources').inner_text(),'Source search empty state')
        go(page,'player-mexico','workbench','strings')
        page.locator('#ij-bench-search').fill('output')
        check(page.locator('#ij-bench-results a').count()>0,'Symptom/component search returns routes')
        # Passport escaping and isolated persistence.
        go(page,'player-mexico')
        evil='<img src=x onerror="window.__injected=true">'
        page.locator('[name=nickname]').fill(evil)
        page.locator('[name=strings]').fill('10–46')
        page.locator('[name=tuning]').fill('E standard')
        page.locator('#ij-passport-form button[type=submit]').click()
        check(page.locator('.ij-detail-copy h1').inner_text()==evil,'Passport text escaped in visible title')
        check(page.evaluate('window.__injected===undefined'),'No passport DOM injection')
        go(page,'player-mexico','journey')
        page.locator('[name=title]').fill('Baseline before string change')
        page.locator('[name=notes]').fill('No work performed. '+evil)
        page.locator('[name=relief]').fill('0.25 mm; capo 1, last fret held, gap at 8')
        page.locator('#ij-log-form button[type=submit]').click()
        check(page.locator('.ij-log-entry').count()==1,'Journey entry added')
        check(evil in page.locator('.ij-log-entry').inner_text(),'Journey notes escaped')
        check(not page.evaluate('Boolean(window.__injected)'),'No journey DOM injection')
        check(page.evaluate(f'localStorage.getItem({json.dumps(CAR_KEY)})')=='untouched','Car sentinel untouched by saves')
        check(set(page.evaluate('window.__storageWrites'))=={STORE},'Only instrument storage key written')
        # Simulated reload on a new DOM with the saved backing-store snapshot.
        saved=page.evaluate('window.__storageDump()')
        reloaded,reload_errors=fresh(saved)
        go(reloaded,'player-mexico','journey')
        check(reloaded.locator('.ij-log-entry').count()==1,'Journey restores from serialized state')
        go(reloaded,'sonic-ht-h','journey')
        check(reloaded.locator('.ij-log-entry').count()==0,'Instrument records are separated')
        # Export captures a real Blob, import uses a real File input and dialog.
        go(page,'player-mexico','journey')
        page.locator('[data-action=export]').first.click()
        backup=page.evaluate('async()=>JSON.parse(await window.__exportBlob.text())')
        check(backup['app']=='instrument-journey' and backup['version']==1,'JSON export schema and content')
        clean,clean_errors=fresh()
        go(clean,'player-mexico','journey')
        clean.locator('#ij-import-file').set_input_files({'name':'backup.json','mimeType':'application/json','buffer':json.dumps(backup).encode()})
        clean.wait_for_selector('#ij-import-dialog[open]')
        check(clean.locator('.ij-log-entry').count()==0,'Import waits for confirmation')
        clean.locator('[data-action=confirm-import]').click()
        check(clean.locator('.ij-log-entry').count()==1,'Confirmed import restores the journey')
        prior=clean.evaluate('window.__storageDump()')
        invalid=dict(backup);invalid['rack']=['unknown-instrument']
        clean.locator('#ij-import-file').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':json.dumps(invalid).encode()})
        clean.wait_for_function("document.querySelector('#ij-notice').textContent.includes('Import rejected')")
        check(clean.evaluate('window.__storageDump()')==prior,'Invalid import does not overwrite data')
        bad_date=json.loads(json.dumps(backup));bad_date['logs']['player-mexico'][0]['date']='2026-02-31'
        clean.locator('#ij-import-file').set_input_files({'name':'bad-date.json','mimeType':'application/json','buffer':json.dumps(bad_date).encode()})
        clean.wait_for_function("document.querySelector('#ij-notice').textContent.includes('Invalid journey date')")
        check(clean.evaluate('window.__storageDump()')==prior,'Impossible imported date rejected')
        # First-use rack is deliberately empty; inclusion/removal is explicit.
        go(clean)
        clean.locator('[data-action=filter][data-filter=mine]').click()
        check(clean.locator('.ij-rack-item').count()==0,'Empty My rack explained')
        clean.locator('[data-action=filter][data-filter=all]').click()
        clean.locator('[data-action=rack][data-id=sonic-ht-h]').click()
        clean.locator('[data-action=filter][data-filter=mine]').click()
        check(clean.locator('.ij-rack-item').count()==1,'My rack filter includes chosen guitar')
        # Quota and disabled storage failures still leave the workbench usable.
        blocked,blocked_errors=fresh(denied=True)
        check('Browser storage is unavailable' in blocked.locator('#ij-notice').inner_text(),'Unavailable storage produces a precise warning')
        quota,quota_errors=fresh(quota=True)
        quota.locator('[data-action=rack][data-id=sonic-ht-h]').click()
        check('Kept for this visit only' in quota.locator('#ij-notice').inner_text(),'Quota failure is not reported as saved')
        corrupt,corrupt_errors=fresh({STORE:'{not-json',CAR_KEY:'untouched'})
        check('Stored instrument data could not be read' in corrupt.locator('#ij-notice').inner_text(),'Corrupt storage does not crash app')
        check(corrupt.evaluate('window.__storageWrites')==[],'Corrupt data not overwritten on startup')
        # Cross-tab conflict handling and responsive layout at all four sections.
        before=page.evaluate('window.__storageDump()')
        page.evaluate('(key)=>window.dispatchEvent(new StorageEvent("storage",{key,newValue:"changed"}))',STORE)
        go(page,'sonic-ht-h')
        page.locator('[name=nickname]').fill('Do not clobber another tab')
        page.locator('#ij-passport-form button[type=submit]').click()
        check(page.evaluate('window.__storageDump()')==before,'Cross-tab conflict blocks overwriting saved data')
        responsive,responsive_errors=fresh()
        for width in [320,375,390,768,1440]:
            responsive.set_viewport_size({'width':width,'height':844})
            for view in ['rack','overview','journey','gigbag','workbench']:
                go(responsive,None if view=='rack' else 'american-pro-ii',view if view!='rack' else 'overview','electronics' if view=='workbench' else None)
                overflow=responsive.evaluate('document.documentElement.scrollWidth > innerWidth + 1')
                check(not overflow,f'No horizontal overflow: {width}px / {view}')
        responsive.set_viewport_size({'width':390,'height':844})
        go(responsive)
        responsive.screenshot(path=str(output/'mobile-rack.png'),full_page=True)
        go(responsive,'multiac-encore','workbench','electronics')
        responsive.evaluate('window.scrollTo(0,0)')
        responsive.screenshot(path=str(output/'mobile-workbench.png'),full_page=True)
        responsive.emulate_media(media='print')
        check(responsive.locator('#ij-guide').is_visible(),'Guide remains visible in print view')
        responsive.emulate_media(media='screen')
        all_errors=errors+reload_errors+clean_errors+blocked_errors+quota_errors+corrupt_errors+responsive_errors
        check(not all_errors,'No JavaScript page errors in isolated scenarios: '+str(all_errors))
        for pp in pages: pp.close()
        browser.close()
    result={'passed':len(checks),'failed':0,'mode':'isolated DOM; simulated Storage; external images deliberately blocked','checks':checks}
    (output/'browser-results.json').write_text(json.dumps(result,indent=2))
    return result


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--html',type=Path,default=Path('instrument_journey_preview.html'))
    parser.add_argument('--output',type=Path,default=Path('instrument-browser-results'))
    parser.add_argument('--chromium',default=shutil.which('chromium'))
    args=parser.parse_args()
    result=run(args.html,args.output,args.chromium)
    print(json.dumps({'passed':result['passed'],'failed':result['failed'],'mode':result['mode']}))

if __name__=='__main__': main()
