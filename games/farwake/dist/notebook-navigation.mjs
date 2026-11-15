/** One set of notebook destinations, regardless of which section is open. */
export const NOTEBOOK_SECTIONS = Object.freeze([
  ['stories', 'Stories & campaigns'], ['missions', 'Missions & contracts'],
  ['people', 'People'], ['factions', 'Factions'], ['professions', 'Work & service'],
  ['log', 'Voyage log'], ['lore', 'Archive'],
].map(Object.freeze));

export function createNotebookNavigation(section, onSelect, { document: doc = globalThis.document } = {}) {
  const nav = doc.createElement('nav');
  nav.className = 'notebook-nav'; nav.setAttribute('aria-label', 'Notebook sections');
  for (const [key, label] of NOTEBOOK_SECTIONS) {
    const button = doc.createElement('button');
    button.type = 'button'; button.textContent = label; button.dataset.notebookSection = key;
    if (key === section) { button.className = 'active'; button.setAttribute('aria-current', 'page'); }
    button.onclick = () => onSelect(key); nav.append(button);
  }
  return nav;
}
