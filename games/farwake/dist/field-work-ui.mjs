/** Optional field notebook and object controls; no persistent HUD panel. */
import { escapeHtml as esc } from './ui.mjs';

export function createFieldWorkUI({ getGame, dialog, invoke, acceptResult, track, refreshWorld = () => {} }) {
  let opened = null, busy = false, lastKey = '';
  const identity = () => { const game = getGame(); return { game, id: game.state.multiplayer?.captainId || game.playerId || game.state.seed }; };
  const same = owner => owner.game === getGame() && owner.id === identity().id;
  const status = objectId => getGame().fieldWorkStatus?.(objectId) || { title: 'Field work', objective: 'Field work is unavailable here.', careers: [], tools: [], assignments: [], actions: [] };
  const key = view => { const copy = { ...view }; if (view.object) { const { x, y, ...stable } = view.object; copy.object = stable; } return JSON.stringify(copy); };
  const argsFor = action => ({ action: action.action, ...(action.assignmentId ? { assignmentId: action.assignmentId } : {}), ...(action.objectId ? { objectId: action.objectId } : {}) });
  const matches = (one, two) => one.action === two.action && one.assignmentId === two.assignmentId && one.objectId === two.objectId;
  const remember = (kind, objectId, view) => { opened = { kind, objectId, owner: identity(), revision: dialog.revision }; lastKey = key(view); };
  const guarded = callback => { const owner = identity(), revision = dialog.revision; return () => { if (same(owner) && dialog.opened && dialog.revision === revision) return callback(); }; };
  const mark = target => { if (!target) return; dialog.close(); track(target); };
  async function act(selected) {
    if (busy || !opened || !same(opened.owner) || !dialog.opened || opened.revision !== dialog.revision) return;
    const view = status(opened.objectId), fresh = [...(view.object?.actions || []), ...(view.actions || []), ...(view.assignments || []).map(value => value.action)].find(action => matches(action, selected));
    if (!fresh || fresh.available === false) { render(opened.kind, opened.objectId); return; }
    const owner = identity(), revision = dialog.revision, context = { kind: opened.kind, objectId: opened.objectId };
    busy = true;
    try {
      const answer = await invoke('fieldWorkAction', argsFor(fresh));
      if (!same(owner)) return;
      if (!acceptResult(answer)) return;
      refreshWorld();
      if (!dialog.opened || revision !== dialog.revision) return;
      render(context.kind, context.objectId);
    } finally { busy = false; }
  }
  const actionChoice = action => ({ label: action.label, detail: action.reason || action.detail || undefined, disabled: action.available === false, action: guarded(() => act(action)) });
  function progress(view) {
    if (!view.active) return '';
    return `<div class="duty-current"><span>YOUR FIELD ASSIGNMENT</span><strong>${esc(view.active.title)}</strong><p>${esc(view.objective)}</p>${view.active.next?.detail ? `<p class="mini">${esc(view.active.next.detail)}</p>` : ''}</div><ol class="duty-checklist">${view.active.steps.map(item => `<li class="${item.done ? 'done' : ''}"><span aria-hidden="true">${item.done ? '✓' : '·'}</span>${esc(item.label)}</li>`).join('')}</ol>`;
  }
  function render(kind = 'overview', objectId = null) {
    const view = status(objectId), object = view.object;
    dialog.open(kind === 'object' ? object?.name || 'Field object' : 'Field work', 'field-work', { eyebrow: view.siteName || 'EXPEDITIONS / YOUR NOTEBOOK' });
    let html = kind === 'object' ? `<p>${esc(object?.text || object?.reason || 'Reach the marked field object.')}</p>` : `<p>${esc(view.active ? 'Your qualifications and pay follow your own verified work.' : view.objective)}</p>`;
    html += progress(view);
    if (kind === 'overview') {
      html += `<div class="guide-card"><h3>Your field tools</h3>${view.tools.map(tool => `<p><strong>${esc(tool.name)}</strong> · ${tool.owned ? 'In your kit' : 'Collect at the Floodworks workshop'}<br><span class="mini">${esc(tool.description)}</span></p>`).join('')}<p class="mini">Each captain collects their own tools. A friend opening a passage does not issue equipment to everyone.</p></div>`;
      html += view.careers.map(career => `<section class="entry-card"><h3>${esc(career.name)}</h3><p>${esc(career.rank)} · ${career.completed} / ${career.total} assignments</p>${career.next ? `<p><strong>${esc(career.next.title)}</strong><br>${esc(career.next.summary)}</p><p class="mini">${career.next.reward} CR on your own completed debrief.</p>` : '<p>All posted qualifications completed.</p>'}</section>`).join('');
      html += '<p class="mini">Shared routes and rescued people stay changed. Your inspections, repairs, care and debriefs are recorded personally. A completed rescue can still offer an honest follow-up care assignment.</p>';
    }
    dialog.html(html);
    const choices = [];
    if (kind === 'object') choices.push(...(object?.actions || []).map(actionChoice));
    const relevant = (view.actions || []).filter(action => action.action !== 'cancel' && (kind !== 'object' || action.available !== false));
    choices.push(...relevant.map(actionChoice));
    if (view.active?.target) choices.push({ label: 'Mark my next field task', detail: view.active.next?.label || 'Report at a field workshop or aid point.', action: guarded(() => mark(view.active.target)) });
    if (kind === 'overview' && !view.inFieldSite && !view.active) choices.push({ label: 'Find Floodworks 6', detail: 'Orchard Nine · Brindle', action: guarded(() => mark(view.target)) });
    if (kind === 'overview') for (const tool of view.tools.filter(value => !value.owned)) choices.push({ label: `Find ${tool.name.toLowerCase()}`, action: guarded(() => mark(tool.target)) });
    if (kind === 'object') choices.push({ label: 'Field notebook', action: guarded(() => render('overview')) });
    else {
      const cancel = view.actions?.find(action => action.action === 'cancel');
      if (cancel) choices.push(actionChoice(cancel));
    }
    choices.push({ label: kind === 'object' ? 'Back to the site' : 'Close notebook', action: guarded(() => dialog.close()) });
    dialog.choices(choices); remember(kind, objectId, view);
  }
  function openObject(entity) { const rawId = typeof entity === 'string' ? entity : entity?.data?.fieldObjectId || entity?.fieldObjectId || entity?.id; const objectId = rawId?.includes(':field:') ? rawId.split(':field:').at(-1) : rawId?.replace(/^field:/, ''); render('object', objectId); }
  function refresh() {
    if (busy || !opened || !dialog.opened || dialog.kind !== 'field-work') return false;
    if (!same(opened.owner)) { dialog.close(); opened = null; return false; }
    if (opened.revision !== dialog.revision) return false;
    const view = status(opened.objectId); if (key(view) === lastKey) return false;
    const scroll = dialog.body.scrollTop; render(opened.kind, opened.objectId); dialog.body.scrollTop = scroll; return true;
  }
  return { open: () => render('overview'), openObject, refresh };
}
