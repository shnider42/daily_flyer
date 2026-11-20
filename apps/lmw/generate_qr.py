"""Generate a deterministic event QR locally; no visitor data leaves the site."""
from pathlib import Path
from reportlab.graphics.barcode.qr import QrCodeWidget
import html

url = 'https://dfe-lmw.onrender.com/?event=networking-night'
qr = QrCodeWidget(url, barLevel='M')
qr.qr.make()
modules = qr.qr.modules
size = len(modules) + 8
path = ' '.join(f'M{x+4} {y+4}h1v1h-1z' for y, row in enumerate(modules) for x, cell in enumerate(row) if cell)
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" width="370" height="370" shape-rendering="crispEdges" role="img" aria-labelledby="qr-title"><title id="qr-title">Scan to share your LMW preferences</title><desc>{html.escape(url)}</desc><rect width="{size}" height="{size}" fill="#fff"/><path d="{path}" fill="#152c43"/></svg>'''
Path(__file__).parent.joinpath('public','qr.svg').write_text(svg)
print(f'Generated {len(modules)} by {len(modules)} module QR with a four-module quiet zone.')
