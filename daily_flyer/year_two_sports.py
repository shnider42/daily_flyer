"""Navigation shared only by the two year-two study themes."""
FOOTBALL_ICON = '<svg viewBox="0 0 64 40" aria-hidden="true"><path d="M3 20Q32-13 61 20Q32 53 3 20Z" fill="#ad6539" stroke="currentColor" stroke-width="2"/><path d="M20 20H44M26 14V26M33 14V26M40 14V26" stroke="#fff3d7" stroke-width="2"/></svg>'
BASEBALL_ICON = '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="29" fill="#fff5dd" stroke="#d7c9ab" stroke-width="2"/><path d="M13 10Q35 32 13 54M51 10Q29 32 51 54" fill="none" stroke="#b44230" stroke-width="2"/><path d="M16 17l-6 2M21 25l-7 1M21 34l-7-1M18 43l-7-2M48 17l6 2M43 25l7 1M43 34l7-1M46 43l7-2" stroke="#b44230" stroke-width="2"/></svg>'


def sport_switch(active):
    return '<nav class="yt-sports" aria-label="Choose a sport">'+''.join(
        f'<a href="?theme={theme}"'+(' aria-current="page"' if active==key else '')+f'><span aria-hidden="true">{icon}</span> {label}<small>{description}</small></a>'
        for key, theme, icon, label, description in [
            ("football", "qb_year_two", FOOTBALL_ICON, "Football", "Quarterbacks"),
            ("baseball", "baseball_year_two", BASEBALL_ICON, "Baseball", "Hitters & pitchers")])+ '</nav>'


SPORT_CSS = """
.yt-sports{display:grid;grid-template-columns:1fr 1fr;gap:8px;background:#091e26;padding:14px 20px;border-bottom:1px solid #49615e}
.yt-sports svg{display:inline-block;width:24px;height:24px;vertical-align:-4px}
.yt-sports a,#qb-app .yt-sports a,#bb-app .yt-sports a{display:block;min-height:68px;padding:12px 18px;border:2px solid #71877f;color:#f6f3e9;background:#193c40;text-decoration:none;font:800 21px/1.3 Arial,sans-serif;border-radius:3px}
.yt-sports a small{display:block;font:12px/1.4 Arial,sans-serif;color:inherit;margin:3px 0 0 30px}.yt-sports a[aria-current=page],#qb-app .yt-sports a[aria-current=page],#bb-app .yt-sports a[aria-current=page]{background:#f3e5bb;color:#172f32;border-color:#f3e5bb}
.yt-sports a:hover{filter:brightness(1.12)}.yt-sports a:focus-visible{outline:3px solid #ed8f47;outline-offset:3px}
@media(max-width:600px){.yt-sports{padding:10px;gap:8px}.yt-sports a,#qb-app .yt-sports a,#bb-app .yt-sports a{font-size:18px;min-height:72px;padding:12px 10px}.yt-sports a small{font-size:10px;margin-left:26px}}
"""
