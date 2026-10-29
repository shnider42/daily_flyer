"""Build the Render static site with the existing DFE renderer; no dependencies."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from daily_flyer.renderer import build_html
from daily_flyer.themes.battlezone_1980 import build_theme_page

output = ROOT / "dist_battlezone"
output.mkdir(exist_ok=True)
html = build_html(build_theme_page())
html = html.replace("</head>", '<meta name="description" content="Green wireframe tank combat. Play an endless patrol or a fresh five-wave daily mission, with bonus saucers, repair pickups and flanking tanks.">\n<meta name="theme-color" content="#080c09">\n</head>')
(output / "index.html").write_text("\n".join(line.rstrip() for line in html.splitlines()) + "\n", encoding="utf-8")
print("Built dist_battlezone/index.html")
