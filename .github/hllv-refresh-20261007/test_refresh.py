"""Publication/date regressions and end-to-end checks; not gameplay verification."""
from urllib.parse import urljoin
import argparse
import hashlib
import json
import subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright, expect


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--url',default='http://127.0.0.1:8765/')
    parser.add_argument('--engine',default='chromium',choices=['chromium','webkit'])
    args=parser.parse_args()
    raw=Path('hllv_tracker/data/issues.json').read_bytes()
    data=json.loads(raw)
    assert len(data['issues'])==75
    assert data['generated_at']=='2026-10-07'
    report=json.loads(Path('hllv_tracker/reviews/2026-10-07.json').read_text())
    assert report['refined_claims']==21
    assert report['source_references']==sum(len(i['sources']) for i in data['issues'])
    # Later UI publications retain the original evidence review time.
    assert data['page_updated_at']>=report['page_updated_at']
    issues={i['id']:i for i in data['issues']}
    for id_ in ['HLLV-058','HLLV-063']: assert issues[id_]['status_key']=='shipped'
    for id_ in ['HLLV-033','HLLV-059','HLLV-060','HLLV-061','HLLV-062','HLLV-064','HLLV-065','HLLV-066']:
        assert issues[id_]['status_key']!='shipped'
    assert issues['HLLV-065']['last_updated']=='2026-10-02'
    assert issues['HLLV-066']['last_updated']=='2026-10-02'
    # Exercise formatting without a DOM, including rollover dates and no clock fallback.
    subprocess.run(['node','-e',"""
    const a=require('node:assert/strict'), F=require('./hllv_tracker/freshness.js');
    a.match(F.describe({page_updated_at:'2026-10-07T13:00:00Z'}).label,/October 7, 2026.*9:00.*AM.*EDT/);
    a.match(F.describe({page_updated_at:'2026-01-07T13:00:00Z'}).label,/8:00.*AM.*EST/);
    for(const value of ['',null,'today','2026-02-30T13:00:00Z','2026-10-07T25:00:00Z']) a.equal(F.timestamp(value),null);
    a.equal(F.describe({}).label,'Not available');
    a.match(F.describe({page_updated_at:'bad',generated_at:'2026-10-07'}).label,/time not recorded/);
    """],check=True)
    with sync_playwright() as p:
        browser=getattr(p,args.engine).launch()
        context=browser.new_context(viewport={'width':1280,'height':900},reduced_motion='reduce')
        page=context.new_page(); errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        response=page.goto(args.url,wait_until='networkidle')
        assert response.status==200
        expected=page.evaluate('(d)=>HLLVFreshness.describe(d).label',data)
        stamp=page.locator('#pageLastUpdated')
        expect(stamp).to_have_text(expected)
        expect(stamp).to_have_attribute('datetime',data['page_updated_at'])
        expect(page.locator('#latestChange')).to_contain_text('Patch 1.6 released')
        assert 'still upcoming' not in page.locator('#latestChange').inner_text()
        page.click('#browseIssues'); expect(stamp).to_be_visible(); expect(stamp).to_have_text(expected)
        page.fill('#homeSearch','DLSS Frame Generation')
        page.locator('#homeList [data-home-id]').first.click()
        expect(page.locator('#dossier')).to_contain_text('Release status unconfirmed')
        expect(stamp).to_be_visible(); expect(stamp).to_have_text(expected)
        page.get_by_role('button',name='Inspect evidence').click()
        page.locator('.evidence-limits').evaluate_all('(els)=>els.forEach(e=>e.open=true)')
        expect(page.locator('#sources')).to_contain_text('Where to look:')
        expect(page.locator('#sources')).to_contain_text('October 7' if False else 'Oct 7, 2026')
        for width in (390,320):
            page.set_viewport_size({'width':width,'height':844})
            page.locator('.page-freshness details').evaluate('(e)=>e.open=true')
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+2')
            expect(stamp).to_be_visible(); expect(stamp).to_have_text(expected)
        # Simulate a visitor with a different future clock; the saved date must not move.
        page.add_init_script("const OriginalDate=Date;class FutureDate extends OriginalDate{constructor(...a){super(...(a.length?a:['2027-03-01T12:00:00Z']));}static now(){return new OriginalDate('2027-03-01T12:00:00Z').getTime();}}window.Date=FutureDate;")
        page.reload(wait_until='networkidle'); expect(stamp).to_have_text(expected)
        assert context.request.get(urljoin(args.url,page.evaluate('TRACKER_DATA_URL'))).body()==raw
        assert not errors,errors
        # Missing fields and bad dates are visible, not replaced by today's clock.
        for payload,label in [({},'Not available'),({'generated_at':'2026-10-07'},'time not recorded')]:
            page.evaluate('(d)=>HLLVFreshness.render(d)',payload)
            expect(stamp).to_contain_text(label)
        page.evaluate('(d)=>HLLVFreshness.render(d)',data)
        expect(stamp).to_have_text(expected)
        failure=context.new_page()
        failure.route('**/data/issues*.json',lambda route:route.fulfill(status=503,body='unavailable'))
        failure.goto(args.url,wait_until='networkidle')
        expect(failure.locator('#pageLastUpdated')).to_have_text('Not available')
        browser.close()
    assert Path('hllv_tracker/data/issues.json').read_bytes()==raw
    print('REFRESH_BROWSER_PASS',args.engine,'persistent global saved timestamp, timezone, reload, future clock, navigation, mobile, failure states, current evidence and source locators')

if __name__=='__main__': main()
