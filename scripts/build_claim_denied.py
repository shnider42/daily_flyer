"""Export Claim Denied through the DailyFlyer theme contract; reuse local Three.js."""
import hashlib
import json
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from daily_flyer.themes import claim_denied
from daily_flyer.renderer import build_html

def export(output=ROOT / 'dist_claim_denied'):
    source=claim_denied.ASSET_DIRECTORY
    output=Path(output).resolve()
    if output==ROOT or source==output or source in output.parents:
        raise ValueError('Export to a separate build directory.')
    shutil.copytree(source,output,dirs_exist_ok=True)
    shutil.copytree(ROOT/'daily_flyer/themes/breach_assets/vendor',output/'vendor',dirs_exist_ok=True)
    html=build_html(claim_denied.build_theme_page()).replace('/daily_flyer/themes/claim_denied_assets/', './')
    if '__CLAIM_DENIED_' in html:
        raise ValueError('Unresolved template placeholder')
    (output/'index.html').write_text(html)
    hashes={str(p.relative_to(output)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(output.rglob('*')) if p.is_file() and p.name!='build-manifest.json'}
    (output/'build-manifest.json').write_text(json.dumps({'version':claim_denied.VERSION,'theme':'claim_denied','files':hashes},indent=2))
    print(f'Exported Claim Denied {claim_denied.VERSION}: {len(hashes)} assets')

if __name__=='__main__':
    export(Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'dist_claim_denied')
