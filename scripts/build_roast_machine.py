"""Build only Roast Machine's public assets, using the Python standard library."""

from __future__ import annotations

import argparse
import hashlib
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "daily_flyer" / "themes" / "roast_machine_assets"
FILES = ("index.html", "styles.css", "engine.js", "app.js", "favicon.svg")
FINGERPRINTED = ("styles.css", "engine.js", "app.js")


def asset_name(name: str, content: bytes) -> str:
    if name not in FINGERPRINTED:
        return name
    path = Path(name)
    digest = hashlib.sha256(content).hexdigest()[:12]
    return f"{path.stem}.{digest}{path.suffix}"


def build(output: Path) -> Path:
    missing = [name for name in FILES if not (SOURCE / name).is_file()]
    if missing:
        raise SystemExit(f"Missing Roast Machine assets: {', '.join(missing)}")
    if output.resolve() == SOURCE or output.resolve() in SOURCE.parents:
        raise SystemExit("The publish directory must not be a source directory.")
    contents = {name: (SOURCE / name).read_bytes() for name in FILES}
    names = {name: asset_name(name, data) for name, data in contents.items()}
    html = contents["index.html"].decode("utf-8")
    for name in FINGERPRINTED:
        html = html.replace(f'"{name}"', f'"{names[name]}"')
    contents["index.html"] = html.encode("utf-8")
    output.mkdir(parents=True, exist_ok=True)
    # Clean only previous files belonging to this build, never unrelated files
    # or directories supplied through --outdir.
    for old in output.iterdir():
        owned = old.name in (*FILES, "robots.txt") or re.fullmatch(
            r"(?:styles|engine|app)\.[0-9a-f]{12}\.(?:css|js)", old.name
        )
        if owned and old.is_file():
            old.unlink()
    for name, data in contents.items():
        target = output / names[name]
        target.write_bytes(data)
        if target.read_bytes() != data:
            raise SystemExit(f"Build verification failed: {target.name}")
        print(f"  {target.name}: {len(data)} bytes")
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
