/* Password-protected notebook access. No password or notebook is stored here. */
(function (root) {
  "use strict";

  const ENDPOINT = "https://uwbhjgvpaetrhfvcpvsg.supabase.co/functions/v1/best-man-notebook";
  const SESSION_KEY = "best-man-notebook:session:v1";
  const TIMEOUT_MS = 12000;
  const MAX_RESPONSE_LENGTH = 2_100_000;

  function error(code, message, status = 0, extra = {}) {
    const result = new Error(message);
    result.name = "NotebookCloudError";
    result.code = code;
    result.status = status;
    result.retryable = ["NETWORK", "TIMEOUT", "SERVER", "RATE_LIMITED"].includes(code);
    Object.assign(result, extra);
    return result;
  }

  function plain(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function validToken(value) {
    return typeof value === "string" && /^[A-Za-z0-9._~-]{16,1024}$/.test(value);
  }

  function validExpiry(value) {
    return typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value));
  }

  function validVersion(value) {
    return Number.isSafeInteger(value) && value >= 0;
  }

  function createClient(options = {}) {
    const fetcher = options.fetch || (typeof root.fetch === "function" ? root.fetch.bind(root) : null);
    const clock = options.now || Date.now;
    const later = options.setTimeout || root.setTimeout.bind(root);
    const cancelLater = options.clearTimeout || root.clearTimeout.bind(root);
    const Abort = options.AbortController || root.AbortController;
    const timeout = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : TIMEOUT_MS;
    let storage = options.sessionStorage;
    if (!Object.prototype.hasOwnProperty.call(options, "sessionStorage")) {
      try { storage = root.sessionStorage; } catch (_) { storage = null; }
    }
    let token = null;
    let expiresAt = null;
    let sessionStored = false;
    let initialized = false;
    let authEpoch = 0;

    function clearSession() {
      token = null;
      expiresAt = null;
      sessionStored = false;
      if (!storage) return true;
      try { storage.removeItem(SESSION_KEY); return true; } catch (_) { return false; }
    }

    function rememberSession(nextToken, nextExpiry) {
      token = nextToken;
      expiresAt = nextExpiry;
      sessionStored = false;
      if (storage) {
        try {
          storage.setItem(SESSION_KEY, JSON.stringify({token, expiresAt}));
          sessionStored = true;
        } catch (_) {
          // Keep the session in memory when browser storage is unavailable.
          // A refresh will simply require the password again.
        }
      }
    }

    function init() {
      if (!initialized) {
        initialized = true;
        if (storage) {
          try {
            const raw = storage.getItem(SESSION_KEY);
            if (raw && raw.length < 1500) {
              const session = JSON.parse(raw);
              if (plain(session) && validToken(session.token) && validExpiry(session.expiresAt) && Date.parse(session.expiresAt) > clock()) {
                token = session.token;
                expiresAt = session.expiresAt;
                sessionStored = true;
              } else clearSession();
            } else if (raw) clearSession();
          } catch (_) { clearSession(); }
        }
      }
      if (expiresAt && Date.parse(expiresAt) <= clock()) clearSession();
      return {hasSession: Boolean(token), expiresAt, sessionStored};
    }

    function hasSession() {
      return init().hasSession;
    }

    function retrySeconds(response) {
      const value = response.headers && response.headers.get ? response.headers.get("Retry-After") : null;
      if (!value) return 60;
      if (/^\d+$/.test(value)) return Math.max(1, Math.min(86400, Number(value)));
      const time = Date.parse(value);
      return Number.isFinite(time) ? Math.max(1, Math.min(86400, Math.ceil((time - clock()) / 1000))) : 60;
    }

    function responseError(response, body, path) {
      const code = plain(body) && typeof body.code === "string" ? body.code : "";
      switch (response.status) {
        case 400:
          return error("INVALID_REQUEST", "That change could not be accepted. Your writing is still here.", 400);
        case 401:
          return error("LOCKED", path === "/login" ? "That password did not open the notebook. Please try again." : "Please enter your password to open the notebook again.", 401);
        case 403:
          return code === "setup_forbidden"
            ? error("SETUP_FORBIDDEN", "This setup link can no longer be used.", 403)
            : error("FORBIDDEN", "This page is not allowed to open the notebook.", 403);
        case 409:
          return code === "already_initialized"
            ? error("ALREADY_INITIALIZED", "The notebook already has a password. Sign in instead.", 409)
            : error("CONFLICT", "The notebook changed on another device. Your edits are still here; review the newer copy before saving.", 409);
        case 413:
          return error("TOO_LARGE", "This notebook is too large to save. Download a copy before shortening any entries.", 413);
        case 429:
          return error("RATE_LIMITED", "Too many attempts. Please wait a little before trying again.", 429, {retryAfter: retrySeconds(response)});
        default:
          return error("SERVER", "The saved notebook is not available right now. Please try again shortly.", response.status);
      }
    }

    async function request(path, {method = "GET", body, authenticated = false, sessionToken} = {}) {
      init();
      const usedToken = sessionToken === undefined ? token : sessionToken;
      if (authenticated && !usedToken) throw error("LOCKED", "Enter your password to open the notebook.", 401);
      if (!fetcher || !Abort) throw error("NETWORK", "This browser could not connect to the saved notebook.");
      const controller = new Abort();
      let timedOut = false;
      const timer = later(() => { timedOut = true; controller.abort(); }, timeout);
      const headers = {Accept: "application/json"};
      if (body !== undefined) headers["Content-Type"] = "application/json";
      if (authenticated) headers.Authorization = `Bearer ${usedToken}`;
      try {
        const response = await fetcher(ENDPOINT + path, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
          credentials: "omit",
          cache: "no-store",
          redirect: "error",
          referrerPolicy: "no-referrer",
          mode: "cors",
        });
        const raw = await response.text();
        if (raw.length > MAX_RESPONSE_LENGTH) throw error("INVALID_RESPONSE", "The saved notebook could not be read. Your current writing has not been changed.", response.status);
        let result;
        try { result = raw ? JSON.parse(raw) : null; } catch (_) { result = null; }
        if (!response.ok) {
          if (response.status === 401 && authenticated && usedToken === token) {
            authEpoch += 1;
            clearSession();
          }
          throw responseError(response, result, path);
        }
        if (!plain(result)) throw error("INVALID_RESPONSE", "The saved notebook could not be read. Your current writing has not been changed.", response.status);
        return result;
      } catch (cause) {
        if (timedOut) throw error("TIMEOUT", "The connection took too long. Your writing is still here; try again.");
        if (cause && cause.name === "NotebookCloudError") throw cause;
        // Never attach response bodies, request data, passwords, or tokens to errors.
        throw error("NETWORK", "Could not connect. Check your connection and try again.");
      } finally {
        cancelLater(timer);
      }
    }

    function checkedData(value) {
      if (value === null) return null;
      const validate = options.validate || (root.NotebookData && root.NotebookData.validate);
      if (typeof validate !== "function") throw error("INVALID_RESPONSE", "The notebook could not be opened. Reload this page and try again.");
      try { return validate(value); }
      catch (_) { throw error("INVALID_RESPONSE", "The saved notebook could not be read. Your current writing has not been changed."); }
    }

    function checkedState(result) {
      if (!validVersion(result.version) || !Object.prototype.hasOwnProperty.call(result, "data")) {
        throw error("INVALID_RESPONSE", "The saved notebook could not be read. Your current writing has not been changed.");
      }
      return {data: checkedData(result.data), version: result.version};
    }

    function password(value) {
      if (typeof value !== "string" || value.length < 8 || value.length > 128) {
        throw error("INVALID_REQUEST", "Use a password between 8 and 128 characters.");
      }
      return value;
    }

    async function status() {
      const result = await request("/status");
      if (typeof result.initialized !== "boolean") throw error("INVALID_RESPONSE", "The notebook could not be reached. Please try again.");
      return {initialized: result.initialized};
    }

    async function authenticate(path, body) {
      const epoch = ++authEpoch;
      clearSession();
      const result = await request(path, {method: "POST", body});
      if (epoch !== authEpoch) throw error("CANCELED", "The sign-in was canceled.");
      if (!validToken(result.token) || !validExpiry(result.expiresAt) || Date.parse(result.expiresAt) <= clock()) {
        throw error("INVALID_RESPONSE", "The sign-in could not be completed. Please try again.");
      }
      const state = checkedState(result);
      rememberSession(result.token, result.expiresAt);
      return {...state, expiresAt, sessionStored};
    }

    async function setup(setupToken, secret) {
      if (typeof setupToken !== "string" || setupToken.length < 16 || setupToken.length > 1024 || /[\s\u0000-\u001f]/.test(setupToken)) {
        throw error("SETUP_FORBIDDEN", "Open the original setup link to choose your password.");
      }
      return authenticate("/setup", {setupToken, password: password(secret)});
    }

    async function login(secret) {
      return authenticate("/login", {password: password(secret)});
    }

    async function load() {
      return checkedState(await request("/state", {authenticated: true}));
    }

    async function save(state, expectedVersion) {
      if (!validVersion(expectedVersion)) throw error("INVALID_REQUEST", "Open the latest notebook before saving these changes.");
      const data = checkedData(state);
      if (data === null) throw error("INVALID_REQUEST", "There is no notebook to save.");
      const result = await request("/state", {method: "PUT", authenticated: true, body: {data, expectedVersion}});
      if (!validVersion(result.version) || result.version <= expectedVersion || !validExpiry(result.updatedAt)) {
        throw error("INVALID_RESPONSE", "The save could not be confirmed. Keep this page open and check the latest copy before trying again.");
      }
      return {version: result.version, updatedAt: result.updatedAt};
    }

    async function logout() {
      init();
      const oldToken = token;
      authEpoch += 1;
      const sessionCleared = clearSession();
      if (!oldToken) return {ok: true, revoked: true, sessionCleared};
      try {
        const result = await request("/logout", {method: "POST", authenticated: true, sessionToken: oldToken});
        if (result.ok !== true) throw error("INVALID_RESPONSE", "Sign-out could not be confirmed.");
        return {ok: true, revoked: true, sessionCleared};
      } catch (cause) {
        // A 401 means the token is already invalid, so sign-out is complete.
        if (cause.code === "LOCKED") return {ok: true, revoked: true, sessionCleared};
        return {
          ok: true,
          revoked: false,
          sessionCleared,
          warning: sessionCleared
            ? "Locked on this tab. The server could not confirm sign-out."
            : "Sign-out could not be confirmed. Close this tab and try again when connected.",
        };
      }
    }

    init();
    return Object.freeze({init, hasSession, status, setup, login, load, save, logout});
  }

  const client = createClient();
  const api = Object.freeze({...client, ENDPOINT, SESSION_KEY, TIMEOUT_MS, createClient});
  root.NotebookCloud = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
