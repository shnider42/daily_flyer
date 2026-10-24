"""Archive data, native disclosure and integration tests; no gameplay validation."""
from __future__ import annotations
import argparse
import copy
import importlib.util
import json
from pathlib import Path
from urllib.parse import urljoin

HERE=Path(__file__).parent
spec=importlib.util.spec_from_file_location('archive_build',HERE/'build.py')
build=importlib.util.module_from_spec(spec); spec.loader.exec_module(build)


def main():
    p=argparse.ArgumentParser(); p.add_argument('--url',default='http://127.0.0.1:8765/'); p.add_argument('--engine',choices=['chromium','webkit'],default='chromium'); p.add_argument('--unit',action='store_true'); args=p.parse_args()
    raw=Path('hllv_tracker/data/issues.json').read_bytes(); data=json.loads(raw); notes=data['patch_notes']
    build.validate(notes,data)
    assert len(data['issues'])==75 and sum(len(i['sources']) for i in data['issues'])==157
    assert data['generated_at']=='2026-10-07'
    before=json.dumps(data); rendered=build.render(notes,data); assert before==json.dumps(data)
    assert rendered.count('class="patch-entry"')==8
    assert rendered.count('class="patch-latest"')==1
    assert '2026-10-07' in rendered and 'Website notes dated' in rendered
    modified=copy.deepcopy(notes); modified[0]['headline']='<img src=x onerror=alert(1)>'
    assert '<img src=x' not in build.render(modified,data)
    for url in ['javascript:alert(1)','http://example.org','https://evil.example/patch','https://name:password@www.hellletloose.com/blog/hllv-patch-1-6']:
        modified=copy.deepcopy(notes); modified[0]['source_url']=url
        try: build.validate(modified,data)
        except AssertionError: pass
        else: raise AssertionError('Unsafe official link accepted')
    assert json.loads(Path('hllv_tracker/reviews/2026-10-07-patch-archive.json').read_text())['page_updated_at']==data['page_updated_at']
    print('ARCHIVE_DATA_PASS: eight unique dated releases, official destinations, stable bug counts, escaped text, immutable rendering and publication provenance')
    if args.unit: return
    from playwright.sync_api import sync_playwright,expect
    with sync_playwright() as pw:
        browser=getattr(pw,args.engine).launch(); context=browser.new_context(viewport={'width':1280,'height':900},reduced_motion='reduce')
        page=context.new_page(); errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
        response=page.goto(args.url,wait_until='networkidle'); assert response.status==200
        archive=page.locator('#patch-notes'); expect(archive).to_be_visible()
        assert page.locator('#landing .landing-main > section').last.get_attribute('id')=='patch-notes'
        expect(page.locator('.patch-entry')).to_have_count(8)
        assert page.locator('.patch-entry').evaluate_all('(els)=>els.every(e=>!e.open)')
        stamp=page.locator('#pageLastUpdated'); expected=stamp.inner_text()
        expect(stamp).to_have_attribute('datetime',data['page_updated_at'])
        page.click('#patchNotesJump'); assert page.url.endswith('#patch-notes')
        expect(page.locator('#patchNotesHeading')).to_be_focused()
        for n in notes:
            element=page.locator('#'+n['id']); summary=element.locator(':scope > summary')
            expect(summary).to_contain_text(n['title']); expect(summary).to_contain_text(n['headline'])
            summary.focus(); page.keyboard.press('Enter'); expect(element).to_have_attribute('open','')
            expect(element.locator('.patch-body')).to_be_visible()
            expect(element.locator('.patch-official')).to_have_attribute('href',n['source_url'])
            assert element.locator('summary a, summary button').count()==0
            assert element.locator('.patch-highlights li').count()==len(n['highlights'])
            element.locator('.patch-provenance summary').click()
            expect(element.locator('.patch-provenance')).to_contain_text(n['review_basis'])
        assert page.locator('.patch-entry').evaluate_all('(els)=>els.every(e=>e.open)')
        for width in [390,320]:
            page.set_viewport_size({'width':width,'height':844})
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+2'),('archive overflow',width)
        first=page.locator('#patch-1-6 [data-patch-issue]').first
        title=first.inner_text().replace(' →',''); first.click()
        expect(page.locator('#dossier h1')).to_contain_text(title)
        expect(stamp).to_have_text(expected)
        page.go_back(wait_until='networkidle'); expect(archive).to_be_visible()
        assert page.url.endswith('#patch-notes')
        page.reload(wait_until='networkidle'); expect(stamp).to_have_text(expected)
        assert context.request.get(urljoin(args.url,page.evaluate('TRACKER_DATA_URL'))).body()==raw
        # The archive is static markup, not dependent on the bug data fetch.
        fail=context.new_page(); fail.route('**/data/issues*.json',lambda r:r.fulfill(status=503,body='unavailable'))
        fail.goto(args.url,wait_until='networkidle'); expect(fail.locator('#patch-1-6')).to_be_visible()
        fail.locator('#patch-1-6 > summary').click(); expect(fail.locator('#patch-1-6 .patch-official')).to_be_visible()
        # Progressive enhancement: native disclosures and official anchors need no JS.
        nojs=browser.new_context(java_script_enabled=False,viewport={'width':390,'height':844})
        plain=nojs.new_page(); plain.goto(args.url,wait_until='domcontentloaded')
        plain.locator('#patch-1-6 > summary').click(); expect(plain.locator('#patch-1-6 .patch-official')).to_be_visible()
        assert not errors,errors
        browser.close()
    assert Path('hllv_tracker/data/issues.json').read_bytes()==raw
    print('ARCHIVE_BROWSER_PASS',args.engine,'eight native disclosures; keyboard; latest ordering; source links; related bugs; archive jump/back/reload; 320/390px; stable timestamp; no-JS and data-failure fallbacks')

if __name__=='__main__': main()
