"""Build only Roast Machine's public assets, using the Python standard library."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "daily_flyer" / "themes" / "roast_machine_assets"
FILES = ("index.html", "styles.css", "engine.js", "app.js", "favicon.svg")


def build(output: Path) -> Path:
    missing = [name for name in FILES if not (SOURCE / name).is_file()]
    if missing:
        raise SystemExit(f"Missing Roast Machine assets: {', '.join(missing)}")
    output.mkdir(parents=True, exist_ok=True)
    for name in FILES:
        shutil.copyfile(SOURCE / name, output / name)
    # This is a public standalone URL, intentionally not a directory entry.
    # Crawlers are asked not to index it; this is not an access-control feature.
    (output / "robots.txt").write_text("User-agent: *\nDisallow: /\n", encoding="utf-8")
    return output


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--outdir", type=Path, default=ROOT / "dist" / "roast-machine")
    args = parser.parse_args()
    destination = build(args.outdir)
    print(f"Built Roast Machine: {destination}")
