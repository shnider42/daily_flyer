/** Full local notices inside the existing notebook; never mutates voyage state. */
export function appendNoticeHistory(container, entries, { document = globalThis.document, focusId = null } = {}) {
  const section = document.createElement('section');
  section.className = 'entry-card notice-history';
  section.setAttribute('aria-label', 'Recent messages');
  const heading = document.createElement('h3');
  heading.textContent = 'Recent messages';
  const note = document.createElement('p');
  note.className = 'mini muted';
  note.textContent = 'Messages from this visit. Your saved voyage log and recovered records are kept separately.';
  section.append(heading, note);

  const messages = (Array.isArray(entries) ? entries : []).filter(entry => entry && typeof entry.text === 'string' && entry.text.length);
  if (!messages.length) {
    const empty = document.createElement('p');
    empty.className = 'mini';
    empty.textContent = 'No recent messages yet. New notices will be available here during this visit.';
    section.append(empty);
  }
  for (const entry of messages) {
    const row = document.createElement('article');
    row.className = 'log-entry';
    row.dataset.noticeId = String(entry.id);
    row.dataset.noticeType = ['info', 'good', 'bad'].includes(entry.type) ? entry.type : 'info';
    const selected = focusId !== null && String(entry.id) === String(focusId);
    const count = Number.isFinite(entry.count) ? Math.max(1, Math.floor(entry.count)) : 1;
    if (selected) {
      row.dataset.selected = 'true';
      row.tabIndex = -1;
      row.style.borderLeft = '3px solid var(--amber)';
      row.style.paddingLeft = '12px';
    }
    if (selected || count > 1) {
      const detail = document.createElement('small');
      detail.textContent = [selected ? 'Selected message' : '', count > 1 ? `Repeated ${count} times` : ''].filter(Boolean).join(' · ');
      row.append(detail);
    }
    const text = document.createElement('p');
    text.textContent = entry.text;
    text.style.whiteSpace = 'pre-wrap';
    text.style.overflowWrap = 'anywhere';
    row.append(text);
    section.append(row);
  }
  container.append(section);
  return section;
}
