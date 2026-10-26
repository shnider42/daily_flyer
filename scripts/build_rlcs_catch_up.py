"""Export the registered DFE v2 product; run from any working directory."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from daily_flyer_v2 import build_flyer_html

output = ROOT / "rlcs_catchup" / "index.html"
output.parent.mkdir(exist_ok=True)
output.write_text(build_flyer_html("rlcs_catch_up"), encoding="utf-8")
print(f"Exported {output.relative_to(ROOT)} ({output.stat().st_size:,} bytes)")
