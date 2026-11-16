import {normalizeWorkspace} from './model.mjs';

const AUTH_PREFIX = 'dfe.dayboard.auth.v1.';
const PREFS_PREFIX = 'dfe.dayboard.team-preferences.v1.';
const MAX_BACKUP_LENGTH = 10 * 1024 * 1024;
const COLLECTIONS = {area: 'areas', project: 'projects', task: 'tasks', pin: 'pins'};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const clone = value => structuredClone(value);
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const recordMap = records => new Map(records.map(record => [record.id, record]));

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
  return value;
}

function identifier(value, label = 'Identifier') {
  if (typeof value !== 'string' || !value.trim() || value.length > 200 || value.includes('\0')) throw new TypeError(`${label} is invalid.`);
  return value;
}

function uuid(value, label = 'Account or workspace ID') {
  if (typeof value !== 'string' || !UUID.test(value)) throw new TypeError(`${label} is invalid.`);
  return value;
}

function newID() {
  if (!globalThis.crypto?.randomUUID) throw new Error('This browser cannot securely identify shared changes. Use a current browser on HTTPS.');
  return globalThis.crypto.randomUUID();
}

function emailAddress(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new TypeError('Enter a valid email address.');
  return email;
}

function versionMap(raw, label) {
  object(raw, label);
  const entries = Object.entries(raw).map(([id, version]) => {
    identifier(id);
    if (!Number.isSafeInteger(version) || version < 1) throw new TypeError(`${label} contains an invalid version.`);
    return [id, version];
  });
  return Object.fromEntries(entries);
}

function versionOf(versions, entity, id) {
  const collection = versions[COLLECTIONS[entity]];
  return own(collection, id) ? collection[id] : 0;
}

function taskContent(task) {
  if (!task) return null;
  // These fields are either private to a member or authoritative on the server.
  const {today, updatedAt, createdAt, number, ...content} = task;
  return content;
}

function taskPayload(task) { return {...clone(task), today: false}; }

function orderedChanges(changes) {
  const putOrder = {area: 0, project: 1, task: 2, pin: 3};
  const deleteOrder = {pin: 4, task: 5, project: 6, area: 7};
  return [...changes].sort((a, b) => (a.operation === 'delete' ? deleteOrder[a.entity] : putOrder[a.entity]) - (b.operation === 'delete' ? deleteOrder[b.entity] : putOrder[b.entity]));
}

/** Domain errors contain no tokens or raw HTTP response bodies. */
export class TeamError extends Error {
  constructor(message, {code = '', uncertain = false} = {}) {
    super(message);
    this.name = 'TeamError';
    this.code = code;
    this.uncertain = uncertain;
    this.conflict = code === '40001';
    this.accessDenied = ['42501', 'AUTH_REQUIRED', 'AUTH_CHANGED', 'PGRST301', 'PGRST303'].includes(code);
  }
}

function remoteError(error) {
  if (error instanceof TeamError) return error;
  const code = typeof error?.code === 'string' ? error.code : '';
  if (!code) return new TeamError('The connection did not confirm the request. Reconnect before trying again.', {code: 'NETWORK', uncertain: true});
  const message = typeof error.message === 'string' && error.message.length < 1000 ? error.message : 'The shared workspace could not save this change.';
  return new TeamError(message, {code});
}

async function boundedRequest(operation, {timeout, schedule, cancel}) {
  const controller = new AbortController();
  const error = new TeamError('The shared request did not respond in time. Reconnect, then retry the original request.', {code: 'TIMEOUT', uncertain: true});
  let timer;
  const deadline = new Promise((resolve, reject) => {
    timer = schedule(() => {
      reject(error);
      controller.abort();
    }, timeout);
  });
  const assertCurrent = () => { if (controller.signal.aborted) throw error; };
  try { return await Promise.race([operation(controller.signal, assertCurrent), deadline]); }
  finally { cancel(timer); }
}

function readBackup(text) {
  if (typeof text !== 'string' || text.length > MAX_BACKUP_LENGTH) throw new TypeError('Choose a valid Dayboard backup of at most 10 MB.');
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new TypeError('This file is not valid JSON. Your board has not changed.'); }
  const isTeam = parsed?.format === 'dayboard-team-backup';
  if (isTeam && parsed.version !== 1) throw new TypeError('This shared backup version is not supported.');
  const board = normalizeWorkspace(isTeam ? parsed.board : parsed);
  if (isTeam && parsed.assignments !== undefined && !Array.isArray(parsed.assignments)) throw new TypeError('The backup contains invalid task assignments.');
  const assignments = isTeam && Array.isArray(parsed.assignments) ? parsed.assignments : [];
  if (assignments.length > board.tasks.length) throw new TypeError('The backup contains invalid task assignments.');
  const tasks = new Set(board.tasks.map(task => task.id));
  const seen = new Set();
  for (const assignment of assignments) {
    object(assignment, 'Assignment');
    if (!tasks.has(assignment.taskId) || seen.has(assignment.taskId)) throw new TypeError('The backup contains an invalid or duplicate task assignment.');
    seen.add(assignment.taskId);
    if (assignment.userId != null) uuid(assignment.userId);
    if (assignment.email != null) emailAddress(assignment.email);
  }
  return {board, assignments};
}

/** Personal imports can take a work copy from either ordinary or team backups. */
export function readBoardBackup(text) { return readBackup(text).board; }

/**
 * Auth and RPC boundary. Auth data and team preferences use their own keys;
 * this module never reads or writes the browser-local personal board key.
 * onAuthChange receives {event,user,session,previousUserId} after the SDK's
 * auth callback has returned. All database authorization remains server-side.
 */
export class TeamService {
  constructor(config = {}, {storage, personalSettings = {}, client, clientFactory, storeOptions = {}, requestTimeoutMs = 15000, scheduleTimeout = setTimeout, cancelTimeout = clearTimeout} = {}) {
    this.config = {...config};
    this.configurationIssue = null;
    this.configured = false;
    if (config.enabled === true) {
      try {
        const url = new URL(config.url);
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.publishableKey || '')) throw new Error('Shared workspace configuration needs an HTTPS API URL and a publishable key.');
        this.config.url = url.origin;
        this.configured = true;
      } catch (error) { this.configurationIssue = error.message; }
    }
    try { this.storage = storage === undefined ? globalThis.localStorage : storage; } catch { this.storage = null; }
    this.personalSettings = clone(personalSettings);
    this._client = client || null;
    this._clientFactory = clientFactory || (async (url, key, options) => (await import('@supabase/supabase-js')).createClient(url, key, options));
    this._session = null;
    this._initializing = null;
    this._listeners = new Set();
    this._stores = new Set();
    this._storeOptions = storeOptions;
    this._authSubscription = null;
    this._pendingCreates = new Map();
    this._requestDeadline = {timeout: Number.isFinite(requestTimeoutMs) && requestTimeoutMs > 0 ? requestTimeoutMs : 15000, schedule: scheduleTimeout, cancel: cancelTimeout};
  }

  get session() { return this._session; }
  get user() { return this._session?.user || null; }

  _requireConfiguration() {
    if (!this.configured) throw new TeamError('Shared workspaces are not enabled on this deployment yet.', {code: 'NOT_CONFIGURED'});
  }

  _requireUser(expectedId) {
    const user = this.user;
    if (!user?.id || user.is_anonymous) throw new TeamError('Sign in with your own account to use a shared workspace.', {code: 'AUTH_REQUIRED'});
    uuid(user.id);
    if (expectedId && user.id !== expectedId) throw new TeamError('The signed-in account changed. Reopen the workspace with the original account before saving.', {code: 'AUTH_CHANGED'});
    return user.id;
  }

  _setSession(session, event) {
    const previousUserId = this.user?.id || null;
    this._session = session || null;
    if (previousUserId !== (this.user?.id || null)) {
      for (const store of [...this._stores]) store.dispose('The signed-in account changed.');
    }
    const update = {event, user: this.user, session: this._session, previousUserId};
    // Supabase serializes auth operations. User callbacks must run outside it.
    setTimeout(() => {
      for (const listener of this._listeners) {
        try { listener(update); } catch { /* A view failure must not undo an auth transition. */ }
      }
    }, 0);
  }

  async init() {
    if (!this.configured) return null;
    if (this._initializing) return this._initializing;
    this._initializing = (async () => {
      if (!this._client) {
        const storageKey = `${AUTH_PREFIX}${new URL(this.config.url).hostname}`;
        const scopedStorage = this.storage ? {
          getItem: key => key.startsWith(storageKey) ? this.storage.getItem(key) : null,
          setItem: (key, value) => { if (!key.startsWith(storageKey)) throw new Error('Invalid auth storage key.'); this.storage.setItem(key, value); },
          removeItem: key => { if (!key.startsWith(storageKey)) throw new Error('Invalid auth storage key.'); this.storage.removeItem(key); },
        } : undefined;
        this._client = await this._clientFactory(this.config.url, this.config.publishableKey, {
          auth: {storageKey, ...(scopedStorage ? {storage: scopedStorage} : {}), persistSession: Boolean(scopedStorage), autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce'},
        });
      }
      const subscription = this._client.auth.onAuthStateChange((event, session) => this._setSession(session, event));
      this._authSubscription = subscription?.data?.subscription || null;
      const {data, error} = await this._client.auth.getSession();
      if (error) throw remoteError(error);
      this._setSession(data?.session || null, 'INITIAL_SESSION');
      return this._session;
    })();
    try { return await this._initializing; }
    catch (error) { this._authSubscription?.unsubscribe(); this._authSubscription = null; this._initializing = null; throw error; }
  }

  onAuthChange(listener) { this._listeners.add(listener); return () => this._listeners.delete(listener); }

  async requestSignIn(email) {
    this._requireConfiguration();
    await this.init();
    const normalizedEmail = emailAddress(email);
    const location = globalThis.location;
    if (!location?.origin || location.origin === 'null') throw new TeamError('Open Dayboard at its published address before signing in.');
    const redirect = new URL(location.pathname, location.origin);
    const {error} = await this._client.auth.signInWithOtp({email: normalizedEmail, options: {emailRedirectTo: redirect.href, shouldCreateUser: true}});
    if (error) throw remoteError(error);
    return {email: normalizedEmail};
  }

  async signOut() {
    this._requireConfiguration();
    await this.init();
    const {error} = await this._client.auth.signOut({scope: 'local'});
    if (error) throw remoteError(error);
    this._setSession(null, 'SIGNED_OUT');
  }

  async _rpc(name, args = {}, expectedUserId) {
    this._requireConfiguration();
    await this.init();
    const userId = this._requireUser(expectedUserId);
    return await boundedRequest(async (signal, assertCurrent) => {
      const sessionResult = await this._client.auth.getSession();
      assertCurrent();
      if (sessionResult.error) throw remoteError(sessionResult.error);
      const requestSession = sessionResult.data?.session;
      if (requestSession?.user?.id !== userId || this.user?.id !== userId) throw new TeamError('The signed-in account changed before this request. Reopen the workspace with the original account.', {code: 'AUTH_CHANGED'});
      let result;
      try {
        const request = this._client.rpc(name, args);
        // Bind the request to its author. The SDK's async fetch must not choose a
        // different account's token if another tab switches accounts meanwhile.
        if (typeof request.setHeader === 'function') {
          if (typeof requestSession.access_token !== 'string' || !requestSession.access_token) throw new TeamError('Sign in again before using the shared workspace.', {code: 'AUTH_REQUIRED'});
          request.setHeader('Authorization', `Bearer ${requestSession.access_token}`);
        }
        if (typeof request.abortSignal === 'function') request.abortSignal(signal);
        result = await request;
        assertCurrent();
      } catch (error) { throw remoteError(error); }
      if (result.error) throw remoteError(result.error);
      if (this.user?.id !== userId) throw new TeamError('The signed-in account changed before the request was confirmed. Reopen it with the original account.', {code: 'AUTH_CHANGED', uncertain: name === 'dayboard_commit'});
      return result.data;
    }, this._requestDeadline);
  }

  async listWorkspaces() { return await this._rpc('dayboard_workspaces'); }

  async capabilities() {
    const value = await this._rpc('dayboard_capabilities');
    if (!value || typeof value.mayCreateWorkspace !== 'boolean' ||
        !Number.isSafeInteger(value.workspaceLimit) || value.workspaceLimit < 0 ||
        !Number.isSafeInteger(value.ownedWorkspaceCount) || value.ownedWorkspaceCount < 0 ||
        (value.mayCreateWorkspace && value.ownedWorkspaceCount >= value.workspaceLimit)) {
      throw new TeamError('Workspace permissions could not be read. Try opening Workspaces again.', {code: 'INVALID_RESPONSE'});
    }
    return Object.freeze({mayCreateWorkspace: value.mayCreateWorkspace, workspaceLimit: value.workspaceLimit, ownedWorkspaceCount: value.ownedWorkspaceCount});
  }

  _openSnapshot(snapshot) {
    const store = new SharedBoardStore(this, snapshot, this._storeOptions);
    this._stores.add(store);
    return store;
  }

  async createWorkspace(name) {
    const label = typeof name === 'string' ? name.trim() : '';
    if (!label || label.length > 80) throw new TypeError('Use a workspace name of 1–80 characters.');
    await this.init();
    const userId = this._requireUser();
    const key = `${userId}:${label}`;
    const requestId = this._pendingCreates.get(key) || newID();
    this._pendingCreates.set(key, requestId);
    try {
      const snapshot = await this._rpc('dayboard_create_workspace', {p_name: label, p_request_id: requestId}, userId);
      const store = this._openSnapshot(snapshot);
      this._pendingCreates.delete(key);
      return store;
    } catch (error) {
      if (!error.uncertain && error.code !== 'AUTH_CHANGED') this._pendingCreates.delete(key);
      throw error;
    }
  }

  async openWorkspace(workspaceId) {
    const snapshot = await this._rpc('dayboard_snapshot', {p_workspace_id: uuid(workspaceId)});
    if (snapshot?.workspace?.id !== workspaceId) throw new TypeError('The response belongs to another workspace.');
    return this._openSnapshot(snapshot);
  }

  /** Resume only an explicitly retained, in-memory copy after same-user sign-in. */
  async reopenWorkspace(previousStore) {
    if (!(previousStore instanceof SharedBoardStore) || previousStore.service !== this || !previousStore._disposed) throw new TypeError('Reopen a closed workspace from this session.');
    if (previousStore._transferred) throw new TeamError('This retained workspace has already been reopened. Use its current copy.');
    if (previousStore._reopening) throw new TeamError('This retained workspace is already being reopened.');
    previousStore._reopening = true;
    try {
      await this.init();
      this._requireUser(previousStore.userId);
      const snapshot = await this._rpc('dayboard_snapshot', {p_workspace_id: previousStore.workspace.id}, previousStore.userId);
      if (snapshot?.workspace?.id !== previousStore.workspace.id) throw new TypeError('The response belongs to another workspace.');
      const store = this._openSnapshot(snapshot);
      store._history = clone(previousStore._history);
      store._pending = previousStore._pending ? clone(previousStore._pending) : null;
      if (store.hasPending) {
        store.syncStatus = 'offline';
        store.lastError = new TeamError('The original save still needs confirmation. Retry that save before editing again.', {code: 'PENDING_SAVE', uncertain: true});
      }
      previousStore._transferred = true;
      return store;
    } finally {
      previousStore._reopening = false;
    }
  }

  async previewInvite(token) { return await this._rpc('dayboard_invitation_preview', {p_token: identifier(token, 'Invitation')}); }
  async acceptInvite(token) { return this._openSnapshot(await this._rpc('dayboard_accept_invite', {p_token: identifier(token, 'Invitation')})); }
  async invite(workspaceId, email) { return await this._rpc('dayboard_invite', {p_workspace_id: uuid(workspaceId), p_email: emailAddress(email)}); }
  async invitations(workspaceId) { return await this._rpc('dayboard_invitations', {p_workspace_id: uuid(workspaceId)}); }
  async revokeInvite(workspaceId, invitationId) { return await this._rpc('dayboard_revoke_invite', {p_workspace_id: uuid(workspaceId), p_invitation_id: uuid(invitationId)}); }
  async removeMember(workspaceId, userId) { return await this._rpc('dayboard_remove_member', {p_workspace_id: uuid(workspaceId), p_user_id: uuid(userId)}); }
}

/**
 * Per-record shared store. Each instance belongs to one signed-in account.
 * Subscribers receive (store, {type}); rendering cannot alter durable results.
 * There is no persistent shared-content cache or automatic offline write queue.
 */
export class SharedBoardStore {
  constructor(service, snapshot, {autoSubscribe = true, pollInterval = 15000} = {}) {
    this.kind = 'shared';
    this.service = service;
    this.userId = service._requireUser();
    this.storage = service.storage;
    this._listeners = new Set();
    this._history = [];
    this._saving = false;
    this._pending = null;
    this._disposed = false;
    this._readEpoch = 0;
    this._refreshPromise = null;
    this._reloadQueued = false;
    this._pollInterval = Math.max(5000, pollInterval);
    this._channel = null;
    this._pollTimer = null;
    this._reloadTimer = null;
    this.syncStatus = 'saved';
    this.updates = 'polling';
    this.loadIssue = null;
    this.lastError = null;
    const workspaceId = uuid(snapshot?.workspace?.id, 'Workspace ID');
    this.preferencesKey = `${PREFS_PREFIX}${this.userId}.${workspaceId}`;
    this._settings = clone(service.personalSettings || {});
    try {
      const raw = this.storage?.getItem(this.preferencesKey);
      if (raw !== null && raw !== undefined) this._settings = JSON.parse(raw);
      this._settings = normalizeWorkspace({...snapshot.data, settings: this._settings}).settings;
    } catch {
      this._settings = normalizeWorkspace({...snapshot.data, settings: service.personalSettings || {}}).settings;
    }
    this._applySnapshot(snapshot, {initial: true});
    if (autoSubscribe && globalThis.window?.addEventListener) this._startUpdates();
  }

  get state() { return this._state; }
  get busy() { return this._saving; }
  get hasPending() { return this._pending !== null; }
  get canUndo() { return this._history.length > 0 && !this.busy && !this.hasPending && !this._disposed; }

  _assertActive() {
    if (this._disposed) throw new TeamError(this._disposeReason || 'Reopen this shared workspace before saving.', {code: 'AUTH_CHANGED'});
    this.service._requireUser(this.userId);
  }

  _emit(type = 'state') {
    for (const listener of this._listeners) {
      try { listener(this, {type}); } catch { /* Never report a durable save as failed because rendering failed. */ }
    }
  }

  subscribe(listener) { this._listeners.add(listener); return () => this._listeners.delete(listener); }

  _applySnapshot(snapshot, {initial = false} = {}) {
    object(snapshot, 'Shared workspace');
    const workspace = object(snapshot.workspace, 'Workspace');
    uuid(workspace.id, 'Workspace ID');
    if (this.workspace && workspace.id !== this.workspace.id) throw new TypeError('The response belongs to another workspace.');
    if (typeof workspace.name !== 'string' || !workspace.name.trim() || !['owner', 'member'].includes(workspace.role)) throw new TypeError('The shared workspace details are invalid.');
    const state = normalizeWorkspace({...snapshot.data, settings: this._settings});
    if (workspace.revision !== state.revision) throw new TypeError('The shared workspace revision is inconsistent.');
    if (this.workspace && workspace.revision < this.workspace.revision) return false;
    const versions = {};
    for (const collection of Object.values(COLLECTIONS)) versions[collection] = versionMap(snapshot.versions?.[collection] || {}, `${collection} versions`);
    for (const collection of ['areas', 'projects', 'tasks']) for (const row of state[collection]) {
      if (!own(versions[collection], row.id)) throw new TypeError('A shared record is missing its version.');
    }
    if (!Array.isArray(snapshot.members)) throw new TypeError('The shared membership list is invalid.');
    const members = snapshot.members.map(member => {
      uuid(member.userId);
      if (!['owner', 'member'].includes(member.role)) throw new TypeError('The shared membership role is invalid.');
      return {userId: member.userId, email: emailAddress(member.email), displayName: typeof member.displayName === 'string' ? member.displayName : member.email, role: member.role};
    });
    if (!members.some(member => member.userId === this.userId)) throw new TeamError('You no longer have access to this shared workspace.', {code: '42501'});
    const memberIds = new Set(members.map(member => member.userId));
    const assignees = Object.fromEntries(state.tasks.map(task => {
      const assigned = own(snapshot.assignees || {}, task.id) ? snapshot.assignees[task.id] : null;
      if (assigned !== null && !memberIds.has(assigned)) throw new TypeError('A shared task has an invalid assignee.');
      return [task.id, assigned];
    }));
    const audit = Object.fromEntries(state.tasks.map(task => {
      const source = own(snapshot.audit || {}, task.id) ? snapshot.audit[task.id] : {};
      return [task.id, {createdBy: typeof source?.createdBy === 'string' ? source.createdBy : null, updatedBy: typeof source?.updatedBy === 'string' ? source.updatedBy : null}];
    }));
    this.workspace = freeze(clone(workspace));
    this.members = freeze(members);
    this.assignees = freeze(assignees);
    this.audit = freeze(audit);
    this.versions = freeze(versions);
    this._state = freeze(state);
    this.loadIssue = null;
    this.lastError = null;
    this.syncStatus = 'saved';
    if (!initial) this._emit('state');
    return true;
  }

  _handleError(error, {loading = false} = {}) {
    this.lastError = error;
    this.syncStatus = error.accessDenied ? 'access-lost' : error.uncertain ? 'offline' : 'error';
    if (loading || error.accessDenied) this.loadIssue = error.accessDenied ? 'Your access to this shared workspace has ended. Your personal board is still available.' : 'The shared workspace could not refresh. The visible copy may be out of date.';
    this._emit(error.accessDenied ? 'access-lost' : 'error');
    if (error.accessDenied) this.dispose('Your account no longer has access to this workspace.');
  }

  async reload() {
    this._assertActive();
    if (this.hasPending) return await this.retryPending();
    if (this.busy) { this._reloadQueued = true; return this.state; }
    if (this._refreshPromise) return this._refreshPromise;
    const epoch = this._readEpoch;
    this._refreshPromise = (async () => {
      try {
        const snapshot = await this.service._rpc('dayboard_snapshot', {p_workspace_id: this.workspace.id}, this.userId);
        this._assertActive();
        if (epoch === this._readEpoch && !this.busy) this._applySnapshot(snapshot);
        return this.state;
      } catch (error) { if (!this._disposed) this._handleError(error, {loading: true}); throw error; }
      finally { this._refreshPromise = null; }
    })();
    return this._refreshPromise;
  }

  _changes(next, assignments) {
    const changes = [];
    const members = new Set(this.members.map(member => member.userId));
    const requested = new Map(Object.entries(assignments || {}).map(([id, member]) => {
      if (!next.tasks.some(task => task.id === id)) throw new TypeError('The assigned task no longer exists.');
      const assignee = member || null;
      if (assignee !== null && !members.has(assignee)) throw new TypeError('Choose a current member of this workspace.');
      return [id, assignee];
    }));
    for (const entity of ['area', 'project', 'task']) {
      const collection = COLLECTIONS[entity], before = recordMap(this.state[collection]), after = recordMap(next[collection]);
      for (const [id, row] of after) {
        const previous = before.get(id);
        const previousAssignee = own(this.assignees, id) ? this.assignees[id] : null;
        const assignmentChanged = entity === 'task' && requested.has(id) && requested.get(id) !== previousAssignee;
        const changed = entity === 'task' ? !same(taskContent(previous), taskContent(row)) : !same(previous, row);
        if (changed || assignmentChanged) changes.push({entity, id, operation: 'put', expectedVersion: versionOf(this.versions, entity, id), value: entity === 'task' ? taskPayload(row) : clone(row), ...(entity === 'task' ? {assigneeId: requested.has(id) ? requested.get(id) : previousAssignee} : {})});
      }
      for (const id of before.keys()) if (!after.has(id)) changes.push({entity, id, operation: 'delete', expectedVersion: versionOf(this.versions, entity, id)});
    }
    const oldTasks = recordMap(this.state.tasks), newTasks = recordMap(next.tasks);
    for (const task of next.tasks) if ((oldTasks.get(task.id)?.today || false) !== task.today) changes.push({entity: 'pin', id: task.id, operation: 'put', expectedVersion: versionOf(this.versions, 'pin', task.id), value: {pinned: task.today}});
    for (const task of this.state.tasks) if (task.today && !newTasks.has(task.id)) changes.push({entity: 'pin', id: task.id, operation: 'delete', expectedVersion: versionOf(this.versions, 'pin', task.id)});
    return orderedChanges(changes);
  }

  _inverse(changes) {
    const maps = {area: recordMap(this.state.areas), project: recordMap(this.state.projects), task: recordMap(this.state.tasks)};
    return changes.map(change => {
      if (change.entity === 'pin') return {entity: 'pin', id: change.id, operation: 'put', value: {pinned: Boolean(maps.task.get(change.id)?.today)}};
      const previous = maps[change.entity].get(change.id);
      if (!previous) return {entity: change.entity, id: change.id, operation: 'delete'};
      return {entity: change.entity, id: change.id, operation: 'put', value: change.entity === 'task' ? taskPayload(previous) : clone(previous), ...(change.entity === 'task' ? {assigneeId: this.assignees[change.id] || null} : {})};
    });
  }

  async commit(mutator, {assignments = {}} = {}) {
    this._assertActive();
    if (this.busy) throw new TeamError('Wait for the current shared save to finish.');
    if (this.hasPending) throw new TeamError('The previous save has not been confirmed. Retry the original save before making another change.', {code: 'PENDING_SAVE'});
    if (typeof mutator !== 'function') throw new TypeError('A board change must be a function.');
    const draft = clone(this.state), result = mutator(draft);
    if (result && typeof result.then === 'function') throw new TypeError('Prepare a shared change synchronously before saving it.');
    const next = normalizeWorkspace(draft);
    const changes = this._changes(next, assignments);
    const settingsChanged = !same(next.settings, this.state.settings);
    if (settingsChanged && changes.length) throw new TypeError('Save personal display choices separately from shared work.');
    if (settingsChanged) {
      if (!this.storage) throw new Error('This browser cannot save personal display choices.');
      this.storage.setItem(this.preferencesKey, JSON.stringify(next.settings));
      this._settings = clone(next.settings);
      this._state = freeze({...clone(this.state), settings: clone(next.settings)});
      this._emit('preferences');
      return this.state;
    }
    if (!changes.length) return this.state;
    this._pending = {requestId: newID(), changes, inverse: this._inverse(changes), undo: false};
    return await this._sendPending();
  }

  async _sendPending() {
    this._assertActive();
    if (this.busy) throw new TeamError('Wait for the current shared save to finish.');
    if (!this._pending) return this.state;
    const pending = this._pending;
    this._saving = true;
    this._readEpoch++;
    this.syncStatus = 'saving';
    this._emit('saving');
    try {
      let response;
      // One transport retry uses exactly the original request ID and payload.
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          response = await this.service._rpc('dayboard_commit', {p_workspace_id: this.workspace.id, p_request_id: pending.requestId, p_changes: pending.changes}, this.userId);
          break;
        } catch (error) {
          if (!error.uncertain || attempt === 1 || this._disposed) throw error;
        }
      }
      this._assertActive();
      const receipt = response?.receipt;
      if (receipt?.requestId !== pending.requestId || !receipt.versions) throw new TeamError('The server response did not confirm this save. Retry the original save to check its result.', {code: 'RECEIPT', uncertain: true});
      const receiptVersions = {};
      for (const collection of Object.values(COLLECTIONS)) receiptVersions[collection] = versionMap(receipt.versions[collection] || {}, `${collection} receipt versions`);
      const inverse = pending.inverse.map(change => {
        const expectedVersion = versionOf(receiptVersions, change.entity, change.id);
        if (!expectedVersion) throw new TeamError('The server response is missing a saved record version. Retry the original save.', {code: 'RECEIPT', uncertain: true});
        return {...change, expectedVersion};
      });
      this._applySnapshot(response);
      this._pending = null;
      if (pending.undo) this._history.pop();
      else if (inverse.length) {
        this._history.push(orderedChanges(inverse));
        if (this._history.length > 30) this._history.shift();
      }
      return this.state;
    } catch (rawError) {
      const error = rawError instanceof TeamError && rawError.accessDenied
        ? new TeamError(rawError.message, {code: rawError.code, uncertain: true})
        : rawError instanceof TeamError ? rawError : new TeamError('The shared save could not be confirmed. Retry the original save before editing again.', {code: 'RESPONSE', uncertain: true});
      if (!error.uncertain) this._pending = null;
      if (!this._disposed) this._handleError(error);
      throw error;
    } finally {
      this._saving = false;
      this._emit('settled');
      if (this._reloadQueued && !this.hasPending && !this._disposed) { this._reloadQueued = false; this._requestReload(); }
    }
  }

  async retryPending() {
    if (!this.hasPending) return await this.reload();
    return await this._sendPending();
  }

  async undo() {
    this._assertActive();
    if (this.hasPending || this.busy) throw new TeamError('Finish the current shared save before undoing a change.');
    if (!this._history.length) return this.state;
    const changes = clone(this._history[this._history.length - 1]);
    this._pending = {requestId: newID(), changes, inverse: [], undo: true};
    return await this._sendPending();
  }

  exportJSON() {
    const board = clone(this.state);
    // A shared work export excludes a member's private Today shortlist.
    for (const task of board.tasks) task.today = false;
    const byId = new Map(this.members.map(member => [member.userId, member]));
    const assignments = board.tasks.flatMap(task => {
      const userId = this.assignees[task.id], member = byId.get(userId);
      return member ? [{taskId: task.id, userId, email: member.email}] : [];
    });
    return JSON.stringify({format: 'dayboard-team-backup', version: 1, exportedAt: new Date().toISOString(), workspace: {id: this.workspace.id, name: this.workspace.name}, board, assignments}, null, 2);
  }

  async importJSON(text, {mode = 'merge'} = {}) {
    if (mode !== 'merge') throw new TypeError('Shared imports add new copies. Replacing the whole team workspace is not available.');
    const {board, assignments: importedAssignments} = readBackup(text);
    const areaIds = new Map(board.areas.map(area => [area.id, `area-${newID()}`]));
    const projectIds = new Map(board.projects.map(project => [project.id, newID()]));
    const taskIds = new Map(board.tasks.map(task => [task.id, newID()]));
    const names = new Set(this.state.areas.map(area => area.name.toLowerCase()));
    const areas = board.areas.map(area => {
      let name = area.name, count = 1;
      while (names.has(name.toLowerCase())) {
        const suffix = count === 1 ? ' (copy)' : ` (copy ${count})`;
        name = area.name.slice(0, 80 - suffix.length).trimEnd() + suffix;
        count++;
      }
      names.add(name.toLowerCase());
      return {...area, id: areaIds.get(area.id), name};
    });
    const membersById = new Map(this.members.map(member => [member.userId, member]));
    const membersByEmail = new Map(this.members.map(member => [member.email.toLowerCase(), member]));
    const assignments = Object.fromEntries(importedAssignments.flatMap(assignment => {
      const member = membersById.get(assignment.userId) || (assignment.email ? membersByEmail.get(assignment.email.toLowerCase()) : null);
      return member ? [[taskIds.get(assignment.taskId), member.userId]] : [];
    }));
    return await this.commit(draft => {
      draft.areas.push(...areas);
      draft.projects.push(...board.projects.map(project => ({...project, id: projectIds.get(project.id), area: areaIds.get(project.area), starter: false})));
      draft.tasks.push(...board.tasks.map(task => ({...task, id: taskIds.get(task.id), number: 0, area: areaIds.get(task.area), projectId: projectIds.get(task.projectId) || '', repeatNextId: taskIds.get(task.repeatNextId) || '', today: false, starter: false})));
    }, {assignments});
  }

  _requestReload() {
    if (this._disposed || this.hasPending) return;
    if (this.busy) { this._reloadQueued = true; return; }
    if (this._reloadTimer) return;
    this._reloadTimer = setTimeout(() => { this._reloadTimer = null; this.reload().catch(() => {}); }, 100);
  }

  _startUpdates() {
    const client = this.service._client;
    if (client?.channel) {
      try {
        this._channel = client.channel(`dayboard-${this.workspace.id}-${newID()}`)
          .on('postgres_changes', {event: 'UPDATE', schema: 'public', table: 'dayboard_workspaces', filter: `id=eq.${this.workspace.id}`}, () => this._requestReload())
          .subscribe(status => {
            if (this._disposed) return;
            this.updates = status === 'SUBSCRIBED' ? 'live' : 'polling';
            if (status === 'SUBSCRIBED') this._requestReload();
            this._emit('connection');
          });
      } catch { this.updates = 'polling'; }
    }
    const poll = () => {
      if (this._disposed) return;
      if (globalThis.document?.visibilityState !== 'hidden') this._requestReload();
      this._pollTimer = setTimeout(poll, this._pollInterval);
    };
    this._pollTimer = setTimeout(poll, this._pollInterval);
    this._onReconnect = () => this._requestReload();
    this._onVisible = () => { if (globalThis.document?.visibilityState === 'visible') this._requestReload(); };
    globalThis.window.addEventListener('online', this._onReconnect);
    globalThis.document?.addEventListener('visibilitychange', this._onVisible);
  }

  dispose(reason = 'This shared workspace has been closed.') {
    if (this._disposed) return;
    this._disposed = true;
    this._disposeReason = reason;
    this._readEpoch++;
    clearTimeout(this._pollTimer);
    clearTimeout(this._reloadTimer);
    if (this._channel) {
      try { Promise.resolve(this.service._client?.removeChannel(this._channel)).catch(() => {}); }
      catch { /* The store stays closed even if the transport is already gone. */ }
    }
    if (this._onReconnect) globalThis.window?.removeEventListener('online', this._onReconnect);
    if (this._onVisible) globalThis.document?.removeEventListener('visibilitychange', this._onVisible);
    this.service._stores?.delete(this);
    this._listeners.clear();
  }
}
