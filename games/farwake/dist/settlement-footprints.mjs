/** The released regional building fit, shared with additive field entrances. */
export function settlementFootprints(plan, sites = [], cols = 108, rows = 80) {
  const reserved = sites.filter(site => !site.cavern).map(site => ({ x: site.tileX, y: site.tileY, w: 12, h: 10 }));
  const centers = {};
  const fit = (desired, w, h) => {
    const clear = p => p.x - w / 2 >= 3 && p.y - h / 2 >= 3 && p.x + w / 2 < cols - 3 && p.y + h / 2 < rows - 3 &&
      !reserved.some(q => Math.abs(q.x - p.x) < (q.w + w) / 2 + 2 && Math.abs(q.y - p.y) < (q.h + h) / 2 + 2);
    const candidates = [];
    for (let dy = -16; dy <= 16; dy += 2) for (let dx = -16; dx <= 16; dx += 2) candidates.push({ x: desired.x + dx, y: desired.y + dy, d: dx * dx + dy * dy });
    candidates.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x);
    let p = candidates.find(clear);
    if (!p) for (let y = 8; y < rows - 8 && !p; y += 2) for (let x = 8; x < cols - 8; x += 2) if (clear({ x, y })) { p = { x, y }; break; }
    p ||= { ...desired };
    const result = { x: p.x, y: p.y };
    reserved.push({ ...result, w, h });
    return result;
  };
  centers.landing = fit(plan.anchors.landing, 10, 8);
  if (!plan.barren) {
    for (const name of ['workshop', 'clinic', 'common', 'keeper']) centers[name] = fit(plan.anchors[name], name === 'common' ? 12 : 10, 8);
    centers.square = fit(plan.anchors.square, 13, 9);
  }
  return { centers, reserved };
}
