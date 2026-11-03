"""Build the self-contained Next Chapter DFE edition for Render Static Sites."""
from pathlib import Path
import json
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "next_chapter"
DEST = ROOT / "dist_next_chapter"
FILES = ("index.html", "style.css", "app.mjs", "model.mjs", "store.mjs", "favicon.svg")

def build():
    DEST.mkdir(exist_ok=True)
    for name in FILES:
        path = SOURCE / name
        if not path.is_file() or not path.stat().st_size:
            raise RuntimeError(f"Missing Next Chapter asset: {name}")
        shutil.copy2(path, DEST / name)
    try:
        commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    except (OSError, subprocess.CalledProcessError):
        commit = "local"
    (DEST / "build.json").write_text(json.dumps({"app": "next-chapter", "version": "1.0.0", "commit": commit}) + "\n")
    print(f"Built Next Chapter: {len(FILES)} assets → {DEST}")

if __name__ == "__main__":
    build()
