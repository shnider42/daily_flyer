"""Build the independent wedding notebook using only the Python standard library."""

from __future__ import annotations

import argparse
import hashlib
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "daily_flyer" / "themes" / "best_man_assets"
REQUIRED_FILES = ("index.html", "styles.css", "store.js", "cloud.js", "app.js")
OPTIONAL_FILES = ("favicon.svg", "manifest.webmanifest", "icon-192.png", "icon-512.png")
FILES = REQUIRED_FILES + OPTIONAL_FILES
FINGERPRINTED = ("styles.css", "store.js", "cloud.js", "app.js")


def asset_name(name: str, content: bytes) -> str:
    if name not in FINGERPRINTED:
        return name
    path = Path(name)
    digest = hashlib.sha256(content).hexdigest()[:12]
    return f"{path.stem}.{digest}{path.suffix}"


def build(output: Path) -> Path:
    source = SOURCE.resolve()
    destination = output.resolve()
    if destination == source or destination in source.parents or source in destination.parents:
        raise SystemExit("The publish directory must be separate from the source directory and its ancestors.")
    missing = [name for name in REQUIRED_FILES if not (source / name).is_file()]
    if missing:
        raise SystemExit(f"Missing notebook assets: {', '.join(missing)}")
    names_present = [name for name in FILES if (source / name).is_file()]
    contents = {name: (source / name).read_bytes() for name in names_present}
    names = {name: asset_name(name, data) for name, data in contents.items()}
    html = contents["index.html"].decode("utf-8")
    for name in OPTIONAL_FILES:
        if name not in contents and re.search(r"[\"']" + re.escape(name) + r"[\"']", html):
            raise SystemExit(f"The notebook HTML references a missing asset: {name}")
    for name in FINGERPRINTED:
        html = re.sub(
            r"(?P<quote>[\"'])" + re.escape(name) + r"(?P=quote)",
            lambda match: match.group("quote") + names[name] + match.group("quote"),
            html,
        )
    if not re.search(r"<meta\b[^>]*\bname\s*=\s*['\"]robots['\"]", html, re.I):
        html, inserted = re.subn(
            r"</head\s*>",
            '<meta name="robots" content="noindex, nofollow">\n</head>',
            html,
            count=1,
            flags=re.I,
        )
        if not inserted:
            raise SystemExit("The notebook HTML is missing its head.")
    contents["index.html"] = html.encode("utf-8")
    destination.mkdir(parents=True, exist_ok=True)
    # Delete only previous artifacts owned by this builder. Other files and
    # directories are retained, including when --outdir is supplied manually.
    for old in destination.iterdir():
        owned = old.name in (*FILES, "robots.txt") or re.fullmatch(
            r"(?:styles|store|cloud|app)\.[0-9a-f]{12}\.(?:css|js)", old.name
        )
        if owned and (old.is_file() or old.is_symlink()):
            old.unlink()
    for name, data in contents.items():
        target = destination / names[name]
        target.write_bytes(data)
        if target.read_bytes() != data:
            raise SystemExit(f"Build verification failed: {target.name}")
        print(f"  {target.name}: {len(data)} bytes")
    (destination / "robots.txt").write_text("User-agent: *\nDisallow: /\n", encoding="utf-8")
    return destination


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--outdir", type=Path, default=ROOT / "dist" / "best-man")
    args = parser.parse_args()
    print(f"Built notebook: {build(args.outdir)}")
