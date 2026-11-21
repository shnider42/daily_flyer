"""Publish Infierno's policy and entry points without changing account or data rules."""
from pathlib import Path
import hashlib
import json
import re

ROOT = Path('hllv_tracker')
SRC = Path(__file__).parent


def asset(path, name, extension):
    raw = path.read_bytes()
    url = 'assets/' + name + '-' + hashlib.sha256(raw).hexdigest()[:16] + extension
    (ROOT / url).write_bytes(raw)
    return url


def main():
    page = ROOT / 'index.html'
    markup = page.read_text()
    privacy_css = asset(SRC / 'privacy.css', 'privacy', '.css')
    links_css = asset(SRC / 'links.css', 'privacy-links', '.css')
    preferences = re.search(r'<script id="hllv-ux-preferences"[^>]*src="([^"]+)"', markup)[1]
    policy = (SRC / 'privacy.html').read_text().replace('{{PRIVACY_CSS}}', './' + privacy_css).replace('{{PREFERENCES_JS}}', preferences)
    assert '{{' not in policy
    (ROOT / 'privacy.html').write_text(policy)

    policy_link = '<p><a href="./privacy.html" target="_blank" rel="noopener noreferrer">Read the full privacy policy (opens in a new tab)</a> for information about account data, browser storage, service providers, retention and privacy requests.</p>'
    anchor = '<details id="communityPrivacy"><summary>Privacy and participation</summary>'
    assert markup.count(anchor) == 1
    if policy_link not in markup:
        markup = markup.replace(anchor, anchor + policy_link, 1)

    footer = '<footer id="sitePrivacyFooter" class="site-policy-footer" aria-label="Site privacy"><a href="./privacy.html" target="_blank" rel="noopener noreferrer" aria-label="Privacy policy (opens in a new tab)">Privacy policy ↗</a><a href="mailto:chris@holtsnidertech.com?subject=Infierno%20Liberado%20privacy%20request">Privacy questions</a></footer>'
    if 'id="sitePrivacyFooter"' in markup:
        markup = re.sub(r'<footer id="sitePrivacyFooter"[\s\S]*?</footer>', lambda _: footer, markup, count=1)
    else:
        markup = markup.replace('</body>', footer + '\n</body>', 1)
    style = '<link id="hllv-privacy-links" rel="stylesheet" href="./' + links_css + '">'
    if 'id="hllv-privacy-links"' in markup:
        markup = re.sub(r'<link id="hllv-privacy-links"[^>]+>', lambda _: style, markup, count=1)
    else:
        markup = markup.replace('</head>', style + '\n</head>', 1)

    changed_assets = []
    for path, prefix, tag in [
        ('.github/hllv-community/app.js', 'community', 'suggestions-module'),
        ('.github/hllv-member-registration/registration.js', 'registration', 'hllv-registration-module'),
    ]:
        url = asset(Path(path), prefix, '.js')
        markup, count = re.subn(r'(<script id="' + tag + r'"[^>]*src=")[^"]+', lambda match: match[1] + './' + url, markup)
        assert count == 1, tag
        changed_assets.append(url)
    page.write_text(markup)

    config_path = ROOT / 'suggestions-config.json'
    config = json.loads(config_path.read_text())
    config['participant_contact'] = 'chris@holtsnidertech.com'
    config['retention_notice'] = 'Withdrawal hides public submissions. Saved text, prior wording, private conversations, and history remain until the operator removes them. Provider logs and any backups have separate retention. Read the privacy policy or email the operator to make a request.'
    config['privacy_policy_url'] = './privacy.html'
    config_path.write_text(json.dumps(config, indent=2) + '\n')

    manifest_path = ROOT / 'deployment-manifest.json'
    manifest = json.loads(manifest_path.read_text())
    linked = [url[2:] for url in re.findall(r'(?:src|href|data-source)="(\./[^"]+)"', markup) if (ROOT / url[2:].split('?')[0]).is_file()]
    privacy_assets = ['privacy.html', privacy_css, links_css]
    manifest['files'] = list(dict.fromkeys([url for url in manifest['files'] if not url.startswith(('assets/community-', 'assets/registration-', 'assets/privacy-')) or not url.endswith(('.js', '.css')) or url in linked] + linked + privacy_assets))
    manifest['privacy_assets'] = privacy_assets
    manifest['privacy_policy_updated'] = '2026-11-10'
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
    print('PRIVACY_POLICY_PUBLISHED', ', '.join(privacy_assets + changed_assets))


if __name__ == '__main__':
    main()
