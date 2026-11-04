from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from daily_flyer_v2 import build_flyer_html
path=ROOT/'nfl_catchup/index.html'
path.parent.mkdir(exist_ok=True)
path.write_text(build_flyer_html('nfl_catch_up'),encoding='utf-8')
print(f'Built {path.relative_to(ROOT)} ({path.stat().st_size:,} bytes)')
