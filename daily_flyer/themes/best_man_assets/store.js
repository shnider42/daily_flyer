/* The notebook stays in this browser. This module never sends network requests. */
(function (root) {
  "use strict";

  const KEY = "best-man-notebook:v1";
  const RECOVERY_KEY = "best-man-notebook:before-import:v1";
  const UNREADABLE_KEY = "best-man-notebook:unreadable:v1";
  const FORMAT = "best-man-notebook";
  const MAX_BYTES = 2_000_000;
  const MAX_ITEMS = 1500;
  const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
  const TAGS = ["note", "speech", "ask", "weekend"];
  const SECTIONS = ["before", "weekend", "day"];

  function failure(code, message, cause) {
    const error = new Error(message);
    error.code = code;
    if (cause) error.cause = cause;
    return error;
  }

  function invalid(message) {
    throw failure("INVALID_DATA", message);
  }

  function bytes(value) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(value).length;
    return encodeURIComponent(value).replace(/%[A-F\d]{2}/gi, "x").length;
  }

  function object(value, keys, label) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      invalid(`${label} must be an object.`);
    }
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) invalid(`${label} has an unsupported object type.`);
    for (const key of Object.keys(value)) {
      if (FORBIDDEN_KEYS.has(key) || !keys.includes(key)) invalid(`${label} has an unrecognized field.`);
    }
    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) invalid(`${label} is missing ${key}.`);
    }
    return value;
  }

  function string(value, max, label) {
    if (typeof value !== "string") invalid(`${label} must be text.`);
    if (value.length > max) invalid(`${label} is too long.`);
    // JSON and localStorage handle Unicode safely; no text is interpreted as HTML.
    return value;
  }

  function choice(value, options, label) {
    if (!options.includes(value)) invalid(`${label} has an unsupported value.`);
    return value;
  }

  function boolean(value, label) {
    if (typeof value !== "boolean") invalid(`${label} must be true or false.`);
    return value;
  }

  function timestamp(value, label) {
    string(value, 32, label);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) invalid(`${label} is not a valid saved time.`);
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) invalid(`${label} is not a valid saved time.`);
    return value;
  }

  function date(value, label) {
    string(value, 10, label);
    if (value === "") return value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid(`${label} is not a valid date.`);
    const [year, month, day] = value.split("-").map(Number);
    if (year < 1 || month < 1 || month > 12 || day < 1) invalid(`${label} is not a valid date.`);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (day > days[month - 1]) invalid(`${label} is not a valid date.`);
    return value;
  }

  function time(value, label) {
    string(value, 5, label);
    if (value !== "" && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) invalid(`${label} is not a valid time.`);
    return value;
  }

  function identity(value) {
    string(value, 120, "Entry ID");
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(value)) invalid("An entry has an invalid ID.");
    return value;
  }

  function list(value, validator, label) {
    if (!Array.isArray(value) || value.length > MAX_ITEMS) invalid(`${label} is not a valid list.`);
    const ids = new Set();
    return value.map((entry) => {
      const checked = validator(entry);
      if (ids.has(checked.id)) invalid(`${label} contains a repeated entry ID.`);
      ids.add(checked.id);
      return checked;
    });
  }

  function common(entry) {
    return {
      id: identity(entry.id),
      createdAt: timestamp(entry.createdAt, "Entry creation time"),
      updatedAt: timestamp(entry.updatedAt, "Entry saved time"),
    };
  }

  function note(entry) {
    object(entry, ["id", "text", "tag", "pinned", "createdAt", "updatedAt"], "Note");
    return {
      ...common(entry),
      text: string(entry.text, 20000, "Note"),
      tag: choice(entry.tag, TAGS, "Note label"),
      pinned: boolean(entry.pinned, "Pinned note"),
    };
  }

  function task(entry) {
    object(entry, ["id", "title", "section", "date", "notes", "done", "createdAt", "updatedAt"], "To-do");
    return {
      ...common(entry),
      title: string(entry.title, 500, "To-do title"),
      section: choice(entry.section, SECTIONS, "To-do section"),
      date: date(entry.date, "To-do date"),
      notes: string(entry.notes, 20000, "To-do notes"),
      done: boolean(entry.done, "To-do completion"),
    };
  }

  function event(entry) {
    object(entry, ["id", "title", "date", "time", "location", "notes", "createdAt", "updatedAt"], "Plan");
    return {
      ...common(entry),
      title: string(entry.title, 500, "Plan title"),
      date: date(entry.date, "Plan date"),
      time: time(entry.time, "Plan time"),
      location: string(entry.location, 2000, "Plan location"),
      notes: string(entry.notes, 20000, "Plan notes"),
    };
  }

  function person(entry) {
    object(entry, ["id", "name", "role", "phone", "email", "notes", "createdAt", "updatedAt"], "Person");
    return {
      ...common(entry),
      name: string(entry.name, 300, "Name"),
      role: string(entry.role, 300, "Person's role"),
      phone: string(entry.phone, 120, "Phone number"),
      email: string(entry.email, 320, "Email address"),
      notes: string(entry.notes, 20000, "Person's notes"),
    };
  }

  function fresh() {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      notes: [],
      tasks: [],
      events: [],
      people: [],
      speech: "",
      composer: {text: "", tag: "note"},
      details: {brother: "", partner: "", weddingDate: "", venue: "", stay: "", travel: "", anything: ""},
      prefs: {theme: "paper"},
    };
  }

  function validate(data) {
    if (data && typeof data === "object" && data.version !== 1) {
      throw failure("UNSUPPORTED_VERSION", "This notebook uses a different file version. Your current notebook has not been changed.");
    }
    object(data, ["version", "updatedAt", "notes", "tasks", "events", "people", "speech", "composer", "details", "prefs"], "Notebook");
    object(data.composer, ["text", "tag"], "Unfinished note");
    object(data.details, ["brother", "partner", "weddingDate", "venue", "stay", "travel", "anything"], "Wedding details");
    object(data.prefs, ["theme"], "Notebook preferences");
    const checked = {
      version: 1,
      updatedAt: timestamp(data.updatedAt, "Notebook saved time"),
      notes: list(data.notes, note, "Notes"),
      tasks: list(data.tasks, task, "To-dos"),
      events: list(data.events, event, "Plans"),
      people: list(data.people, person, "People"),
      speech: string(data.speech, 100000, "Speech"),
      composer: {
        text: string(data.composer.text, 20000, "Unfinished note"),
        tag: choice(data.composer.tag, TAGS, "Unfinished note label"),
      },
      details: {
        brother: string(data.details.brother, 300, "Brother's name"),
        partner: string(data.details.partner, 300, "Partner's name"),
        weddingDate: date(data.details.weddingDate, "Wedding date"),
        venue: string(data.details.venue, 2000, "Venue"),
        stay: string(data.details.stay, 10000, "Where to stay"),
        travel: string(data.details.travel, 10000, "Travel notes"),
        anything: string(data.details.anything, 20000, "Other details"),
      },
      prefs: {theme: choice(data.prefs.theme, ["paper", "dark"], "Paper color")},
    };
    // Leave room for the backup envelope so every saved notebook can be exported.
    if (bytes(JSON.stringify(checked)) > MAX_BYTES - 512) invalid("This notebook is too large to save. Download a copy and shorten a few entries.");
    return checked;
  }

  function id() {
    if (root.crypto && typeof root.crypto.randomUUID === "function") return root.crypto.randomUUID();
    if (root.crypto && typeof root.crypto.getRandomValues === "function") {
      const parts = root.crypto.getRandomValues(new Uint32Array(4));
      return Array.from(parts, part => part.toString(16).padStart(8, "0")).join("-");
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  }

  function parse(text, label) {
    if (typeof text !== "string" || bytes(text) > MAX_BYTES) invalid(`${label} is too large or is not a text file.`);
    let value;
    try {
      value = JSON.parse(text.replace(/^\uFEFF/, ""));
    } catch (cause) {
      throw failure("INVALID_DATA", `${label} could not be read. Choose a notebook backup (.json).`, cause);
    }
    return value;
  }

  function exportBackup(state) {
    return JSON.stringify({format: FORMAT, version: 1, exportedAt: new Date().toISOString(), data: validate(state)});
  }

  function importBackup(text) {
    const backup = parse(text, "This backup");
    object(backup, ["format", "version", "exportedAt", "data"], "Backup");
    if (backup.format !== FORMAT) invalid("This file is not a wedding notebook backup.");
    if (backup.version !== 1) throw failure("UNSUPPORTED_VERSION", "This backup uses a different file version. Your current notebook has not been changed.");
    timestamp(backup.exportedAt, "Backup creation time");
    return validate(backup.data);
  }

  function validateSync(meta) {
    object(meta, ["version", "pending"], "Saved notebook revision");
    if (!Number.isSafeInteger(meta.version) || meta.version < 0) invalid("The saved notebook revision is invalid.");
    return {version: meta.version, pending: boolean(meta.pending, "Pending notebook changes")};
  }

  function cachePayload(state, syncMeta) {
    const data = validate(state);
    if (syncMeta === undefined) return JSON.stringify(data);
    return JSON.stringify({format: "best-man-cache", version: 1, data, sync: validateSync(syncMeta)});
  }

  function readCache(text) {
    const value = parse(text, "Your saved notebook");
    if (value && typeof value === "object" && value.format === "best-man-cache") {
      object(value, ["format", "version", "data", "sync"], "Saved notebook cache");
      if (value.version !== 1) throw failure("UNSUPPORTED_VERSION", "This saved notebook uses a different cache version.");
      return {state: validate(value.data), sync: validateSync(value.sync)};
    }
    return {state: validate(value), sync: null};
  }

  function createStore(providedStorage) {
    let storage = providedStorage;
    let unavailable;
    if (providedStorage === undefined) {
      try { storage = root.localStorage; } catch (cause) { unavailable = cause; }
    }
    if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
      unavailable = unavailable || new Error("Browser storage is unavailable.");
    }
    let observed;
    let blocked = false;
    let blockCode = "CORRUPT_DATA";

    function storageError(cause) {
      return failure("STORAGE_UNAVAILABLE", "Your changes could not be saved in this browser. Download a copy before closing this page.", cause);
    }

    function read(key) {
      if (unavailable) throw storageError(unavailable);
      try { return storage.getItem(key); } catch (cause) { throw storageError(cause); }
    }

    function write(key, text) {
      if (unavailable) throw storageError(unavailable);
      try { storage.setItem(key, text); } catch (cause) { throw storageError(cause); }
    }

    function load() {
      try {
        observed = read(KEY);
        if (observed === null) {
          blocked = false;
          return {state: fresh(), sync: null, warning: "", blocked: false};
        }
        const cached = readCache(observed);
        blocked = false;
        return {...cached, warning: "", blocked: false};
      } catch (cause) {
        blocked = true;
        blockCode = cause.code === "STORAGE_UNAVAILABLE" ? "STORAGE_UNAVAILABLE" : "CORRUPT_DATA";
        const warning = blockCode === "STORAGE_UNAVAILABLE"
          ? "This browser is not allowing the notebook to save. You can still write and download a copy before leaving."
          : "Your saved notebook could not be opened. It has been left untouched. Keep this page open and restore a known backup; automatic saving is paused.";
        return {state: fresh(), sync: null, warning, blocked: true};
      }
    }

    function save(state, syncMeta) {
      const text = cachePayload(state, syncMeta);
      if (observed === undefined && !blocked) load();
      if (blocked) {
        if (blockCode === "STORAGE_UNAVAILABLE") throw storageError(unavailable);
        throw failure("CORRUPT_DATA", "Saving is paused to protect a saved notebook that could not be opened. Download your current work before restoring a backup.");
      }
      const current = read(KEY);
      if (current !== observed) {
        throw failure("STALE_DATA", "This notebook changed in another tab. Download this tab's work before reloading to avoid losing either version.");
      }
      write(KEY, text);
      observed = text;
    }

    function recovery(state) {
      write(RECOVERY_KEY, JSON.stringify(validate(state)));
    }

    function restoreRecovery() {
      const text = read(RECOVERY_KEY);
      if (text === null) return null;
      try { return validate(parse(text, "The previous notebook")); }
      catch (cause) { throw failure("CORRUPT_RECOVERY", "The previous notebook copy could not be opened. Your current notebook has not been changed.", cause); }
    }

    // Only call after the user explicitly confirms a replacement or restore.
    // Autosaves must use save(), which never replaces unreadable stored data.
    function replace(state, syncMeta) {
      const text = cachePayload(state, syncMeta);
      if (observed === undefined && !blocked) load();
      const current = read(KEY);
      if (current !== observed) {
        throw failure("STALE_DATA", "This notebook changed in another tab. Download this tab's work before reloading to avoid losing either version.");
      }
      if (blocked && blockCode === "CORRUPT_DATA" && current !== null) {
        // Preserve the exact bytes, including unknown future versions. If there
        // is not enough storage for this safety copy, refuse the replacement.
        write(UNREADABLE_KEY, current);
      }
      write(KEY, text);
      observed = text;
      blocked = false;
    }

    function unreadableCopy() {
      return read(UNREADABLE_KEY);
    }

    return Object.freeze({load, save, recovery, restoreRecovery, replace, unreadableCopy, acceptExternal: load});
  }

  function exportText(state) {
    const data = validate(state);
    const lines = ["FOR MY BROTHER", "A best man's notebook", ""];
    const details = [
      ["My brother", data.details.brother], ["His partner", data.details.partner],
      ["Wedding date", data.details.weddingDate], ["Venue", data.details.venue],
      ["Where to stay", data.details.stay], ["Travel", data.details.travel],
      ["Other details", data.details.anything],
    ];
    lines.push("THE DETAILS", "");
    details.forEach(([label, value]) => { if (value) lines.push(`${label}: ${value}`, ""); });
    if (data.composer.text) lines.push("UNFINISHED NOTE", "", data.composer.text, "");
    lines.push("NOTES", "");
    const labels = {note: "Note", speech: "For the speech", ask: "Ask him", weekend: "Weekend idea"};
    data.notes.forEach(entry => lines.push(`${entry.pinned ? "[Pinned] " : ""}${labels[entry.tag]}`, entry.text, ""));
    lines.push("THINGS TO DO", "");
    const sections = {before: "Before", weekend: "The weekend", day: "On the day"};
    data.tasks.forEach(entry => {
      lines.push(`${entry.done ? "[x]" : "[ ]"} ${entry.title} — ${sections[entry.section]}${entry.date ? ` (${entry.date})` : ""}`);
      if (entry.notes) lines.push(entry.notes);
      lines.push("");
    });
    lines.push("THE WEEKEND", "");
    data.events.forEach(entry => {
      lines.push(entry.title);
      const when = [entry.date || "Date to come", entry.time].filter(Boolean).join(" · ");
      lines.push(when);
      if (entry.location) lines.push(entry.location);
      if (entry.notes) lines.push(entry.notes);
      lines.push("");
    });
    lines.push("THE SPEECH", "", data.speech || "No draft yet.", "", "PEOPLE", "");
    data.people.forEach(entry => {
      lines.push(entry.name + (entry.role ? ` — ${entry.role}` : ""));
      if (entry.phone) lines.push(`Phone: ${entry.phone}`);
      if (entry.email) lines.push(`Email: ${entry.email}`);
      if (entry.notes) lines.push(entry.notes);
      lines.push("");
    });
    return lines.join("\n").trimEnd() + "\n";
  }

  const api = Object.freeze({KEY, RECOVERY_KEY, UNREADABLE_KEY, MAX_BYTES, fresh, id, validate, createStore, exportBackup, importBackup, exportText});
  root.NotebookData = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
