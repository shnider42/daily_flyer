// This endpoint is authenticated by a random server key checked inside the
// service-role-only RPC. No browser, anon key, or client state may use it.
const headers = { 'content-type': 'application/json', 'cache-control': 'no-store' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return reply({ ok: false, error: 'method_not_allowed' }, 405);
  const bearer = req.headers.get('authorization') ?? '';
  if (!/^Bearer [A-Za-z0-9_-]{40,100}$/.test(bearer)) return reply({ ok: false, error: 'unauthorized' }, 401);
  const maxBytes = 12_500_000;
  if (Number(req.headers.get('content-length') ?? 0) > maxBytes) return reply({ ok: false, error: 'too_large' }, 413);
  try {
    const reader = req.body?.getReader();
    if (!reader) return reply({ ok: false, error: 'missing_body' }, 400);
    const chunks: Uint8Array[] = []; let total = 0;
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      total += value.byteLength;
      if (total > maxBytes) { await reader.cancel(); return reply({ ok: false, error: 'too_large' }, 413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const body = JSON.parse(new TextDecoder().decode(bytes));
    if (!['ping', 'load', 'save'].includes(body.op)) return reply({ ok: false, error: 'invalid_operation' }, 400);
    const upstream = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/farwake_store`, {
      method: 'POST',
      headers: {
        apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ p_secret: bearer.slice(7), p_op: body.op,
        p_realm: body.realmId ?? null, p_expected: body.expectedVersion ?? null,
        p_snapshot: body.snapshot ?? null }),
      signal: AbortSignal.timeout(15000),
    });
    if (!upstream.ok) return reply({ ok: false, error: 'storage_unavailable' }, 503);
    const result = await upstream.json();
    return reply(result, result.ok ? 200 : result.conflict ? 409 : result.error === 'unauthorized' ? 401 : 400);
  } catch (error) {
    return reply({ ok: false, error: error instanceof SyntaxError ? 'invalid_json' : 'storage_unavailable' }, error instanceof SyntaxError ? 400 : 503);
  }
});
