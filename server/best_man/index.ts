/** Private notebook API. No third-party packages or browser-visible admin key. */

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): unknown;
};

const ORIGINS = new Set([
  "https://for-my-brother.onrender.com",
  "http://127.0.0.1:8765",
  "http://localhost:8765",
]);
const PASSWORD_ITERATIONS = 600_000;
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_REQUEST_BYTES = 2_000_000;
const MAX_DATA_BYTES = MAX_REQUEST_BYTES - 512;
const ENCODER = new TextEncoder();
const HEX_64 = /^[0-9a-f]{64}$/;

type Config = {
  env: (name: string) => string | undefined;
  fetchFn?: typeof fetch;
  now?: () => number;
};
type DocumentRow = {
  id: string;
  password_salt: string | null;
  password_hash: string | null;
  password_iterations: number;
  setup_token_hash: string | null;
  data: Record<string, unknown> | null;
  version: number;
};

class ApiError extends Error {
  status: number;
  code: string;
  retryAfter: number | undefined;
  constructor(status: number, code: string, message: string, retryAfter?: number) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

function hex(bytes: ArrayBuffer | Uint8Array): string {
  return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, "0")).join("");
}

function unhex(value: string): Uint8Array {
  return Uint8Array.from(value.match(/.{2}/g) || [], (part) => parseInt(part, 16));
}

export async function sha256(value: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", ENCODER.encode(value)));
}

export async function passwordHash(password: string, salt: string, iterations = PASSWORD_ITERATIONS): Promise<string> {
  const key = await crypto.subtle.importKey("raw", ENCODER.encode(password), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({name: "PBKDF2", salt: unhex(salt), iterations, hash: "SHA-256"}, key, 256));
}

function equalHash(left: string, right: string): boolean {
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < 64; index++) mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  return mismatch === 0;
}

function randomHex(bytes: number): string {
  return hex(crypto.getRandomValues(new Uint8Array(bytes)));
}

function invalidData(): never {
  throw new ApiError(400, "invalid_data", "This notebook could not be saved. Keep a downloaded copy and try again.");
}

function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalidData();
  const result = value as Record<string, unknown>;
  const present = Object.keys(result);
  if (present.length !== keys.length || present.some((key) => !keys.includes(key))) invalidData();
  return result;
}

function textValue(value: unknown, max: number): void {
  if (typeof value !== "string" || value.length > max) invalidData();
}

function timestamp(value: unknown): void {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) invalidData();
  const date = new Date(value as string);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) invalidData();
}

function calendarDate(value: unknown): void {
  if (value === "") return;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalidData();
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) invalidData();
}

function booleanValue(value: unknown): void {
  if (typeof value !== "boolean") invalidData();
}

function choice(value: unknown, choices: string[]): void {
  if (typeof value !== "string" || !choices.includes(value)) invalidData();
}

export function validateData(value: unknown): Record<string, unknown> {
  const data = record(value, ["version", "updatedAt", "notes", "tasks", "events", "people", "speech", "composer", "details", "prefs"]);
  if (data.version !== 1) invalidData();
  timestamp(data.updatedAt);
  textValue(data.speech, 100000);
  const composer = record(data.composer, ["text", "tag"]);
  textValue(composer.text, 20000);
  choice(composer.tag, ["note", "speech", "ask", "weekend"]);
  const details = record(data.details, ["brother", "partner", "weddingDate", "venue", "stay", "travel", "anything"]);
  textValue(details.brother, 300); textValue(details.partner, 300);
  calendarDate(details.weddingDate); textValue(details.venue, 2000);
  textValue(details.stay, 10000); textValue(details.travel, 10000); textValue(details.anything, 20000);
  const prefs = record(data.prefs, ["theme"]);
  choice(prefs.theme, ["paper", "dark"]);
  const fields: Record<string, string[]> = {
    notes: ["id", "text", "tag", "pinned", "createdAt", "updatedAt"],
    tasks: ["id", "title", "section", "date", "notes", "done", "createdAt", "updatedAt"],
    events: ["id", "title", "date", "time", "location", "notes", "createdAt", "updatedAt"],
    people: ["id", "name", "role", "phone", "email", "notes", "createdAt", "updatedAt"],
  };
  for (const [kind, keys] of Object.entries(fields)) {
    const items = data[kind];
    if (!Array.isArray(items) || items.length > 1500) invalidData();
    const ids = new Set();
    for (const item of items as unknown[]) {
      const entry = record(item, keys);
      if (typeof entry.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(entry.id) || ids.has(entry.id)) invalidData();
      ids.add(entry.id);
      timestamp(entry.createdAt); timestamp(entry.updatedAt);
      if (kind === "notes") {
        textValue(entry.text, 20000); choice(entry.tag, ["note", "speech", "ask", "weekend"]); booleanValue(entry.pinned);
      } else {
        textValue(entry.notes, 20000);
        if (kind === "people") {
          textValue(entry.name, 300); textValue(entry.role, 300); textValue(entry.phone, 120); textValue(entry.email, 320);
        } else {
          textValue(entry.title, 500); calendarDate(entry.date);
          if (kind === "tasks") {
            choice(entry.section, ["before", "weekend", "day"]); booleanValue(entry.done);
          } else {
            textValue(entry.location, 2000);
            if (typeof entry.time !== "string" || (entry.time !== "" && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(entry.time))) invalidData();
          }
        }
      }
    }
  }
  if (ENCODER.encode(JSON.stringify(data)).byteLength > MAX_DATA_BYTES) invalidData();
  return data;
}

async function readJson(request: Request, maxBytes: number): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new ApiError(400, "invalid_request", "Send a JSON request.");
  }
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > maxBytes) throw new ApiError(413, "payload_too_large", "This notebook is too large to save.");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "invalid_request", "The request is empty.");
  const chunks: Uint8Array[] = [];
  let count = 0;
  try {
    while (true) {
      const {value, done} = await reader.read();
      if (done) break;
      count += value.byteLength;
      if (count > maxBytes) {
        await reader.cancel();
        throw new ApiError(413, "payload_too_large", "This notebook is too large to save.");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(count);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const result = JSON.parse(new TextDecoder("utf-8", {fatal: true}).decode(bytes));
    if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("Expected object");
    return result;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "invalid_request", "The request could not be read.");
  }
}

function validatePassword(value: unknown): string {
  if (typeof value !== "string" || value.length < 8 || value.length > 128) {
    throw new ApiError(400, "invalid_request", "Use a password between 8 and 128 characters.");
  }
  return value;
}

export function createHandler(config: Config): (request: Request) => Promise<Response> {
  const fetchFn = config.fetchFn || fetch;
  const now = config.now || Date.now;
  let cachedSettings: {url: string; key: string; legacy: boolean} | undefined;
  function settings() {
    if (cachedSettings) return cachedSettings;
    const url = config.env("SUPABASE_URL");
    let modernKey = "";
    try { modernKey = JSON.parse(config.env("SUPABASE_SECRET_KEYS") || "{}").default || ""; } catch { /* legacy fallback */ }
    const key = modernKey || config.env("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!url || !key) throw new Error("Backend is not configured");
    cachedSettings = {url: url.replace(/\/$/, ""), key, legacy: !key.startsWith("sb_secret_")};
    return cachedSettings;
  }
  async function rest(path: string, method = "GET", body?: unknown, represent = false): Promise<unknown> {
    const {url, key, legacy} = settings();
    const headers: Record<string, string> = {apikey: key, Accept: "application/json"};
    if (legacy) headers.Authorization = `Bearer ${key}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (represent) headers.Prefer = "return=representation";
    const response = await fetchFn(`${url}/rest/v1/${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error("Notebook database request failed");
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
  async function limit(request: Request, scope: string): Promise<void> {
    const {key} = settings();
    // Prefer the gateway's single address; the global SQL budget remains in
    // effect even if upstream address headers are absent or manipulated.
    const forwarded = request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
    const address = (request.headers.get("cf-connecting-ip") || forwarded || "unavailable").slice(0, 128);
    const hmacKey = await crypto.subtle.importKey("raw", ENCODER.encode(key), {name: "HMAC", hash: "SHA-256"}, false, ["sign"]);
    const identity = `best-man:${new Date(now()).toISOString().slice(0, 10)}:${address}`;
    const ipHash = hex(await crypto.subtle.sign("HMAC", hmacKey, ENCODER.encode(identity)));
    const result = await rest("rpc/best_man_check_attempt", "POST", {p_ip_hash: ipHash, p_scope: scope}) as {allowed: boolean; retry_after: number};
    if (!result?.allowed) throw new ApiError(429, "rate_limited", "Too many attempts. Please wait a little and try again.", Math.max(1, Number(result?.retry_after) || 60));
  }
  async function document(): Promise<DocumentRow> {
    const rows = await rest("best_man_document?id=eq.main&select=id,password_salt,password_hash,password_iterations,setup_token_hash,data,version&limit=1") as DocumentRow[];
    if (!rows?.[0]) throw new Error("Notebook has not been provisioned");
    return rows[0];
  }
  async function authenticate(request: Request): Promise<string> {
    const match = /^Bearer ([0-9a-f]{64})$/.exec(request.headers.get("authorization") || "");
    if (!match) throw new ApiError(401, "unauthorized", "Please unlock your notebook again.");
    const tokenHash = await sha256(match[1]);
    const rows = await rest(`best_man_sessions?token_hash=eq.${tokenHash}&document_id=eq.main&expires_at=gt.${encodeURIComponent(new Date(now()).toISOString())}&select=token_hash&limit=1`) as unknown[];
    if (!rows?.length) throw new ApiError(401, "unauthorized", "Please unlock your notebook again.");
    return tokenHash;
  }
  async function issueSession(doc: DocumentRow) {
    const token = randomHex(32);
    const expiresAt = new Date(now() + SESSION_MS).toISOString();
    await rest("best_man_sessions", "POST", {token_hash: await sha256(token), document_id: "main", expires_at: expiresAt});
    return {token, expiresAt, data: doc.data, version: Number(doc.version)};
  }
  return async function handler(request: Request): Promise<Response> {
    const origin = request.headers.get("origin") || "";
    const allowedOrigin = ORIGINS.has(origin);
    const headers = new Headers({
      "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff", "Vary": "Origin",
    });
    if (allowedOrigin) {
      headers.set("Access-Control-Allow-Origin", origin);
      headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
      headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
      headers.set("Access-Control-Expose-Headers", "Retry-After");
      headers.set("Access-Control-Max-Age", "600");
    }
    function response(body: unknown, status = 200): Response { return new Response(JSON.stringify(body), {status, headers}); }
    try {
      if ((origin && !allowedOrigin) || (!allowedOrigin && !["GET", "HEAD"].includes(request.method))) {
        throw new ApiError(403, "forbidden_origin", "Open this notebook from its website.");
      }
      if (request.method === "OPTIONS") return new Response(null, {status: 204, headers});
      const action = new URL(request.url).pathname.split("/").filter(Boolean).at(-1);
      const methods: Record<string, string[]> = {status: ["GET"], setup: ["POST"], login: ["POST"], state: ["GET", "PUT"], logout: ["POST"]};
      if (!action || !methods[action]) throw new ApiError(404, "not_found", "This notebook action does not exist.");
      if (!methods[action].includes(request.method)) throw new ApiError(405, "invalid_method", "This request method is not supported.");
      await limit(request, ["status", "login", "setup"].includes(action) ? action : "state");
      if (action === "status") {
        const rows = await rest("best_man_document?id=eq.main&select=password_hash&limit=1") as Array<{password_hash: string | null}>;
        if (!rows?.length) throw new Error("Notebook has not been provisioned");
        return response({initialized: Boolean(rows[0].password_hash)});
      }
      if (action === "setup") {
        const body = await readJson(request, 4096);
        const password = validatePassword(body.password);
        if (typeof body.setupToken !== "string" || body.setupToken.length < 32 || body.setupToken.length > 256) {
          throw new ApiError(403, "setup_forbidden", "Use your private setup link to create the notebook password.");
        }
        const doc = await document();
        if (doc.password_hash) throw new ApiError(409, "already_initialized", "A password has already been created. Unlock the notebook with it.");
        const setupHash = await sha256(body.setupToken);
        if (!doc.setup_token_hash || !equalHash(setupHash, doc.setup_token_hash)) {
          throw new ApiError(403, "setup_forbidden", "This setup link is not valid.");
        }
        const salt = randomHex(16);
        const hash = await passwordHash(password, salt);
        const rows = await rest(`best_man_document?id=eq.main&password_hash=is.null&setup_token_hash=eq.${setupHash}&select=id,data,version`, "PATCH", {
          password_salt: salt, password_hash: hash, password_iterations: PASSWORD_ITERATIONS,
          setup_token_hash: null, updated_at: new Date(now()).toISOString(),
        }, true) as DocumentRow[];
        if (!rows?.length) throw new ApiError(409, "already_initialized", "A password has already been created. Unlock the notebook with it.");
        return response(await issueSession(rows[0]));
      }
      if (action === "login") {
        const body = await readJson(request, 4096);
        const password = validatePassword(body.password);
        const doc = await document();
        const hash = await passwordHash(password, doc.password_salt || "00000000000000000000000000000000", doc.password_iterations || PASSWORD_ITERATIONS);
        if (!doc.password_hash || !equalHash(hash, doc.password_hash)) {
          throw new ApiError(401, "invalid_credentials", "That password didn’t open the notebook. Please try again.");
        }
        return response(await issueSession(doc));
      }
      const tokenHash = await authenticate(request);
      if (action === "logout") {
        await rest(`best_man_sessions?token_hash=eq.${tokenHash}`, "DELETE");
        return response({ok: true});
      }
      if (request.method === "GET") {
        const rows = await rest("best_man_document?id=eq.main&select=data,version&limit=1") as DocumentRow[];
        if (!rows?.length) throw new Error("Notebook has not been provisioned");
        return response({data: rows[0].data, version: Number(rows[0].version)});
      }
      const body = await readJson(request, MAX_REQUEST_BYTES);
      if (!Number.isSafeInteger(body.expectedVersion) || Number(body.expectedVersion) < 0 || Number(body.expectedVersion) >= Number.MAX_SAFE_INTEGER) {
        throw new ApiError(400, "invalid_request", "The saved notebook version is missing. Reload the saved copy before trying again.");
      }
      const data = validateData(body.data);
      const updatedAt = new Date(now()).toISOString();
      const nextVersion = Number(body.expectedVersion) + 1;
      const rows = await rest(`best_man_document?id=eq.main&version=eq.${body.expectedVersion}&select=version`, "PATCH", {
        data, version: nextVersion, updated_at: updatedAt,
      }, true) as Array<{version: number}>;
      if (!rows?.length) throw new ApiError(409, "version_conflict", "The notebook changed on another device. Download your current copy before loading the newer one.");
      return response({version: Number(rows[0].version), updatedAt});
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.retryAfter) headers.set("Retry-After", String(error.retryAfter));
        return response({error: error.message, code: error.code}, error.status);
      }
      // Never log request bodies, passwords, session tokens, or database errors.
      return response({error: "The notebook could not reach its saved copy. Please try again.", code: "server_error"}, 500);
    }
  };
}

if (typeof Deno !== "undefined") {
  Deno.serve(createHandler({env: (name) => Deno.env.get(name)}));
}
