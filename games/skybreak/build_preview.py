"""Make an offline, self-contained solo preview without changing the hosted game."""
from pathlib import Path
import base64
import json
import re
import sys

root = Path(__file__).resolve().parent / "public"
output = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/Skybreak-Preview.html")
modules = ["vendor/three.module.js", "world.mjs", "engine.mjs", "renderer.mjs", "audio.mjs", "client.mjs"]
sources = {name: (root / name).read_text() for name in modules}
css = (root / "style.css").read_text()
font = base64.b64encode((root / "vendor/harbor-display.woff").read_bytes()).decode()
css = css.replace("./vendor/harbor-display.woff", "data:font/woff;base64," + font)
html = (root / "index.html").read_text()
html = re.sub(r'<link rel="stylesheet"[^>]+>', lambda _: "<style>" + css + "</style>", html)
bootstrap = """
window.SKYBREAK_PREVIEW = true;
const sources = SOURCES;
const urls = {};
for (const [name, original] of Object.entries(sources)) {
  let source = original;
  for (const [dependency, url] of Object.entries(urls)) {
    source = source.split("'./" + dependency + "'").join(JSON.stringify(url));
    source = source.split('"./' + dependency + '"').join(JSON.stringify(url));
  }
  urls[name] = URL.createObjectURL(new Blob([source], {type:'text/javascript'}));
}
const entry = document.createElement('script');
entry.type = 'module';
entry.src = urls['client.mjs'];
document.body.append(entry);
""".replace("SOURCES", json.dumps(sources, ensure_ascii=True).replace("</", "<\\/"))
html = re.sub(r'<script type="module" src="client\.mjs[^>]+></script>', lambda _: "<script>" + bootstrap + "</script>", html)
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(html)
print(f"{output} ({output.stat().st_size:,} bytes)")
