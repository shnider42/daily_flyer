"""Navigation shared by the year-two study themes."""
BOWLING_ICON = '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="25" cy="37" r="23" fill="#bd6748" stroke="currentColor" stroke-width="2"/><g fill="#342c38"><circle cx="22" cy="24" r="4"/><circle cx="33" cy="27" r="4"/><circle cx="25" cy="35" r="4"/></g><path d="M48 4c-8 0-7 9-4 15 3 7-5 13-5 27 0 10 19 10 19 0 0-14-8-20-5-27 3-6 4-15-5-15Z" fill="#fff4d9" stroke="#aa947e" stroke-width="2"/><path d="M44 19h10m-10 5h10" stroke="#ba493d" stroke-width="3"/></svg>'
FOOTBALL_ICON = '<svg viewBox="0 0 64 40" aria-hidden="true"><path d="M3 20Q32-13 61 20Q32 53 3 20Z" fill="#ad6539" stroke="currentColor" stroke-width="2"/><path d="M20 20H44M26 14V26M33 14V26M40 14V26" stroke="#fff3d7" stroke-width="2"/></svg>'
BASEBALL_ICON = '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="29" fill="#fff5dd" stroke="#d7c9ab" stroke-width="2"/><path d="M13 10Q35 32 13 54M51 10Q29 32 51 54" fill="none" stroke="#b44230" stroke-width="2"/><path d="M16 17l-6 2M21 25l-7 1M21 34l-7-1M18 43l-7-2M48 17l6 2M43 25l7 1M43 34l7-1M46 43l7-2" stroke="#b44230" stroke-width="2"/></svg>'


def sport_switch(active, detail_controls=True):
    return '<nav class="yt-sports" aria-label="Choose a sport">'+''.join(
        f'<a href="?theme={theme}"'+(' aria-current="page"' if active==key else '')+f'><span aria-hidden="true">{icon}</span> {label}<small>{description}</small></a>'
        for key, theme, icon, label, description in [
            ("football", "qb_year_two", FOOTBALL_ICON, "Football", "Quarterbacks"),
            ("baseball", "baseball_year_two", BASEBALL_ICON, "Baseball", "Hitters & pitchers"),
            ("bowling", "bowling_year_two", BOWLING_ICON, "Bowling", "PBA profiles")])+ '</nav>' + (DETAIL_CONTROL if detail_controls else '')


DETAIL_CONTROL = '''<section id="yt-levels" class="yt-levels" aria-label="Choose your detail level">
<div class="yt-level-heading"><strong>How deep do you want to go?</strong><span>Same data. Your kind of explanation.</span></div>
<div class="yt-level-buttons" role="group" aria-label="Detail level">
<button type="button" data-detail-level="simple" aria-pressed="true">Simple Mode<small>Just tell me the story</small></button>
<button type="button" data-detail-level="guided" aria-pressed="false">Guided<small>Let me explore, with help</small></button>
<button type="button" data-detail-level="full" aria-pressed="false">Full detail<small>Give me every number</small></button>
</div><p id="yt-level-status" role="status"></p></section>'''


SPORT_CSS = """
.yt-sports{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;background:#091e26;padding:14px 20px;border-bottom:1px solid #49615e}
.yt-sports svg{display:inline-block;width:24px;height:24px;vertical-align:-4px}
.yt-sports a,#qb-app .yt-sports a,#bb-app .yt-sports a{display:block;min-height:68px;padding:12px 18px;border:2px solid #71877f;color:#f6f3e9;background:#193c40;text-decoration:none;font:800 21px/1.3 Arial,sans-serif;border-radius:3px}
.yt-sports a small{display:block;font:12px/1.4 Arial,sans-serif;color:inherit;margin:3px 0 0 30px}.yt-sports a[aria-current=page],#qb-app .yt-sports a[aria-current=page],#bb-app .yt-sports a[aria-current=page]{background:#f3e5bb;color:#172f32;border-color:#f3e5bb}
.yt-sports a:hover{filter:brightness(1.12)}.yt-sports a:focus-visible{outline:3px solid #ed8f47;outline-offset:3px}
@media(max-width:600px){.yt-sports{padding:10px;gap:8px}.yt-sports a,#qb-app .yt-sports a,#bb-app .yt-sports a{font-size:18px;min-height:72px;padding:12px 10px}.yt-sports a small{font-size:10px;margin-left:26px}}
@media(max-width:460px){.yt-sports{gap:5px;padding:8px}.yt-sports a,#qb-app .yt-sports a,#bb-app .yt-sports a,#bw-app .yt-sports a{font-size:15px;padding:10px 6px}.yt-sports a small{margin-left:0;font-size:10px}.yt-sports svg{width:19px;height:19px}}
"""
