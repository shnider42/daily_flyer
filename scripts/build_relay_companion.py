"""Build only this DFE theme for a Render static-site deployment; no network needed."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from daily_flyer.theme_loader import load_theme
from daily_flyer.renderer import build_html

output = ROOT / "relay_dist"
output.mkdir(exist_ok=True)
theme = load_theme("relay_companion")
(output / "index.html").write_text(build_html(theme.build_theme_page()), encoding="utf-8")
(output / "robots.txt").write_text("User-agent: *\nDisallow: /\n", encoding="utf-8")
print("Built relay_dist/index.html using Daily Flyer theme loading, validation, PageContext and HTML rendering.")
