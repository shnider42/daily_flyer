const games = {
  gridiron: { name: 'Gridiron', href: '/gridiron/' },
  soccer: { name: 'Soccer', href: '/sports/?sport=soccer' },
  hockey: { name: 'Hockey', href: '/sports/?sport=hockey' },
};
const key = 'dfe.pocketSports.lastGame';
try {
  const last = games[localStorage.getItem(key)];
  if (last) {
    const link = document.getElementById('return-game');
    link.href = last.href;
    link.textContent = `Play ${last.name} again ↗`;
    link.hidden = false;
  }
} catch { /* Game links remain usable when browser storage is unavailable. */ }
for (const link of document.querySelectorAll('[data-game]')) {
  link.addEventListener('click', () => {
    try { localStorage.setItem(key, link.dataset.game); } catch { /* Optional preference. */ }
  });
}
