import {normalizeWorkspace} from './model.mjs';

const INVITE_SESSION_KEY = 'dfe.dayboard.pending-invite.v1';
const copy = value => structuredClone(value);
const countLabel = (count, label) => `${count} ${label}${count === 1 ? '' : 's'}`;

/** An explicit selection, with only its dependencies; the source is never mutated. */
export function preparePersonalCopy(source, areaIds) {
  const workspace = normalizeWorkspace(source);
  const selected = new Set(areaIds);
  if (!selected.size || [...selected].some(id => !workspace.areas.some(area => area.id === id))) throw new TypeError('Choose at least one existing Area to copy.');
  const projects = workspace.projects.filter(project => selected.has(project.area)).map(project => ({...copy(project), starter: false}));
  const projectAreas = new Map(projects.map(project => [project.id, project.area]));
  const tasks = workspace.tasks.filter(task => selected.has(task.area)).map(task => ({...copy(task), today: false, starter: false}));
  const taskIds = new Set(tasks.map(task => task.id));
  for (const task of tasks) {
    // Old personal backups can contain cross-Area project links. Never expand
    // a reviewed selection to pull that project's private context into a team.
    if (task.projectId && projectAreas.get(task.projectId) !== task.area) task.projectId = '';
    if (task.repeatNextId && (!taskIds.has(task.repeatNextId) || task.repeatNextId === task.id)) task.repeatNextId = '';
  }
  return normalizeWorkspace({
    schemaVersion: 2, revision: 0, updatedAt: new Date().toISOString(), tasks,
    projects,
    areas: workspace.areas.filter(area => selected.has(area.id)).map(copy), settings: {},
  });
}

/** Workspace/account controls. Personal content leaves its store only after a reviewed copy. */
export function createTeamsUI({service, localStore, getStore, onWorkspaceChange, onBeforeSwitch, openUtility, notify, esc, icon}) {
  let disposed = false, initialized = false, ready = false, busy = false, settling = false, deferredAuthRefresh = false;
  let mode = '', generation = 0, pendingInvite = '', latestInvite = null;
  let copySource = null, copyDraft = null, copyAreaIds = [], copyDestination = null;
  let invitations = [], confirmation = null, unsubscribeAuth = null;
  const dialog = () => document.querySelector('#utility-dialog');
  const q = selector => dialog()?.querySelector(selector);
  const isOurs = () => Boolean(dialog()?.open && q('[data-teams-content]'));
  const userLabel = user => user?.email || 'Signed-in account';
  const shared = () => getStore()?.kind === 'shared' ? getStore() : null;
  const isOwner = store => store?.workspace?.role === 'owner';
  const action = (name, label, className = 'button', extra = '') => `<button type="button" class="${className}" data-team-action="${name}" ${extra}>${label}</button>`;
  const done = () => `<span class="spacer"></span>${action('close', 'Done', 'button primary')}`;
  const localButton = () => `<button type="button" class="team-workspace-row ${shared() ? '' : 'is-current'}" data-team-action="personal"><span class="team-row-copy"><strong>Personal</strong><small>This browser · only your local board</small></span>${shared() ? '<span class="team-row-action">Open</span>' : '<span class="team-current">Current</span>'}</button>`;
  const formatDate = value => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'});
  };

  function rememberInvite(token) {
    pendingInvite = token;
    try {
      if (token) window.sessionStorage.setItem(INVITE_SESSION_KEY, token);
      else window.sessionStorage.removeItem(INVITE_SESSION_KEY);
    } catch { /* The open page can still hold an invitation when session storage is unavailable. */ }
  }

  function captureInvite() {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const token = params.get('invite');
    if (token && /^[A-Za-z0-9_-]{24,512}$/.test(token)) {
      rememberInvite(token);
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#board`);
      return true;
    }
    return false;
  }

  function feedback(message, error = false) {
    const target = q(error ? '#team-error' : '#team-status');
    if (!target) { if (message) notify(message, {error}); return; }
    target.hidden = !message;
    target.textContent = message;
    if (error && message) target.focus();
  }

  function show(title, body, footer = done(), nextMode = '') {
    generation += 1;
    mode = nextMode;
    openUtility(title, `<div data-teams-content><div id="team-error" class="dialog-error" role="alert" tabindex="-1" hidden></div><p id="team-status" class="team-status" role="status" hidden></p>${body}</div>`, footer);
    dialog().classList.add('teams-dialog');
    return generation;
  }

  async function mutate(work, after, pendingText = 'Saving…') {
    if (busy || settling || disposed) return;
    busy = true;
    const stamp = generation, userId = service.user?.id || null;
    const current = () => !disposed && stamp === generation && isOurs() && (service.user?.id || null) === userId;
    const panel = dialog(), controls = [...(panel?.querySelectorAll('button,input,select,textarea') || [])];
    const disabled = controls.map(control => control.disabled);
    for (const control of controls) control.disabled = true;
    panel?.setAttribute('aria-busy', 'true');
    feedback(''); feedback('', true); feedback(pendingText);
    let result, success = false;
    try { result = await work(); success = true; }
    catch (error) {
      if (current()) {
        feedback(''); feedback(error?.message || 'This change could not be saved. Your form is still here.', true);
        if (shared()?.hasPending && q('#team-error')) {
          const retry = document.createElement('button');
          retry.type = 'button'; retry.className = 'button small team-retry'; retry.dataset.action = 'retry-pending'; retry.textContent = 'Retry original save';
          q('#team-error').append(retry);
        }
      }
    }
    finally {
      busy = false;
      settling = true;
    }
    try {
      if (success && current()) {
        feedback('');
        await after?.(result);
      } else if (success && result?.kind === 'shared' && result !== getStore()) {
        result.dispose?.('The account or workspace panel changed before this board could be opened.');
      }
    } catch (error) {
      if (current()) feedback(error?.message || 'The board could not be opened. Try opening it again.', true);
    } finally {
      controls.forEach((control, index) => { control.disabled = disabled[index]; });
      panel?.removeAttribute('aria-busy');
      settling = false;
      if (deferredAuthRefresh && !disposed) {
        deferredAuthRefresh = false;
        if (pendingInvite && service.user) void reviewInvite();
        else if (isOurs() && mode === 'workspaces') void open();
      }
    }
  }

  async function maySwitch() {
    if (busy || settling) return false;
    if (await onBeforeSwitch?.() === false) {
      feedback('Finish or close the current edit before changing workspaces.', true);
      return false;
    }
    return true;
  }

  function refresh() {
    if (disposed) return;
    const store = shared();
    const button = document.querySelector('#workspace-switcher');
    if (button) {
      const name = store?.workspace?.name || 'Personal';
      const nameLabel = button.querySelector('#workspace-name'), kindLabel = button.querySelector('#workspace-kind');
      if (nameLabel) nameLabel.textContent = name;
      if (kindLabel) kindLabel.textContent = store ? 'Shared workspace' : 'This browser';
      button.setAttribute('aria-label', `Workspaces: ${name}${store ? ', shared' : ', this browser'}`);
      button.title = name;
      button.dataset.shared = store ? 'true' : 'false';
    }
    const brand = document.querySelector('.brand-sub');
    if (brand) brand.textContent = store ? 'TEAM WORKSPACE' : 'PERSONAL WORKSPACE';
    const scope = document.querySelector('#workspace-scope');
    if (scope) {
      scope.textContent = store ? `${store.workspace.name} · shared` : 'Personal · this browser';
      scope.title = store ? `Shared workspace: ${store.workspace.name}` : 'Your personal board in this browser';
      scope.dataset.shared = store ? 'true' : 'false';
    }
  }

  async function open() {
    if (busy || disposed) return;
    if (!isOurs() && !await maySwitch()) return;
    latestInvite = null;
    const store = shared();
    let body = `<p class="team-intro">Choose where you want to work.</p><div class="team-workspace-list">${localButton()}</div>`;
    if (!service.configured) {
      body += '<div class="team-note"><strong>Shared workspaces are not available on this build yet.</strong><p>Your personal board remains available in this browser.</p></div>';
      show('Workspaces', body, done(), 'workspaces');
      return;
    }
    if (!service.user) {
      body += `<section class="team-section"><h3>${pendingInvite ? 'Sign in to review your invitation' : 'Sign in for shared workspaces'}</h3><p>${pendingInvite ? 'Use the email address the invitation was sent to. You will review the workspace before joining.' : 'Your personal board stays separate. Creating an account does not upload it.'}</p><form id="team-signin-form"><div class="field"><label class="field-label" for="team-email">Email address</label><input id="team-email" name="email" type="email" maxlength="254" autocomplete="email" required></div><button class="button primary" type="submit">Email me a sign-in link</button></form></section>`;
      show('Workspaces', body, pendingInvite ? `${action('cancel-invite', 'Dismiss invitation', 'button plain')}<span class="spacer"></span>${action('close', 'Done', 'button primary')}` : done(), 'workspaces');
      return;
    }
    body += `<div class="team-account"><span>Signed in as <strong>${esc(userLabel(service.user))}</strong></span>${action('signout', 'Sign out', 'button plain small')}</div><section class="team-section"><div class="team-section-heading"><h3>Shared workspaces</h3>${action('create', `${icon('plus')} Create workspace`, 'button small')}</div><div id="team-workspace-list" class="team-workspace-list" aria-live="polite"><p class="team-loading">Loading your workspaces…</p></div></section>`;
    if (store) body += `<div class="team-current-tools">${action('members', 'Members & invitations')}${action('copy', 'Copy from personal board')}</div>`;
    if (pendingInvite) body += `<div class="team-note"><p>You have an invitation to review.</p>${action('review-invite', 'Review invitation', 'button primary')}</div>`;
    const stamp = show('Workspaces', body, done(), 'workspaces');
    try {
      const workspaces = await service.listWorkspaces();
      if (disposed || stamp !== generation || !isOurs() || mode !== 'workspaces') return;
      const list = q('#team-workspace-list');
      if (!list) return;
      list.innerHTML = workspaces.length ? workspaces.map(workspace => `<button type="button" class="team-workspace-row ${workspace.id === shared()?.workspace.id ? 'is-current' : ''}" data-team-action="select" data-workspace-id="${esc(workspace.id)}"><span class="team-row-copy"><strong>${esc(workspace.name)}</strong><small>${countLabel(workspace.memberCount || 1, 'member')} · ${workspace.role === 'owner' ? 'Owner' : 'Member'}</small></span>${workspace.id === shared()?.workspace.id ? '<span class="team-current">Current</span>' : '<span class="team-row-action">Open</span>'}</button>`).join('') : '<p class="team-empty">You have no shared workspaces yet. Create one or accept an invitation.</p>';
    } catch (error) {
      if (stamp === generation && isOurs()) {
        const list = q('#team-workspace-list'); if (list) list.innerHTML = action('workspaces', 'Try loading workspaces again');
        feedback(error?.message || 'Your shared workspaces could not be loaded.', true);
      }
    }
  }

  function openCreate() {
    if (!service.user) return open();
    show('Create a shared workspace', `<p class="team-intro">Start an empty board for a team. You can invite people and choose personal work to copy into it afterwards.</p><form id="team-create-form"><div class="field"><label class="field-label" for="team-name">Workspace name</label><input id="team-name" name="name" maxlength="80" required autocomplete="off" placeholder="For example, DFE team"></div></form>`, `${action('workspaces', 'Cancel')}<span class="spacer"></span><button class="button primary" type="submit" form="team-create-form">Create workspace</button>`, 'create');
    q('#team-name')?.focus();
  }

  async function activate(store, message = '') {
    await onWorkspaceChange(store);
    refresh();
    document.body.classList.remove('sidebar-open');
    document.querySelector('.mobile-menu')?.setAttribute('aria-expanded', 'false');
    if (message) notify(message);
  }

  async function selectWorkspace(id) {
    if (!await maySwitch()) return;
    if (shared()?.workspace.id === id) { dialog().close(); return; }
    await mutate(() => service.openWorkspace(id), async store => { await activate(store); dialog().close(); }, 'Opening workspace…');
  }

  function inviteLinkPanel() {
    if (!latestInvite || latestInvite.workspaceId !== shared()?.workspace.id) return '';
    return `<div class="team-invite-result"><strong>Invitation ready for ${esc(latestInvite.email)}</strong><p>Share this link with that person. It grants access after they sign in with the invited address. Expires ${esc(formatDate(latestInvite.expiresAt))}.</p><label class="field-label" for="team-invite-link">Invitation link</label><div class="team-link-control"><input id="team-invite-link" type="text" readonly value="${esc(latestInvite.url)}" autocomplete="off" spellcheck="false">${action('copy-link', 'Copy link')}</div></div>`;
  }

  async function openMembers(message = '') {
    const store = shared(); if (!store) return open();
    const owner = isOwner(store), members = store.members || [];
    let body = `<p class="team-intro"><strong>${esc(store.workspace.name)}</strong> · ${countLabel(members.length, 'member')}</p><p>Members can read and edit the tasks, projects, and Areas in this workspace. Today selections and display choices belong to each person.</p><div class="team-member-list">${members.map(member => `<div class="team-member-row"><div class="team-row-copy"><strong>${esc(member.displayName || member.email)}</strong>${member.displayName && member.displayName !== member.email ? `<small>${esc(member.email)}</small>` : ''}<small>${member.role === 'owner' ? 'Owner' : 'Member'}${member.userId === service.user?.id ? ' · You' : ''}</small></div>${owner && member.role !== 'owner' ? action('remove-member', 'Remove', 'button plain small', `data-member-id="${esc(member.userId)}" aria-label="Remove ${esc(member.displayName || member.email)} from workspace"`) : ''}</div>`).join('')}</div>`;
    if (owner) body += `<section class="team-section"><h3>Invite a member</h3><p>An invitation is for one email address. You choose how to share its link.</p><form id="team-invite-form" data-workspace-id="${esc(store.workspace.id)}"><div class="field"><label class="field-label" for="team-invite-email">Their email address</label><input id="team-invite-email" name="email" type="email" maxlength="254" required autocomplete="off"></div><button class="button primary" type="submit">Create invitation link</button></form>${inviteLinkPanel()}</section><section class="team-section"><h3>Pending invitations</h3><div id="team-pending-invites" aria-live="polite"><p class="team-loading">Loading invitations…</p></div></section>`;
    const stamp = show('Members & invitations', body, `${action('workspaces', 'Workspaces', 'button plain')}<span class="spacer"></span>${action('close', 'Done', 'button primary')}`, 'members');
    if (message) feedback(message);
    if (!owner) return;
    try {
      const result = await service.invitations(store.workspace.id);
      if (disposed || stamp !== generation || !isOurs() || shared()?.workspace.id !== store.workspace.id) return;
      invitations = Array.isArray(result) ? result : result?.invitations || [];
      const target = q('#team-pending-invites');
      if (target) target.innerHTML = invitations.length ? `<div class="team-member-list">${invitations.map(invite => `<div class="team-member-row"><div class="team-row-copy"><strong>${esc(invite.email)}</strong><small>Expires ${esc(formatDate(invite.expiresAt))}</small></div>${action('revoke-invite', 'Revoke', 'button plain small', `data-invitation-id="${esc(invite.id)}" aria-label="Revoke invitation for ${esc(invite.email)}"`)}</div>`).join('')}</div>` : '<p class="team-empty">No pending invitations.</p>';
    } catch (error) {
      if (stamp === generation && isOurs()) { const target = q('#team-pending-invites'); if (target) target.textContent = 'Invitations could not be loaded.'; feedback(error?.message || 'Try opening this panel again.', true); }
    }
  }

  async function reviewInvite() {
    if (busy || settling || disposed) return;
    if (!pendingInvite) return open();
    if (!service.configured || !service.user) return open();
    if (!isOurs() && !await maySwitch()) return;
    const stamp = show('Review invitation', '<p class="team-loading">Checking the invitation for your account…</p>', `${action('cancel-invite', 'Cancel')}<span class="spacer"></span>`, 'invitation-loading');
    try {
      const preview = await service.previewInvite(pendingInvite);
      if (disposed || stamp !== generation || !isOurs()) return;
      show('Join a shared workspace', `<p class="team-intro">You have been invited to <strong>${esc(preview.workspaceName)}</strong>.</p><dl class="team-invitation-details"><div><dt>Joining as</dt><dd>${esc(preview.email)}</dd></div><div><dt>Invitation expires</dt><dd>${esc(formatDate(preview.expiresAt))}</dd></div></dl><p>You will be able to see and edit the shared board. Your personal board stays separate; joining does not copy it into this workspace.</p>`, `${action('cancel-invite', 'Cancel')}<span class="spacer"></span>${action('accept-invite', preview.alreadyJoined ? 'Open workspace' : 'Join workspace', 'button primary')}`, 'invitation');
    } catch (error) {
      if (stamp === generation && isOurs()) {
        show('Invitation could not be opened', `<p>${esc(error?.message || 'The invitation may have expired or been revoked.')}</p><p>You are signed in as <strong>${esc(userLabel(service.user))}</strong>. The invited email address must match.</p>`, `${action('cancel-invite', 'Dismiss invitation', 'button plain')}<span class="spacer"></span>${action('workspaces', 'Workspaces', 'button primary')}`, 'invitation-error');
      }
    }
  }

  function openCopy(selected = []) {
    const store = shared(); if (!store) return open();
    copySource = normalizeWorkspace(JSON.parse(localStore.exportJSON()));
    copyDraft = null;
    copyDestination = {id: store.workspace.id, name: store.workspace.name};
    copyAreaIds = selected.filter(id => copySource.areas.some(area => area.id === id));
    const areas = copySource.areas.map(area => {
      const tasks = copySource.tasks.filter(task => task.area === area.id).length;
      const projects = copySource.projects.filter(project => project.area === area.id).length;
      return `<label class="team-copy-area"><input type="checkbox" name="areas" value="${esc(area.id)}" ${copyAreaIds.includes(area.id) ? 'checked' : ''}><span class="area-dot" data-color="${esc(area.color)}" aria-hidden="true"></span><span class="team-row-copy"><strong>${esc(area.name)}</strong><small>${countLabel(tasks, 'task')} · ${countLabel(projects, 'project')}</small></span></label>`;
    }).join('');
    show('Copy personal work to a team', `<p class="team-intro">Choose Areas from your personal board to copy into <strong>${esc(store.workspace.name)}</strong>.</p><p>The copy includes tasks, notes, checklists, projects, and links from those Areas, including completed and archived work. Every member of this workspace will be able to read it.</p><form id="team-copy-form"><fieldset class="team-copy-areas"><legend class="field-label">Areas to copy</legend>${areas}</fieldset><p id="team-copy-count" class="team-copy-count" role="status"></p></form><p class="field-hint">Your personal originals stay in this browser. The team receives independent copies. Personal Today selections and display choices stay personal.</p>`, `${action('workspaces', 'Cancel')}<span class="spacer"></span><button id="team-review-copy" class="button primary" type="submit" form="team-copy-form" ${copyAreaIds.length ? '' : 'disabled'}>Review copy</button>`, 'copy');
    updateCopyCount();
  }

  function updateCopyCount() {
    if (!copySource) return;
    copyAreaIds = [...(q('#team-copy-form')?.querySelectorAll('input[name="areas"]:checked') || [])].map(input => input.value);
    const selected = new Set(copyAreaIds);
    const tasks = copySource.tasks.filter(task => selected.has(task.area)).length;
    const projects = copySource.projects.filter(project => selected.has(project.area)).length;
    const count = q('#team-copy-count');
    if (count) count.textContent = selected.size ? `${countLabel(selected.size, 'Area')} selected · ${countLabel(tasks, 'task')} · ${countLabel(projects, 'project')}` : 'Nothing selected. Choose only the work you want this team to see.';
    const button = q('#team-review-copy'); if (button) button.disabled = !selected.size;
  }

  function reviewCopy() {
    const store = shared();
    if (!store || !copySource || store.workspace.id !== copyDestination?.id) throw new Error('The destination changed. Choose the work to copy again.');
    updateCopyCount();
    const selected = new Set(copyAreaIds);
    if (!selected.size) return;
    copyDraft = preparePersonalCopy(copySource, [...selected]);
    show('Review what you are sharing', `<p class="team-intro">Copy this work into <strong>${esc(copyDestination.name)}</strong>?</p><div class="team-copy-summary"><strong>${countLabel(copyDraft.tasks.length, 'task')} · ${countLabel(copyDraft.projects.length, 'project')} · ${countLabel(copyDraft.areas.length, 'Area')}</strong><p>${copyDraft.areas.map(area => esc(area.name)).join(' · ')}</p></div>${copyDraft.tasks.length ? `<ul class="team-copy-titles">${copyDraft.tasks.slice(0, 6).map(task => `<li>${esc(task.title)}</li>`).join('')}${copyDraft.tasks.length > 6 ? `<li class="muted">And ${copyDraft.tasks.length - 6} more tasks in the selected Areas.</li>` : ''}</ul>` : ''}<p>Members of <strong>${esc(copyDestination.name)}</strong> will be able to read the copied notes, checklists, project context, and links as well as the task titles.</p><p class="field-hint">This creates independent team copies. Your personal board remains in this browser.</p>`, `${action('copy-back', 'Back')}<span class="spacer"></span>${action('confirm-copy', 'Copy to shared workspace', 'button primary')}`, 'copy-review');
  }

  function confirmMemberRemoval(id) {
    const store = shared(), member = store?.members?.find(item => item.userId === id);
    if (!store || !isOwner(store) || !member || member.role === 'owner') return;
    confirmation = {kind: 'remove-member', workspaceId: store.workspace.id, id};
    show('Remove workspace member?', `<p>Remove <strong>${esc(member.displayName || member.email)}</strong> from <strong>${esc(store.workspace.name)}</strong>?</p><p>They will lose access to this shared workspace. Existing tasks remain on the board and tasks assigned to them become unassigned.</p>`, `${action('members', 'Cancel')}<span class="spacer"></span>${action('confirm-member-change', 'Remove member', 'button danger')}`, 'confirm-member');
  }

  function confirmRevoke(id) {
    const store = shared(), invite = invitations.find(item => item.id === id);
    if (!store || !isOwner(store) || !invite) return;
    confirmation = {kind: 'revoke-invite', workspaceId: store.workspace.id, id};
    show('Revoke invitation?', `<p>Revoke the invitation for <strong>${esc(invite.email)}</strong> to join <strong>${esc(store.workspace.name)}</strong>?</p><p>The invitation link will stop working. You can create a new invitation later.</p>`, `${action('members', 'Cancel')}<span class="spacer"></span>${action('confirm-member-change', 'Revoke invitation', 'button danger')}`, 'confirm-member');
  }

  async function onClick(event) {
    const button = event.target?.closest?.('[data-team-action]');
    if (!button || disposed) return;
    event.preventDefault();
    if (busy || settling) return;
    const name = button.dataset.teamAction;
    try {
      if (name === 'workspaces') await open();
      else if (name === 'close') dialog()?.close();
      else if (name === 'create') openCreate();
      else if (name === 'select') await selectWorkspace(button.dataset.workspaceId);
      else if (name === 'personal') { if (await maySwitch()) { await activate(localStore); dialog()?.close(); } }
      else if (name === 'signout') {
        if (!await maySwitch()) return;
        await mutate(async () => { await activate(localStore); latestInvite = null; rememberInvite(''); await service.signOut(); }, () => open(), 'Signing out…');
      }
      else if (name === 'members') await openMembers();
      else if (name === 'refresh-members') {
        const store = shared(); if (!store) return open();
        await mutate(() => store.reload(), () => openMembers(), 'Refreshing workspace…');
      }
      else if (name === 'copy') openCopy();
      else if (name === 'copy-back') openCopy(copyAreaIds);
      else if (name === 'review-invite') await reviewInvite();
      else if (name === 'cancel-invite') { rememberInvite(''); await open(); }
      else if (name === 'accept-invite') {
        if (!await maySwitch() || !pendingInvite) return;
        await mutate(() => service.acceptInvite(pendingInvite), async store => { rememberInvite(''); await activate(store, 'Shared workspace opened.'); dialog()?.close(); }, 'Joining workspace…');
      }
      else if (name === 'confirm-copy') {
        const store = shared();
        if (!store || !copyDraft || copyDestination?.id !== store.workspace.id) throw new Error('The destination changed. Choose the work to copy again.');
        const document = JSON.stringify(copyDraft), taskCount = copyDraft.tasks.length;
        await mutate(() => store.importJSON(document, {mode: 'merge'}), async () => { copyDraft = null; copySource = null; await open(); feedback(`${countLabel(taskCount, 'task')} copied into the shared workspace. Your personal originals are still in this browser.`); }, 'Copying selected work…');
      }
      else if (name === 'remove-member') confirmMemberRemoval(button.dataset.memberId);
      else if (name === 'revoke-invite') confirmRevoke(button.dataset.invitationId);
      else if (name === 'confirm-member-change') {
        const request = confirmation, store = shared();
        if (!request || !store || request.workspaceId !== store.workspace.id) throw new Error('The workspace changed. Open its member list again.');
        await mutate(async () => {
          if (request.kind === 'remove-member') {
            await service.removeMember(request.workspaceId, request.id);
            try { await store.reload(); }
            catch (error) { return {refreshError: error?.message || 'The updated workspace could not be loaded.'}; }
          }
          else { await service.revokeInvite(request.workspaceId, request.id); if (latestInvite?.id === request.id) latestInvite = null; }
        }, result => {
          confirmation = null;
          if (result?.refreshError) {
            show('Member removed', `<p>The member no longer has access. Existing tasks remain, and their assignments have been cleared.</p><p>The board could not refresh afterwards, so the visible copy may be out of date.</p><p class="dialog-error" role="alert">${esc(result.refreshError)}</p>`, `${action('refresh-members', 'Refresh workspace')}<span class="spacer"></span>${action('close', 'Done', 'button primary')}`, 'member-removed');
            return;
          }
          return openMembers(request.kind === 'remove-member' ? 'Member removed. Existing tasks remain on the board.' : 'Invitation revoked.');
        });
      }
      else if (name === 'copy-link' && latestInvite?.workspaceId === shared()?.workspace.id) {
        try { await navigator.clipboard.writeText(latestInvite.url); feedback('Invitation link copied. Share it with the invited person.'); }
        catch { const field = q('#team-invite-link'); field?.focus(); field?.select(); feedback('The link is selected. Copy it using your browser or keyboard.'); }
      }
    } catch (error) { feedback(error?.message || 'This action could not be completed.', true); }
  }

  async function onSubmit(event) {
    const form = event.target;
    if (!['team-signin-form', 'team-create-form', 'team-invite-form', 'team-copy-form'].includes(form?.id)) return;
    event.preventDefault();
    if (busy || settling || disposed || !form.reportValidity()) return;
    const data = new FormData(form);
    if (form.id === 'team-signin-form') {
      const email = String(data.get('email') || '').trim();
      await mutate(() => service.requestSignIn(email), () => {
        feedback(`Check ${email} for a sign-in link. Your personal board remains here.`);
        const submit = form.querySelector('button[type="submit"]'); if (submit) submit.textContent = 'Send another sign-in link';
      }, 'Requesting sign-in link…');
    } else if (form.id === 'team-create-form') {
      if (!await maySwitch()) return;
      const name = String(data.get('name') || '').trim();
      if (!name) { feedback('Give the workspace a name.', true); return; }
      await mutate(() => service.createWorkspace(name), async store => {
        await activate(store);
        show('Workspace created', `<p class="team-intro"><strong>${esc(store.workspace.name)}</strong> is ready. It starts empty, and only you have access.</p><p>Invite a member to collaborate, or choose work from your personal board to copy into this workspace.</p><div class="team-current-tools">${action('members', 'Invite a member', 'button primary')}${action('copy', 'Copy from personal board')}</div>`, done(), 'created');
      }, 'Creating workspace…');
    } else if (form.id === 'team-invite-form') {
      const store = shared();
      if (!store || store.workspace.id !== form.dataset.workspaceId || !isOwner(store)) { feedback('Open the current workspace’s member list to invite someone.', true); return; }
      const email = String(data.get('email') || '').trim();
      await mutate(() => service.invite(store.workspace.id, email), async invite => {
        const url = new URL(window.location.pathname, window.location.origin);
        url.hash = `invite=${encodeURIComponent(invite.token)}`;
        latestInvite = {...invite, workspaceId: store.workspace.id, url: url.href};
        await openMembers('Invitation created. Copy its link below.');
      }, 'Creating invitation…');
    } else {
      try { reviewCopy(); } catch (error) { feedback(error?.message || 'This selection could not be prepared.', true); }
    }
  }

  function onChange(event) { if (event.target?.matches?.('#team-copy-form input[name="areas"]')) updateCopyCount(); }
  function onCancel(event) { if ((busy || settling) && isOurs()) event.preventDefault(); }
  function onClose() {
    // A native close event can arrive after another dialog has already opened.
    if (dialog()?.open) return;
    generation += 1; mode = ''; latestInvite = null; copySource = null; copyDraft = null; confirmation = null;
    if (q('[data-teams-content]')) dialog().innerHTML = '';
  }
  function guardClose(event) {
    if ((busy || settling) && isOurs() && event.target?.closest?.('[data-action="close-utility"]')) { event.preventDefault(); event.stopImmediatePropagation(); }
  }
  function onHashChange() { if (captureInvite() && ready) void reviewInvite(); }

  async function init() {
    if (initialized || disposed) return;
    initialized = true;
    try { const token = window.sessionStorage.getItem(INVITE_SESSION_KEY); if (token && /^[A-Za-z0-9_-]{24,512}$/.test(token)) pendingInvite = token; } catch { /* Optional resumption only. */ }
    captureInvite();
    document.addEventListener('click', guardClose, true);
    document.addEventListener('click', onClick);
    document.addEventListener('submit', onSubmit);
    document.addEventListener('change', onChange);
    dialog()?.addEventListener('cancel', onCancel);
    dialog()?.addEventListener('close', onClose);
    window.addEventListener('hashchange', onHashChange);
    unsubscribeAuth = service.onAuthChange(({user, previousUserId}) => {
      if (disposed) return;
      const identityChanged = previousUserId !== (user?.id || null);
      const wasWorkspaceChooser = isOurs() && mode === 'workspaces';
      if (previousUserId && identityChanged) {
        generation += 1;
        latestInvite = null; invitations = []; confirmation = null; copySource = null; copyDraft = null; copyAreaIds = []; copyDestination = null;
        rememberInvite('');
        if (q('[data-teams-content]')) { dialog().close(); dialog().innerHTML = ''; mode = ''; }
      }
      refresh();
      if (!ready) return;
      if (busy || settling) { deferredAuthRefresh ||= identityChanged; return; }
      if (pendingInvite && user && identityChanged) void reviewInvite();
      else if (wasWorkspaceChooser || (isOurs() && mode === 'workspaces')) void open();
    });
    try {
      await service.init();
      ready = true;
      refresh();
      if (pendingInvite) await reviewInvite();
    } catch (error) { ready = true; refresh(); notify(error?.message || 'Shared workspaces could not be connected. Your personal board is still available.', {error: true}); }
  }

  function dispose() {
    disposed = true; generation += 1;
    latestInvite = null; copyDraft = null; copySource = null; invitations = [];
    unsubscribeAuth?.();
    document.removeEventListener('click', guardClose, true);
    document.removeEventListener('click', onClick);
    document.removeEventListener('submit', onSubmit);
    document.removeEventListener('change', onChange);
    dialog()?.removeEventListener('cancel', onCancel);
    dialog()?.removeEventListener('close', onClose);
    window.removeEventListener('hashchange', onHashChange);
  }

  return {init, open, refresh, dispose};
}
