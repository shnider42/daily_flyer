"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Data = require("../daily_flyer/themes/best_man_assets/store.js");

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

function filled() {
  const state = Data.fresh();
  const stamp = state.updatedAt;
  state.notes.push({id: "note-1", text: "A story about my brother.\nThe punchline: ‘remember this’ 🥂", tag: "speech", pinned: true, createdAt: stamp, updatedAt: stamp});
  state.tasks.push({id: "task-1", title: "Ask what help he wants", section: "before", date: "", notes: "Keep it simple.", done: true, createdAt: stamp, updatedAt: stamp});
  state.events.push({id: "event-1", title: "Rehearsal", date: "2028-02-29", time: "18:30", location: "To be decided", notes: "No travel booked yet.", createdAt: stamp, updatedAt: stamp});
  state.people.push({id: "person-1", name: "A contact", role: "Wedding party", phone: "+1 555 0100", email: "example@example.com", notes: "Ask about transport.", createdAt: stamp, updatedAt: stamp});
  state.speech = "Thanks for being here.\n\nHere is the story.";
  state.composer = {text: "An unfinished thought", tag: "ask"};
  state.details.brother = "My brother";
  state.prefs.theme = "dark";
  return state;
}

test("all notebook material, including unfinished writing, survives storage and backup round trips", () => {
  const storage = memoryStorage();
  const store = Data.createStore(storage);
  assert.equal(store.load().blocked, false);
  const state = filled();
  store.save(state);
  const reloaded = Data.createStore(storage).load();
  assert.equal(reloaded.blocked, false);
  assert.deepEqual(reloaded.state, state);
  assert.deepEqual(Data.importBackup(Data.exportBackup(state)), state);
  const text = Data.exportText(state);
  for (const expected of [state.speech, state.composer.text, state.notes[0].text, "[x]", "2028-02-29", "18:30", "A contact"]) assert.ok(text.includes(expected));
});

test("invalid or future-version stored data is never replaced by an autosave", () => {
  for (const existing of ["{broken", JSON.stringify({...Data.fresh(), version: 2})]) {
    const storage = memoryStorage();
    storage.setItem(Data.KEY, existing);
    const store = Data.createStore(storage);
    const result = store.load();
    assert.equal(result.blocked, true);
    assert.ok(result.warning);
    assert.throws(() => store.save(filled()), {code: "CORRUPT_DATA"});
    assert.equal(storage.getItem(Data.KEY), existing);
  }
});

test("quota failures leave the previous saved notebook intact and are not reported as saved", () => {
  const storage = memoryStorage();
  const store = Data.createStore(storage);
  const state = store.load().state;
  store.save(state);
  const before = storage.getItem(Data.KEY);
  storage.setItem = () => { throw new Error("QuotaExceededError"); };
  state.speech = "A new unsaved paragraph";
  assert.throws(() => store.save(state), {code: "STORAGE_UNAVAILABLE"});
  assert.equal(storage.getItem(Data.KEY), before);
  assert.ok(Data.exportBackup(state).includes("A new unsaved paragraph"));
});

test("an explicit restore can recover from corrupt storage while preserving its original bytes", () => {
  const storage = memoryStorage();
  const unreadable = '{"version":99,"future-writing":"Do not erase"}';
  storage.setItem(Data.KEY, unreadable);
  const store = Data.createStore(storage);
  assert.equal(store.load().blocked, true);
  const restored = filled();
  store.replace(restored);
  assert.equal(store.unreadableCopy(), unreadable);
  assert.deepEqual(store.load().state, restored);
  restored.speech += "\nAn ordinary edit";
  assert.doesNotThrow(() => store.save(restored));
  assert.equal(store.unreadableCopy(), unreadable);
});

test("a stale tab cannot silently replace writing saved from another tab", () => {
  const storage = memoryStorage();
  const first = Data.createStore(storage);
  const second = Data.createStore(storage);
  const firstState = first.load().state;
  const secondState = second.load().state;
  firstState.speech = "The first tab's speech";
  first.save(firstState);
  secondState.speech = "The second tab's speech";
  assert.throws(() => second.save(secondState), {code: "STALE_DATA"});
  assert.equal(Data.createStore(storage).load().state.speech, firstState.speech);
  const adopted = second.acceptExternal();
  assert.equal(adopted.state.speech, firstState.speech);
  adopted.state.speech += "\nA later edit";
  second.save(adopted.state);
  assert.equal(Data.createStore(storage).load().state.speech, adopted.state.speech);
});

test("pre-import recovery is independent and survives subsequent autosaves", () => {
  const store = Data.createStore(memoryStorage());
  const original = store.load().state;
  original.speech = "Before import";
  store.save(original);
  store.recovery(original);
  const imported = filled();
  store.save(imported);
  imported.speech = "An edit after the import";
  store.save(imported);
  assert.equal(store.restoreRecovery().speech, "Before import");
  const read = store.restoreRecovery();
  read.speech = "changed in memory";
  assert.equal(store.restoreRecovery().speech, "Before import");
});

test("unavailable browser storage leaves writing exportable and exposes an explicit error", () => {
  const store = Data.createStore(null);
  const result = store.load();
  assert.equal(result.blocked, true);
  result.state.speech = "Do not lose this";
  assert.throws(() => store.save(result.state), {code: "STORAGE_UNAVAILABLE"});
  assert.ok(Data.exportBackup(result.state).includes("Do not lose this"));
});

test("imports reject invalid shape, versions, dates, booleans, repeated IDs, and oversized content", () => {
  const envelope = () => JSON.parse(Data.exportBackup(filled()));
  const cases = [
    item => { item.format = "another-app"; },
    item => { item.version = 2; },
    item => { item.data.version = 2; },
    item => { item.data.notes = {}; },
    item => { item.data.tasks[0].done = "false"; },
    item => { item.data.events[0].date = "2027-02-29"; },
    item => { item.data.events[0].time = "24:00"; },
    item => { item.data.notes.push({...item.data.notes[0]}); },
    item => { item.data.speech = "a".repeat(100001); },
    item => { delete item.data.details; },
    item => { item.data.composer.tag = "unknown"; },
    item => { item.data.updatedAt = "2027-02-30T00:00:00.000Z"; },
  ];
  for (const change of cases) {
    const value = envelope();
    change(value);
    assert.throws(() => Data.importBackup(JSON.stringify(value)));
  }
  assert.throws(() => Data.importBackup(" ".repeat(Data.MAX_BYTES + 1)));
  const leap = filled();
  leap.details.weddingDate = "2000-02-29";
  assert.doesNotThrow(() => Data.validate(leap));
  leap.details.weddingDate = "1900-02-29";
  assert.throws(() => Data.validate(leap));
});

test("prototype keys, unexpected fields, and executable-looking text do not become objects or markup", () => {
  const backup = Data.exportBackup(filled());
  const malicious = backup.replace('"details":{', '"details":{"__proto__":{"polluted":true},');
  assert.throws(() => Data.importBackup(malicious));
  assert.equal({}.polluted, undefined);
  const state = filled();
  state.notes[0].text = '<img src=x onerror="alert(1)">';
  assert.equal(Data.importBackup(Data.exportBackup(state)).notes[0].text, state.notes[0].text);
  const inherited = Object.create({speech: "inherited"});
  Object.assign(inherited, state);
  assert.throws(() => Data.validate(inherited));
});

test("validation clones data, new notebooks do not share arrays, and IDs are usable", () => {
  const state = filled();
  const canonical = Data.validate(state);
  canonical.notes[0].text = "Different";
  assert.notEqual(state.notes[0].text, canonical.notes[0].text);
  const a = Data.fresh();
  const b = Data.fresh();
  a.tasks.push({});
  assert.equal(b.tasks.length, 0);
  assert.match(Data.id(), /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/);
});

test("state and sync metadata share one atomic cache envelope, including pending empty notebooks", () => {
  const storage = memoryStorage();
  const store = Data.createStore(storage);
  const state = store.load().state;
  assert.equal(store.load().sync, null);
  const sync = {version: 7, pending: true};
  store.save(state, sync);
  const raw = JSON.parse(storage.getItem(Data.KEY));
  assert.deepEqual(raw, {format: "best-man-cache", version: 1, data: state, sync});
  const loaded = Data.createStore(storage).load();
  assert.deepEqual(loaded.state, state);
  assert.deepEqual(loaded.sync, sync);
  assert.equal(loaded.blocked, false);
  sync.version = 100;
  assert.equal(store.load().sync.version, 7);
  store.replace(filled(), {version: 8, pending: false});
  assert.deepEqual(store.load().sync, {version: 8, pending: false});
  assert.equal(store.load().state.speech, filled().speech);
});

test("an atomic cache quota failure cannot mix new metadata with an older notebook", () => {
  const storage = memoryStorage();
  const store = Data.createStore(storage);
  const old = store.load().state;
  old.speech = "The previous saved draft";
  store.save(old, {version: 3, pending: false});
  const before = storage.getItem(Data.KEY);
  storage.setItem = () => { throw new Error("QuotaExceededError"); };
  const next = {...old, speech: "New writing not yet cached"};
  assert.throws(() => store.save(next, {version: 4, pending: true}), {code: "STORAGE_UNAVAILABLE"});
  assert.equal(storage.getItem(Data.KEY), before);
  const loaded = Data.createStore(storage).load();
  assert.equal(loaded.state.speech, "The previous saved draft");
  assert.deepEqual(loaded.sync, {version: 3, pending: false});
});

test("metadata-only cache changes also protect against stale-tab writes", () => {
  const storage = memoryStorage();
  const first = Data.createStore(storage);
  const state = first.load().state;
  first.save(state, {version: 1, pending: true});
  const second = Data.createStore(storage);
  const other = second.load().state;
  first.save(state, {version: 2, pending: false});
  assert.throws(() => second.save(other, {version: 1, pending: true}), {code: "STALE_DATA"});
  assert.deepEqual(second.acceptExternal().sync, {version: 2, pending: false});
});

test("malformed cache metadata is blocked and preserved, not mistaken for notebook data", () => {
  const variants = [
    {version: -1, pending: true},
    {version: 1.2, pending: true},
    {version: 1, pending: "false"},
    {version: 1},
    {version: 1, pending: false, extra: "unexpected"},
    null,
  ];
  for (const sync of variants) {
    const storage = memoryStorage();
    const raw = JSON.stringify({format: "best-man-cache", version: 1, data: filled(), sync});
    storage.setItem(Data.KEY, raw);
    const store = Data.createStore(storage);
    const loaded = store.load();
    assert.equal(loaded.blocked, true);
    assert.equal(loaded.sync, null);
    assert.throws(() => store.save(Data.fresh(), {version: 0, pending: false}), {code: "CORRUPT_DATA"});
    assert.equal(storage.getItem(Data.KEY), raw);
  }
});

test("plain-state cache compatibility, exports, and pre-import recovery remain unchanged", () => {
  const storage = memoryStorage();
  const store = Data.createStore(storage);
  store.load();
  const state = filled();
  store.save(state);
  assert.deepEqual(JSON.parse(storage.getItem(Data.KEY)), state);
  assert.equal(store.load().sync, null);
  store.save(state, {version: 4, pending: true});
  store.recovery(state);
  assert.deepEqual(JSON.parse(storage.getItem(Data.RECOVERY_KEY)), state);
  assert.deepEqual(store.restoreRecovery(), state);
  assert.deepEqual(Data.importBackup(Data.exportBackup(store.load().state)), state);
});
