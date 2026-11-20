import {
  ApiError, TOKEN, readJsonBody, validateIdentity, validateRecordId,
  validateEventSlug, validateResponse, validateAdminUpdate, validateEventUpdate,
} from './validation.mjs';

// Deliberately public event metadata and intake. Every read/change of a response
// requires its 256-bit management capability, or a separate organizer capability.
const DEFAULT_ORIGINS = ['https://dfe-lmw.onrender.com'];
const EVENT = 'networking-night';
const PARTICIPANT_COLUMNS = [
  'id','event_slug','first_name','last_name','graduate_year','email','phone',
  'current_employer','engagement','interests','availability','help_needed',
  'contact_permission','phone_permission','privacy_consent','consent_version',
  'accepted_at','created_at','updated_at','expires_at',
].join(',');
const ORGANIZER_COLUMNS = `${PARTICIPANT_COLUMNS},email_verified,status,note`;
const utf8 = new TextEncoder();

async function sha256(value) {
  const hash = await crypto.subtle.digest('SHA-256', utf8.encode(value));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

function allowedOrigin(origin, configured) {
  if (!origin) return true; // Server clients carry the same action-level capabilities.
  if (configured.includes(origin)) return true;
  try {
    const parsed = new URL(origin);
    return parsed.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(parsed.hostname);
  } catch { return false; }
}

export function createHandler(env, send = fetch) {
  const apiUrl = env('SUPABASE_URL') ?? '';
  let serviceKey = '';
  try { serviceKey = JSON.parse(env('SUPABASE_SECRET_KEYS') || '{}').default || ''; } catch { /* legacy fallback */ }
  serviceKey ||= env('SUPABASE_SERVICE_ROLE_KEY') || '';
  const origins = [...DEFAULT_ORIGINS, ...(env('LMW_ALLOWED_ORIGINS') || '').split(',').map(s => s.trim()).filter(Boolean)];
  const dbHeaders = { apikey: serviceKey, 'Content-Type': 'application/json' };
  if (!serviceKey.startsWith('sb_secret_')) dbHeaders.Authorization = `Bearer ${serviceKey}`;

  async function db(path, options = {}) {
    const response = await send(`${apiUrl}/rest/v1/${path}`, {
      ...options,
      headers: { ...dbHeaders, ...options.headers },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new ApiError(503, 'The database is temporarily unavailable. Please try again.');
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  function query(table, fields, filters = {}) {
    const params = new URLSearchParams({ select: fields, ...filters });
    return `${table}?${params}`;
  }

  async function cleanup() {
    await db('rpc/lmw_cleanup_expired', { method: 'POST', body: '{}' });
  }

  async function event(slug = EVENT) {
    const rows = await db(query('lmw_events', 'slug,title,is_open', { slug: `eq.${slug}`, limit: '1' }));
    if (!rows?.[0]) throw new ApiError(404, 'This event could not be found. Please check the organizer’s link.');
    return rows[0];
  }

  async function organizer(request) {
    const token = request.headers.get('X-LMW-Organizer-Key') || '';
    if (!TOKEN.test(token)) throw new ApiError(401, 'Please enter a valid organizer access key.');
    const hash = await sha256(token);
    const rows = await db(query('lmw_organizer_keys', 'label,expires_at', {
      key_hash: `eq.${hash}`, is_active: 'eq.true', limit: '1',
    }));
    if (!rows?.[0] || (rows[0].expires_at && new Date(rows[0].expires_at).getTime() <= Date.now())) {
      throw new ApiError(401, 'That organizer access key is invalid or has expired.');
    }
  }

  async function participant(body) {
    const identity = validateIdentity(body);
    const hash = await sha256(identity.manage_token);
    const filter = { id: `eq.${identity.id}`, event_slug: `eq.${EVENT}`, manage_token_hash: `eq.${hash}`, expires_at: `gt.${new Date().toISOString()}` };
    const rows = await db(query('lmw_responses', PARTICIPANT_COLUMNS, { ...filter, limit: '1' }));
    if (!rows?.[0]) throw new ApiError(404, 'That private link is invalid, deleted, or expired.');
    return { filter, record: rows[0] };
  }

  async function rateBucket(request, slug) {
    // These forwarding headers are set by the hosting ingress. If unavailable,
    // a shared fallback bucket limits submissions instead of retaining an IP.
    const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unavailable';
    const window = Math.floor(Date.now() / 900_000);
    const key = await crypto.subtle.importKey('raw', utf8.encode(serviceKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const hash = await crypto.subtle.sign('HMAC', key, utf8.encode(`lmw-submission:${slug}:${window}:${ip.slice(0,128)}`));
    return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2,'0')).join('');
  }

  return async request => {
    const origin = request.headers.get('Origin');
    const headers = {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Vary': 'Origin',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-LMW-Organizer-Key, apikey, authorization',
      'Access-Control-Max-Age': '600',
    };
    if (origin && allowedOrigin(origin, origins)) headers['Access-Control-Allow-Origin'] = origin;
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
    try {
      if (!allowedOrigin(origin, origins)) throw new ApiError(403, 'This request did not come from the event site.');
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
      if (!apiUrl || !serviceKey) throw new ApiError(503, 'This pilot is not connected to its database yet. Please try later.');
      if (request.method === 'GET') {
        const slug = validateEventSlug(new URL(request.url).searchParams.get('event') || EVENT);
        return json({ event: await event(slug) });
      }
      if (request.method !== 'POST') throw new ApiError(405, 'Use the event form to send a response.');
      const body = await readJsonBody(request);
      const action = body.action;
      if (action === 'submit') {
        // A honeypot never reports a save that did not occur.
        if (body.website) throw new ApiError(400, 'Please reload the event form and try again.');
        const identity = validateIdentity(body);
        const slug = validateEventSlug(body.event_slug);
        if (slug !== EVENT) throw new ApiError(404, 'This event could not be found.');
        const data = validateResponse(body.data);
        const result = await db('rpc/lmw_submit', {
          method: 'POST',
          body: JSON.stringify({ p_id: identity.id, p_event: slug, p_hash: await sha256(identity.manage_token), p_bucket: await rateBucket(request, slug), p_data: data }),
        });
        if (result === 'closed') throw new ApiError(409, 'This event is no longer accepting new responses. Existing private links still work.');
        if (result === 'capacity') throw new ApiError(409, 'This pilot has reached its response limit. Please speak to the event organizer.');
        if (result === 'rate_limited') throw new ApiError(429, 'There have been a lot of responses on this network. Please try again in 15 minutes.');
        if (result === 'not_found') throw new ApiError(404, 'This event could not be found.');
        if (result === 'conflict') throw new ApiError(409, 'This form link could not be saved. Please reload and try again.');
        if (!['created','existing','updated'].includes(result)) throw new ApiError(503, 'Your response could not be saved. Please try again.');
        return json({ ok: true, id: identity.id }, result === 'created' ? 201 : 200);
      }

      if (['manage_get','manage_update','manage_delete'].includes(action)) {
        const { filter, record } = await participant(body);
        if (action === 'manage_get') return json({ response: record });
        if (action === 'manage_delete') {
          await db(query('lmw_responses', 'id', filter), { method: 'DELETE' });
          return json({ ok: true, deleted: true });
        }
        const data = validateResponse(body.data);
        const now = new Date();
        const rows = await db(query('lmw_responses', PARTICIPANT_COLUMNS, filter), {
          method: 'PATCH', headers: { Prefer: 'return=representation' },
          body: JSON.stringify({ ...data, status: data.contact_permission === 'none' ? 'closed' : 'new',
            consent_version: 'lmw-pilot-v1', accepted_at: now.toISOString(), updated_at: now.toISOString(),
            expires_at: new Date(now.getTime() + 90 * 86400_000).toISOString() }),
        });
        if (!rows?.[0]) throw new ApiError(404, 'That private link is invalid, deleted, or expired.');
        return json({ ok: true, response: rows[0] });
      }

      if (['admin_list','admin_update','admin_delete','event_update'].includes(action)) {
        await organizer(request);
        await cleanup();
        if (action === 'admin_list') {
          const responses = await db(query('lmw_responses', ORGANIZER_COLUMNS, {
            event_slug: `eq.${EVENT}`, expires_at: `gt.${new Date().toISOString()}`, order: 'created_at.desc', limit: '1000',
          }));
          return json({ responses, event: await event() });
        }
        if (action === 'event_update') {
          const data = validateEventUpdate(body);
          const rows = await db(query('lmw_events', 'slug,title,is_open', { slug: `eq.${EVENT}` }), {
            method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(data),
          });
          if (!rows?.[0]) throw new ApiError(404, 'This event could not be found.');
          return json({ ok: true, event: rows[0] });
        }
        const id = validateRecordId(body.id);
        const filter = { id: `eq.${id}`, event_slug: `eq.${EVENT}`, expires_at: `gt.${new Date().toISOString()}` };
        if (action === 'admin_delete') {
          const deleted = await db(query('lmw_responses', 'id', filter), { method: 'DELETE', headers: { Prefer: 'return=representation' } });
          if (!deleted?.length) throw new ApiError(404, 'This response was already deleted or expired.');
          return json({ ok: true, deleted: true });
        }
        const update = validateAdminUpdate(body);
        if (update.status === 'planned') {
          const rows = await db(query('lmw_responses', 'contact_permission', { ...filter, limit: '1' }));
          if (!rows?.[0]) throw new ApiError(404, 'This response was deleted or expired.');
          if (rows[0].contact_permission !== 'email') throw new ApiError(400, 'This person has not requested follow-up. Please leave them uncontacted.');
        }
        const rows = await db(query('lmw_responses', ORGANIZER_COLUMNS, filter), {
          method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ status: update.status, note: update.note }),
        });
        if (!rows?.[0]) throw new ApiError(404, 'This response was deleted or expired.');
        return json({ ok: true, response: rows[0] });
      }
      throw new ApiError(400, 'This action is not available.');
    } catch (error) {
      if (error instanceof ApiError) return json({ ok: false, error: error.message }, error.status);
      // Deliberately do not log request bodies, addresses, keys, or database errors.
      console.error('LMW endpoint request failed unexpectedly.');
      return json({ ok: false, error: 'Something went wrong. Your changes have not been confirmed. Please try again.' }, 503);
    }
  };
}

if (typeof Deno !== 'undefined') Deno.serve(createHandler(name => Deno.env.get(name)));
