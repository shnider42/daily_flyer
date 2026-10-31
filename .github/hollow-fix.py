from pathlib import Path
p = Path('scripts/breach-hollow-browser.mjs')
s = p.read_text()
old = "  // Repeated USE intentionally toggles the same physical cabinet back.\n  await page.keyboard.press('e');"
new = "  // Observe the documented server action guard before the second deliberate USE.\n  await until(()=>Date.now()-room.players.get('p1').lastActionAt>=110,'routing action guard expires');\n  await page.keyboard.press('e');"
assert old in s
s = s.replace(old, new)
s = s.replace("room:room&&{status:room.status,pauseReason:room.pauseReason}", "room:room&&{status:room.status,pauseReason:room.pauseReason,lastActionAge:Date.now()-room.players.get('p1').lastActionAt}")
p.write_text(s)
