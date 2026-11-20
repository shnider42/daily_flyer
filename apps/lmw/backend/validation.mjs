/** Shared, dependency-free validation for the LMW pilot edge endpoint. */
export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const INTERESTS = new Set(['network', 'committee', 'volunteer', 'mentor', 'event', 'idea']);
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const SINGLE_LINE_CONTROL = /[\r\n\t\u0000-\u001F\u007F]/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const TOKEN = /^[0-9a-f]{64}$/;

export function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError(400, 'Please send a valid form.');
  }
  return value;
}

function text(value, name, max, { required = false, multiline = false } = {}) {
  if (value == null && !required) return '';
  if (typeof value !== 'string') throw new ApiError(400, `Please check ${name}.`);
  const result = value.trim();
  if ((required && !result) || result.length > max || (multiline ? CONTROL : SINGLE_LINE_CONTROL).test(result)) {
    throw new ApiError(400, `Please check ${name}${result.length > max ? ` (${max} characters maximum)` : ''}.`);
  }
  return result;
}

function choice(value, allowed, name) {
  if (!allowed.includes(value)) throw new ApiError(400, `Please choose ${name}.`);
  return value;
}

export function validateIdentity(body) {
  if (typeof body.id !== 'string' || !UUID.test(body.id) || typeof body.manage_token !== 'string' || !TOKEN.test(body.manage_token)) {
    throw new ApiError(401, 'That private link is invalid or has expired.');
  }
  return { id: body.id.toLowerCase(), manage_token: body.manage_token };
}

export function validateRecordId(value) {
  if (typeof value !== 'string' || !UUID.test(value)) throw new ApiError(400, 'Please select a valid response.');
  return value.toLowerCase();
}

export function validateEventSlug(value) {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9-]{0,79}$/.test(value)) {
    throw new ApiError(400, 'Please use the event link provided by your organizer.');
  }
  return value;
}

export function validateResponse(value, currentYear = new Date().getUTCFullYear()) {
  const input = object(value);
  const graduate_year = text(input.graduate_year, 'your LMW graduate year', 16, { required: true });
  if (!['current', 'unknown'].includes(graduate_year) && (!/^\d{4}$/.test(graduate_year) || +graduate_year < 1987 || +graduate_year > currentYear)) {
    throw new ApiError(400, 'Please choose your LMW graduate year, Current participant, or Not sure.');
  }
  const email = text(input.email, 'your email address', 254, { required: true }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, 'Please enter a valid email address.');
  const engagement = choice(input.engagement, ['yes', 'maybe', 'not_now'], 'how you feel about getting involved');
  const contact_permission = choice(input.contact_permission, ['email', 'none'], 'whether an organizer may follow up');
  const phone = text(input.phone, 'your phone number', 40);
  if (phone && !/^[+\d\s().x-]{5,40}$/i.test(phone)) throw new ApiError(400, 'Please check your phone number, or leave it blank.');
  if (input.phone_permission !== undefined && typeof input.phone_permission !== 'boolean') throw new ApiError(400, 'Please check your phone contact preference.');
  if (input.phone_permission === true && !phone) throw new ApiError(400, 'Add a phone number to allow phone contact.');
  const interests = input.interests ?? [];
  if (!Array.isArray(interests) || interests.length > 6 || interests.some(item => typeof item !== 'string' || !INTERESTS.has(item))) {
    throw new ApiError(400, 'Please choose interests from the options shown.');
  }
  if (input.privacy_consent !== true) throw new ApiError(400, 'Please confirm that you have read how your information will be used.');
  return {
    first_name: text(input.first_name, 'your first name', 80, { required: true }),
    last_name: text(input.last_name, 'your last name', 80, { required: true }),
    graduate_year, email, phone,
    current_employer: text(input.current_employer, 'your employer', 160),
    engagement,
    interests: engagement === 'not_now' ? [] : [...new Set(interests)],
    availability: choice(input.availability ?? '', ['', 'one_time', 'occasional', 'ongoing', 'unsure'], 'an availability option'),
    help_needed: text(input.help_needed, 'what the community could help you with', 700, { multiline: true }),
    contact_permission,
    phone_permission: contact_permission === 'email' && input.phone_permission === true && !!phone,
    privacy_consent: true,
  };
}

export function validateAdminUpdate(body) {
  return {
    id: validateRecordId(body.id),
    status: choice(body.status, ['new', 'planned', 'connected', 'closed'], 'a response status'),
    note: text(body.note ?? '', 'the organizer note', 500, { multiline: true }),
  };
}

export function validateEventUpdate(body) {
  if (typeof body.is_open !== 'boolean') throw new ApiError(400, 'Please choose whether this event is accepting responses.');
  return { title: text(body.title, 'the event title', 120, { required: true }), is_open: body.is_open };
}

export async function readJsonBody(request, maximum = 12 * 1024) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new ApiError(415, 'Please send the form as JSON.');
  }
  const declared = request.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || +declared > maximum)) throw new ApiError(413, 'The form is too large. Please shorten your answers.');
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'Please send a valid form.');
  const chunks = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximum) { await reader.cancel(); throw new ApiError(413, 'The form is too large. Please shorten your answers.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return object(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))); }
  catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(400, 'Please send a valid form.'); }
}
