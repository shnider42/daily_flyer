/** Ephemeral local notices. No voyage journal, save or network state is touched. */
export const NOTICE_HISTORY_LIMIT = 60;
const ORDINARY_INTERVAL = 1400, REPEAT_INTERVAL = 8000, COMPACT_ORDINARY_DURATION = 2800;
const copy = record => Object.freeze({ id: record.id, text: record.text, type: record.type, count: record.count, time: record.time });
const noticeType = type => typeof type === 'string' && /^[a-z][a-z0-9_-]{0,30}$/i.test(type) ? type : 'info';
const priorityOf = (type, options) => options?.priority === 'urgent' || type === 'bad' && options?.priority !== 'routine' ? 'urgent' : 'routine';
const durationOf = duration => Math.max(250, Math.min(15000, Number.isFinite(duration) ? duration : 4600));

/** DOM and clocks are injected, keeping the lifecycle usable without a browser. */
export function createNoticeCenter({ now = () => Date.now(), setTimer = (callback, delay) => setTimeout(callback, delay),
  clearTimer = handle => clearTimeout(handle), render = () => null, update = () => {}, remove = element => element?.remove?.(),
  onConfigure = () => {} } = {}) {
  let compact = false, quiet = false, scope = null, onRead = null, sequence = 0, timerSequence = 0;
  let history = [], lastOrdinaryAt = -Infinity;
  const active = new Map();
  const time = () => { const value = now(); return Number.isFinite(value) ? value : Date.now(); };
  const current = entry => active.get(entry.id) === entry;

  function dismiss(entry) {
    if (!entry || !current(entry)) return;
    active.delete(entry.id); entry.timerVersion = ++timerSequence;
    if (entry.timer != null) clearTimer(entry.timer);
    entry.timer = null; remove(entry.element);
  }

  function pruneDetached() {
    for (const entry of [...active.values()]) if (entry.element?.isConnected === false) dismiss(entry);
  }

  function clear({ history: clearHistory = false } = {}) {
    for (const entry of [...active.values()]) dismiss(entry);
    if (clearHistory) { history = []; lastOrdinaryAt = -Infinity; }
  }

  function trimHistory() {
    while (history.length > NOTICE_HISTORY_LIMIT) {
      // A currently readable card must still have a full-text history entry.
      let index = history.length - 1;
      while (index >= 0 && active.has(history[index].id)) index--;
      history.splice(index < 0 ? history.length - 1 : index, 1);
    }
  }

  function remember(message, type = 'info') {
    const text = String(message ?? '');
    if (!text.trim()) return null;
    type = noticeType(type);
    let record = history.find(item => item.text === text && item.type === type);
    if (record) {
      record.count = Math.min(999999, record.count + 1); record.time = time();
      history = [record, ...history.filter(item => item !== record)];
    } else {
      record = { id: `notice-${++sequence}`, text, type, count: 1, time: time(), lastShownAt: -Infinity, lastPriority: null };
      history.unshift(record);
    }
    trimHistory(); return record;
  }

  function arm(entry, duration, startedAt = time()) {
    if (entry.timer != null) clearTimer(entry.timer);
    const dwell = Math.min(durationOf(duration), compact && entry.priority !== 'urgent' ? COMPACT_ORDINARY_DURATION : Infinity);
    entry.startedAt = startedAt; entry.expiresAt = startedAt + dwell;
    const remaining = entry.expiresAt - time();
    if (remaining <= 0) { dismiss(entry); return; }
    const version = ++timerSequence; entry.timerVersion = version;
    entry.timer = setTimer(() => { if (current(entry) && entry.timerVersion === version) dismiss(entry); }, remaining);
  }

  function configure(options = {}) {
    pruneDetached(); const wasCompact = compact;
    if (Object.hasOwn(options, 'scope')) {
      const next = options.scope == null ? null : String(options.scope);
      if (scope !== next) { clear({ history: true }); scope = next; }
    }
    if (Object.hasOwn(options, 'compact')) compact = !!options.compact;
    if (Object.hasOwn(options, 'quiet')) quiet = !!options.quiet;
    if (Object.hasOwn(options, 'onRead')) onRead = typeof options.onRead === 'function' ? options.onRead : null;
    if (quiet) for (const entry of [...active.values()]) if (entry.priority !== 'urgent') dismiss(entry);
    const limit = compact ? 1 : 4;
    if (active.size > limit) {
      const entries = [...active.values()], keep = entries.filter(entry => entry.priority === 'urgent').concat(entries.filter(entry => entry.priority !== 'urgent'));
      // Newest warnings take precedence when a desktop stack becomes compact.
      keep.sort((a, b) => (b.priority === 'urgent') - (a.priority === 'urgent') || b.order - a.order);
      const retained = new Set(keep.slice(0, limit));
      for (const entry of entries) if (!retained.has(entry)) dismiss(entry);
    }
    if (compact && !wasCompact) for (const entry of [...active.values()]) if (entry.priority !== 'urgent') arm(entry, entry.expiresAt - entry.startedAt, entry.startedAt);
    onConfigure({ compact, quiet, scope });
  }

  function record(message, type = 'info', options = {}) {
    const remembered = remember(message, type);
    return remembered ? copy(remembered) : null;
  }

  function show(message, type = 'info', duration = 4600, options = {}) {
    pruneDetached();
    const record = remember(message, type); if (!record) return null;
    const at = time(), priority = priorityOf(record.type, options), existing = active.get(record.id);
    if (existing) {
      if (priority === 'urgent' && existing.priority !== 'urgent') {
        existing.priority = 'urgent'; existing.order = ++timerSequence;
        record.lastShownAt = at; record.lastPriority = priority; arm(existing, duration);
      }
      // Repeats update the count, never the original dismissal deadline.
      update(existing.element, copy(record), { priority: existing.priority });
      return existing.element;
    }
    if (quiet && priority !== 'urgent') return null;
    const entries = [...active.values()], limit = compact ? 1 : 4;
    if (priority !== 'urgent' && (compact && entries.some(entry => entry.priority === 'urgent') || at - lastOrdinaryAt < ORDINARY_INTERVAL)) return null;
    const escalation = priority === 'urgent' && record.lastPriority === 'routine';
    if (!escalation && at - record.lastShownAt < REPEAT_INTERVAL) return null;
    const victims = [];
    if (active.size >= limit) {
      const ordinary = entries.filter(entry => entry.priority !== 'urgent');
      if (priority !== 'urgent' && !ordinary.length) return null;
      victims.push((ordinary.length ? ordinary : entries)[0]);
    }
    const entry = { id: record.id, element: null, priority, order: ++timerSequence, timer: null, timerVersion: 0 };
    entry.element = render(copy(record), { priority,
      onDismiss: () => dismiss(entry),
      onRead: () => { if (!current(entry)) return; dismiss(entry); onRead?.(record.id); }
    });
    if (!entry.element) return null;
    for (const victim of victims) dismiss(victim);
    active.set(entry.id, entry); record.lastShownAt = at; record.lastPriority = priority;
    if (priority !== 'urgent') lastOrdinaryAt = at;
    arm(entry, duration); return entry.element;
  }

  return Object.freeze({ configure, show, record, clear,
    history: () => Object.freeze(history.map(copy)), hasVisible: () => { pruneDetached(); return active.size > 0; } });
}
