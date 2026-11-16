/** Synthetic in-memory transport for browser UI checks. It is not a security model. */
import {makeTask, normalizeWorkspace} from '../public/model.mjs';

const OWNER = '11111111-1111-4111-8111-111111111111';
const MEMBER = '22222222-2222-4222-8222-222222222222';
const WORKSPACE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TOKEN = 'synthetic-owner-token-for-local-ui-checks';
const clone = value => structuredClone(value);
const stamp = () => new Date().toISOString();
const authListeners = new Set(), channels = new Set(), qaListeners = new Set();
const receipts = new Map(), taskNumbers = new Map([['qa-first', 1], ['qa-second', 2]]);
let session = ownerSession(), nextNumber = 3, committed = 0, dropped = 0, remoteEdits = 0;
let loseArmed = false, lossRequest = null, lossRemaining = 0, delayArmed = false;
let lastEvent = 'Ready. Open Workspaces, then Test team.';
let snapshot = initialSnapshot();

function ownerSession() {
  return {access_token: TOKEN, user: {id: OWNER, email: 'owner@example.test', email_confirmed_at: stamp(), is_anonymous: false}};
}

function initialSnapshot() {
  const data = normalizeWorkspace({
    schemaVersion: 2, revision: 1, updatedAt: stamp(),
    areas: [{id: 'general', name: 'General', color: 'blue'}], projects: [],
    tasks: [
      makeTask({id: 'qa-first', number: 1, title: 'First shared task', area: 'general', status: 'next', notes: 'Synthetic team content. Edit this task to check conflicts or uncertain replies.'}),
      makeTask({id: 'qa-second', number: 2, title: 'Second shared task', area: 'general', status: 'inbox', notes: 'Synthetic task assigned to another member.'}),
    ], settings: {},
  });
  return {
    workspace: {id: WORKSPACE, name: 'Test team', role: 'owner', revision: 1}, data,
    versions: {areas: {general: 1}, projects: {}, tasks: {'qa-first': 1, 'qa-second': 1}, pins: {}},
    assignees: {'qa-first': OWNER, 'qa-second': MEMBER},
    audit: {'qa-first': {createdBy: OWNER, updatedBy: OWNER}, 'qa-second': {createdBy: MEMBER, updatedBy: MEMBER}},
    members: [
      {userId: OWNER, email: 'owner@example.test', displayName: 'Synthetic owner', role: 'owner'},
      {userId: MEMBER, email: 'member@example.test', displayName: 'Synthetic member', role: 'member'},
    ],
  };
}

export function qaState() {
  return {signedIn: Boolean(session), committed, dropped, revision: snapshot.workspace.revision, taskCount: snapshot.data.tasks.length, loseArmed, delayArmed, lastEvent};
}

export function subscribeQA(listener) { qaListeners.add(listener); listener(qaState()); return () => qaListeners.delete(listener); }
function announce(message) { lastEvent = message; for (const listener of qaListeners) listener(qaState()); }
function broadcast() { for (const channel of channels) queueMicrotask(() => { if (channels.has(channel)) channel.update?.({eventType: 'UPDATE'}); }); }
function changeSession(next, event) { session = next; for (const listener of authListeners) listener(event, clone(session)); }
function advance(target) { target.workspace.revision++; target.data.revision = target.workspace.revision; target.data.updatedAt = stamp(); }

export function qaAction(action) {
  if (action === 'lose') {
    loseArmed = true; lossRequest = null; lossRemaining = 2;
    announce('Armed: the next save is committed once, then both automatic replies are lost. Use Retry original save afterwards.');
  } else if (action === 'delay') {
    delayArmed = true;
    announce('Armed: the next save reply waits 2 seconds after the synthetic server commits it.');
  } else if (action === 'remote') {
    const task = snapshot.data.tasks.find(item => item.id === 'qa-first');
    if (!task) { announce('The first synthetic task was removed. Reload this QA page to reset it.'); return; }
    remoteEdits++;
    task.title = `Remote edit ${remoteEdits}: first shared task`;
    task.notes = `A synthetic second member edited this task. Remote edit ${remoteEdits}.`;
    task.updatedAt = stamp(); snapshot.versions.tasks[task.id]++;
    snapshot.audit[task.id].updatedBy = MEMBER;
    advance(snapshot); broadcast();
    announce(`Synthetic remote edit ${remoteEdits} committed. Any already-open editor should retain its draft and detect the conflict.`);
  } else if (action === 'expire') {
    changeSession(null, 'SIGNED_OUT');
    announce('Synthetic sign-in expired. No token or account was changed outside this page.');
  } else if (action === 'restore') {
    changeSession(ownerSession(), 'SIGNED_IN');
    announce('The same synthetic owner is signed in again. Use the app’s Restore draft action if one is offered.');
  }
}

function failure(code, message) { return {data: null, error: {code, message}}; }
function applyCommit(args) {
  const prior = receipts.get(args.p_request_id);
  if (prior) return {data: {...clone(snapshot), receipt: {...clone(prior), replayed: true}}, error: null};
  if (!Array.isArray(args.p_changes)) return failure('QA_INVALID', 'The QA fixture received invalid changes.');
  const next = clone(snapshot), numberMap = new Map(taskNumbers);
  let nextTaskNumber = nextNumber;
  const collections = {area: 'areas', project: 'projects', task: 'tasks', pin: 'pins'};
  const receipt = {requestId: args.p_request_id, replayed: false, versions: {areas: {}, projects: {}, tasks: {}, pins: {}}};
  for (const change of args.p_changes) {
    const collection = collections[change.entity];
    if (!collection) return failure('QA_INVALID', 'The QA fixture does not support this record type.');
    const version = next.versions[collection][change.id] || 0;
    if (version !== change.expectedVersion) return failure('40001', `This ${change.entity} changed. Review the latest version before saving.`);
    next.versions[collection][change.id] = version + 1;
    receipt.versions[collection][change.id] = version + 1;
    if (change.entity === 'pin') {
      const task = next.data.tasks.find(item => item.id === change.id);
      if (task) task.today = change.operation === 'put' && Boolean(change.value.pinned);
      continue;
    }
    const rows = next.data[collection], index = rows.findIndex(row => row.id === change.id);
    if (change.operation === 'delete') {
      if (index !== -1) rows.splice(index, 1);
      if (change.entity === 'task') { delete next.assignees[change.id]; delete next.audit[change.id]; }
      continue;
    }
    const row = clone(change.value);
    if (change.entity === 'task') {
      if (!numberMap.has(row.id)) numberMap.set(row.id, nextTaskNumber++);
      row.number = numberMap.get(row.id);
      row.today = index === -1 ? false : rows[index].today;
      row.createdAt = index === -1 ? stamp() : rows[index].createdAt;
      row.updatedAt = stamp();
      next.assignees[row.id] = change.assigneeId || null;
      next.audit[row.id] = {createdBy: next.audit[row.id]?.createdBy || OWNER, updatedBy: OWNER};
    }
    if (index === -1) rows.push(row); else rows[index] = row;
  }
  try { next.data = normalizeWorkspace(next.data); }
  catch (error) { return failure('QA_INVALID', error.message); }
  for (const task of next.data.tasks) if (task.archived || ['done', 'someday'].includes(task.status)) task.today = false;
  advance(next); snapshot = next; nextNumber = nextTaskNumber;
  for (const [id, number] of numberMap) taskNumbers.set(id, number);
  receipts.set(args.p_request_id, clone(receipt)); committed++;
  broadcast();
  return {data: {...clone(snapshot), receipt}, error: null};
}

async function runRPC(name, args, headers, signal) {
  if (signal?.aborted) throw new DOMException('Synthetic request aborted', 'AbortError');
  if (headers.Authorization !== `Bearer ${TOKEN}`) return failure('42501', 'The QA fixture requires its synthetic owner sign-in.');
  if (name === 'dayboard_workspaces') return {data: [{...clone(snapshot.workspace), memberCount: 2}], error: null};
  if (name === 'dayboard_capabilities') return {data: {mayCreateWorkspace: false, workspaceLimit: 1, ownedWorkspaceCount: 1}, error: null};
  if (args.p_workspace_id !== WORKSPACE) return failure('QA_UNSUPPORTED', 'This QA fixture supports the existing Test team only.');
  if (name === 'dayboard_snapshot') return {data: clone(snapshot), error: null};
  if (name === 'dayboard_invitations') return {data: [], error: null};
  if (name !== 'dayboard_commit') return failure('QA_UNSUPPORTED', 'This action is outside the local client/UI fixture. No hosted request was sent.');
  if (loseArmed) { lossRequest = args.p_request_id; loseArmed = false; }
  const delayed = delayArmed; delayArmed = false;
  const result = applyCommit(args);
  if (result.error) return result;
  announce(result.data.receipt.replayed ? 'Original request replayed; no additional transaction was committed.' : 'Synthetic shared save committed.');
  if (delayed) await new Promise(resolve => setTimeout(resolve, 2000));
  if (signal?.aborted) throw new DOMException('Synthetic request aborted after commit', 'AbortError');
  if (args.p_request_id === lossRequest && lossRemaining > 0) {
    lossRemaining--; dropped++;
    announce(`Synthetic server has the save; reply ${3 - lossRemaining - 1} of 2 was deliberately lost.`);
    return {data: null, error: {message: 'Synthetic connection lost after the save committed.'}};
  }
  return result;
}

const client = {
  auth: {
    getSession: async () => ({data: {session: clone(session)}, error: null}),
    onAuthStateChange(listener) { authListeners.add(listener); return {data: {subscription: {unsubscribe() { authListeners.delete(listener); }}}}; },
    async signOut() { changeSession(null, 'SIGNED_OUT'); announce('Signed out of the synthetic account.'); return {error: null}; },
    async signInWithOtp() { return {error: {code: 'QA_UNSUPPORTED', message: 'No email is sent by this fixture. Use Restore test sign-in in the visible QA controls.'}}; },
  },
  rpc(name, args = {}) {
    const headers = {}; let signal, promise;
    const request = {
      setHeader(key, value) { headers[key] = value; return request; },
      abortSignal(value) { signal = value; return request; },
      then(resolve, reject) { promise ||= runRPC(name, clone(args), headers, signal); return promise.then(resolve, reject); },
    };
    return request;
  },
  channel() {
    const channel = {
      on(_type, _filter, callback) { channel.update = callback; return channel; },
      subscribe(callback) { channels.add(channel); queueMicrotask(() => { if (channels.has(channel)) callback('SUBSCRIBED'); }); return channel; },
    };
    return channel;
  },
  async removeChannel(channel) { channels.delete(channel); return 'ok'; },
};

export function createClient(url, key) {
  if (url !== 'https://dayboard-qa.invalid' || key !== 'sb_publishable_synthetic_qa_no_backend') throw new Error('This transport is only for the isolated synthetic QA build.');
  return client;
}
