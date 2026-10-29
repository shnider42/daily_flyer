"""Export the validated DFE BREACH theme and its local assets for static hosting.

Uses only the Python standard library and DFE's loader/renderer. The published
game has no Python runtime. Optional co-op connects to its configured room service.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from daily_flyer.renderer import build_html  # noqa: E402
from daily_flyer.theme_loader import load_theme  # noqa: E402


def export(output: Path) -> None:
    theme = load_theme("breach")
    source = theme.ASSET_DIRECTORY.resolve()
    output = output.resolve()
    if output == ROOT or source == output or source in output.parents:
        raise ValueError("Export to a separate build directory.")
    required = ("index.html", "style.css", "app.mjs", "core.mjs", "renderer.mjs", "vendor/three.module.js", "vendor/three.core.js", "vendor/THREE-LICENSE.txt")
    for name in required:
        item = source / name
        if not item.is_file() or not item.stat().st_size:
            raise FileNotFoundError(f"Required game asset is missing: {name}")
    output.mkdir(parents=True, exist_ok=True)
    shutil.copytree(source, output, dirs_exist_ok=True, ignore=shutil.ignore_patterns("__pycache__"))
    context = theme.build_theme_page()
    document = build_html(context).replace('<base href="/daily_flyer/themes/breach_assets/">', '<base href="./">')
    if "__BREACH_" in document:
        raise ValueError("Unresolved BREACH template placeholder.")
    (output / "index.html").write_text(document, encoding="utf-8")
    hashes = {
        str(file.relative_to(output)): hashlib.sha256(file.read_bytes()).hexdigest()
        for file in sorted(output.rglob("*"))
        if file.is_file() and file.name != "build-manifest.json"
    }
    (output / "build-manifest.json").write_text(
        json.dumps({"version": theme.VERSION, "theme": "breach", "files": hashes}, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Exported DFE theme breach ({theme.VERSION}): {len(hashes)} assets to {output}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "dist_breach")
    export(parser.parse_args().output)
