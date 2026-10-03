"""Small, static domain switch shared by two otherwise independent themes.

No shared storage, observers, routing interception or legacy JavaScript edits.
"""
from __future__ import annotations

MODE_CSS = r'''
.journey-mode-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:0 0 18px;padding:12px 0;border-bottom:1px solid #ffffff24;font:500 14px/1.5 system-ui,sans-serif;color:#ddd6c8}
.journey-mode-bar .journey-mode-label{letter-spacing:.14em;text-transform:uppercase;font-size:11px}
.journey-mode-switch{display:inline-flex;gap:3px;padding:4px;background:#131313;border:1px solid #ffffff38;border-radius:9px}
.journey-mode-switch a{display:inline-flex;align-items:center;justify-content:center;min-height:44px;min-width:92px;padding:8px 15px;border-radius:6px;color:#c5c4c0;font-weight:650;text-decoration:none!important}
.journey-mode-switch a[aria-current="page"]{background:#eee6d6;color:#201b17}
.journey-mode-switch a:focus-visible{outline:3px solid #c8a564;outline-offset:3px}
@media print{.journey-mode-bar{display:none}}
'''


def mode_bar(active: str) -> str:
    if active not in {'cars', 'guitars'}:
        raise ValueError('Unknown Journey domain')
    cars = ' aria-current="page"' if active == 'cars' else ''
    guitars = ' aria-current="page"' if active == 'guitars' else ''
    return (
        '<nav class="journey-mode-bar" aria-label="Journey mode">'
        '<span class="journey-mode-label">Garage Journey / Instrument Journey</span>'
        '<span class="journey-mode-switch">'
        f'<a href="/?theme=garage"{cars}>Cars</a>'
        f'<a href="/?theme=instrument_journey"{guitars}>Guitars</a>'
        '</span></nav>'
    )
