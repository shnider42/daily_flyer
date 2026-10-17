"""Guarded presentation-only migration; run tests before publishing generated files."""
from __future__ import annotations
import hashlib
from pathlib import Path

ROOT = Path('hllv_tracker')
ASSETS = Path('.github/hllv-evidence')
BASE_HTML = '6f63752b6f7567ae7d43bcbd391ba2b792cc83ef'


def git_blob(raw: bytes) -> str:
    return hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()


def replace_once(document: str, old: str, new: str) -> str:
    if document.count(old) != 1:
        raise RuntimeError('Expected exactly one unchanged integration point: ' + old[:90])
    return document.replace(old, new, 1)


def main() -> None:
    data_before = (ROOT / 'data/issues.json').read_bytes()
    path = ROOT / 'index.html'
    raw = path.read_bytes()
    html = raw.decode('utf-8')
    if 'id="hllv-evidence-v1"' not in html:
        if git_blob(raw) != BASE_HTML:
            raise RuntimeError('Tracker HTML changed; reconcile instead of overwriting it.')
        html = replace_once(html, '</head>', '  <link rel="stylesheet" href="./evidence.css?v=1">\n</head>')
        html = replace_once(html, '  <script>\n', '  <script id="hllv-evidence-v1" src="./evidence.js?v=1"></script>\n  <script>\n')
        html = replace_once(html, 'function sources(i){return ', 'function sources(i){if(window.HLLVEvidence)return HLLVEvidence.renderSources(i,dataset);return ')
        lines = html.splitlines(keepends=True)
        found = False
        for index, line in enumerate(lines):
            if line.lstrip().startswith('function summary(i){return '):
                if not line.rstrip().endswith('`}'):
                    raise RuntimeError('Unexpected summary renderer shape')
                lines[index] = line.rstrip()[:-2] + "${window.HLLVEvidence?HLLVEvidence.renderSummary(i):''}` }\n"
                found = True
        if not found:
            raise RuntimeError('Missing summary renderer')
        html = ''.join(lines)
        html = replace_once(html, "${i.sources.length} ${i.sources.length===1?'source':'sources'}", "${i.sources.length} linked ${i.sources.length===1?'reference':'references'}")
        html = replace_once(html, 'Tracker updated ${formatDate(dataset.generated_at)}', 'Evidence snapshot ${formatDate(dataset.generated_at)}')
        html = replace_once(html, '<span>Latest verified change</span>', '<span>Latest evidence review</span>')
        html = replace_once(html, '<span class="fact-label">Last updated</span>', '<span class="fact-label">Latest evidence</span>')
        html = replace_once(html, 'Every status links back to a source. If the cause or outcome is unknown, the tracker says so.', 'Sources show what each claim supports, its limits, and what has not been independently checked.')
        # Preserve focus after the existing tab renderer replaces its own buttons.
        html = replace_once(html, 'activeTab=b.dataset.tab;renderDossier()', "activeTab=b.dataset.tab;renderDossier();document.querySelector('.tabs [data-tab=\"'+activeTab+'\"]')?.focus({preventScroll:true})")
        path.write_text(html, encoding='utf-8')
    for asset in ('evidence.js', 'evidence.css'):
        (ROOT / asset).write_bytes((ASSETS / asset).read_bytes())
    documentation = ROOT / 'EVIDENCE.md'
    documentation.write_text('''# Source context and evidence limits

The Sources view now distinguishes publisher release records, official updates and plans, historical known issues, developer answers/hypotheses, support acknowledgment, and player observations. These are scoped evidence roles, not numerical site trust scores. They interpret the existing ledger and do not constitute a new full-source or gameplay audit.

## Invariants

This presentation update does not change `data/issues.json`, issue status, original claims, source links, timelines, incidents or the evidence snapshot date. Repeated references and distinct URLs are counted separately; neither is a count of independent confirmations. Official channels repeating the same statement are not independent corroboration.

The visible Supports text is the exact stored `source.claim`. Known topic-only descriptions are flagged as Claim needs detail, including on official sources. Do not replace a vague historical citation with a newer issue summary: reread the specific source, record the supporting passage or exact reply, and update that citation deliberately.

Publication date (`source_published_at`), evidence date (`date`), full-source review date (`source_reviewed_at`), issue review (`last_reviewed`) and URL accessibility (`link_checked_at`) are separate. Missing fields display Not separately recorded. A successful HTTP check is not claim validation. This push creates none of those review dates.

## Independent outcome checks

No outcome verification is inferred from a shipped status, an official badge, a review date, or a working link. A future source may carry `outcome_verification` with `independent: true`, `result: verified | not_resolved | mixed`, an ISO `date`, HTTPS evidence `url`, a nonempty `method` and a nonempty `scope`. All fields are required before a result is displayed. The summary only reports that outcome evidence is linked, never that the whole issue is resolved. These fields require editorial verification; the UI cannot authenticate a test by itself.

## Testing and deployment

`node --test .github/hllv-evidence/test_evidence.cjs` exercises the actual dataset plus adverse fixtures. `.github/hllv-evidence/test_browser.py` checks all issue/source renderings, navigation, disclosure controls, mobile overflow and missing-module fallback. The narrowly scoped install workflow runs local tests before committing generated HTML/assets and then compares production bytes and tests the deployed site. It is not a recurring evidence collector or a replacement for the game-evidence review.

Rollback baseline for this presentation: `f7341a74d56ba8900d3becee15f07b6e82e613bf`. The existing Render service, branch and no-build static hosting remain unchanged.
''', encoding='utf-8')
    assert (ROOT / 'data/issues.json').read_bytes() == data_before
    print('PRESENTATION_INSTALLED; evidence dataset unchanged:', git_blob(data_before))


if __name__ == '__main__':
    main()
