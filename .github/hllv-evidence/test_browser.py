"""Browser smoke tests for the installed static site; no gameplay claims."""
from __future__ import annotations
import argparse
import json
import subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright, expect


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://127.0.0.1:8765/')
    parser.add_argument('--engine', choices=['chromium','webkit'], default='chromium')
    parser.add_argument('--fallback', action='store_true')
    args = parser.parse_args()
    data = json.loads(Path('hllv_tracker/data/issues.json').read_text())
    expected_data = subprocess.check_output(['git','show','f7341a74d56ba8900d3becee15f07b6e82e613bf:hllv_tracker/data/issues.json'])
    assert Path('hllv_tracker/data/issues.json').read_bytes() == expected_data
    with sync_playwright() as p:
        browser = getattr(p,args.engine).launch()
        context = browser.new_context(viewport={'width':1280,'height':900}, reduced_motion='reduce')
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        if args.fallback:
            page.route('**/evidence.js*', lambda route: route.abort())
        response = page.goto(args.url, wait_until='networkidle')
        assert response and response.status == 200
        expect(page.locator('#featuredIssues button')).to_have_count(3)
        expect(page.locator('#landingUpdated')).to_contain_text('Evidence snapshot Oct 5, 2026')
        expect(page.locator('.evidence-summary:visible')).to_have_count(0)
        page.click('#browseIssues')
        page.fill('#homeSearch','Persistent Recon markers')
        expect(page.locator('#homeList [data-home-id]')).to_have_count(1)
        page.locator('#homeList [data-home-id]').first.click()
        if args.fallback:
            page.locator('.tabs [data-tab="sources"]').click()
            expect(page.locator('#sources .source-row')).to_have_count(6)
            assert not errors, errors
            print('BROWSER_FALLBACK_PASS: original sources work when context asset is unavailable')
            browser.close()
            return
        expect(page.locator('.evidence-summary')).to_contain_text('Independent outcome check: not recorded')
        page.get_by_role('button',name='Inspect evidence').click()
        expect(page.locator('#sources')).to_be_visible()
        expect(page.locator('.tabs [data-tab="sources"]')).to_be_focused()
        expect(page.locator('.evidence-source')).to_have_count(6)
        expect(page.locator('[data-evidence-role="hypothesis"]')).to_have_count(1)
        disclosure=page.locator('.evidence-limits summary').first
        disclosure.focus()
        page.keyboard.press('Space')
        expect(page.locator('.evidence-limits').first).to_have_attribute('open','')
        expect(page.locator('.evidence-limit').first).to_be_visible()
        page.keyboard.press('Space')
        assert not page.locator('.evidence-limits').first.evaluate('(el)=>el.open')
        # All existing source rows are checked, not only a happy-path example.
        for issue in data['issues']:
            page.evaluate('(id)=>selectIssue(id,true)',issue['id'])
            page.locator('.tabs [data-tab="sources"]').click()
            expect(page.locator('.evidence-source')).to_have_count(len(issue['sources']))
            rendered_links=page.locator('.evidence-source .evidence-open').evaluate_all('(els)=>els.map(a=>a.getAttribute("href"))')
            assert rendered_links == [s['url'] for s in issue['sources']], issue['id']
            page.locator('.evidence-limits').evaluate_all('(els)=>els.forEach(e=>e.open=true)')
            for element in page.locator('.evidence-limit').all():
                expect(element).to_be_visible()
            body=page.locator('#sources').inner_text()
            assert 'Independent outcome check: Not recorded.' in body
            assert 'Invalid Date' not in body and 'undefined' not in body
        # Exercise real mobile-width layouts, including open provenance and long titles.
        for width in (390,320):
            page.set_viewport_size({'width':width,'height':844})
            for issue_id in ('HLLV-001','HLLV-004','HLLV-058','HLLV-065'):
                page.evaluate('(id)=>selectIssue(id,true)',issue_id)
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 2'), ('summary overflow',width,issue_id)
                page.locator('.tabs [data-tab="sources"]').click()
                page.locator('.evidence-guide summary').click()
                page.locator('.evidence-limits').evaluate_all('(els)=>els.forEach(e=>e.open=true)')
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 2'), ('source overflow',width,issue_id)
        page.evaluate("()=>selectIssue('HLLV-058',true)")
        page.locator('.tabs [data-tab="sources"]').click()
        expect(page.locator('.evidence-gap').first).to_be_visible()
        page.click('#back')
        expect(page.locator('#home')).to_be_visible()
        page.click('#brandHome')
        expect(page.locator('#landing')).to_be_visible()
        # Direct issue links and browser reload keep working.
        page.goto(args.url+'#HLLV-065',wait_until='networkidle')
        expect(page.locator('#dossier')).to_contain_text('Vehicle engine interaction')
        page.reload(wait_until='networkidle')
        page.locator('.tabs [data-tab="sources"]').click()
        expect(page.locator('[data-evidence-role="player"]')).to_have_count(1)
        assert not errors, errors
        assert Path('hllv_tracker/data/issues.json').read_bytes()==expected_data
        print(f'BROWSER_PASS {args.engine}: 66 issue views, 136 source rows and exact links; keyboard disclosure; focus; search; deep links; reload; 390/320px layouts; no JavaScript errors; unchanged evidence data')
        browser.close()


if __name__ == '__main__':
    main()
