-- Dedicated notebook records only. This does not change Supabase Auth or any
-- existing DFE tables. Seed setup_token_hash separately with a one-time secret.

create table if not exists public.best_man_document (
  id text primary key default 'main' check (id = 'main'),
  password_salt text check (password_salt is null or password_salt ~ '^[0-9a-f]{32}$'),
  password_hash text check (password_hash is null or password_hash ~ '^[0-9a-f]{64}$'),
  password_iterations integer not null default 600000 check (password_iterations between 600000 and 2000000),
  setup_token_hash text check (setup_token_hash is null or setup_token_hash ~ '^[0-9a-f]{64}$'),
  data jsonb default null,
  version bigint not null default 0 check (version between 0 and 9007199254740990),
  updated_at timestamptz not null default now(),
  check ((password_hash is null) = (password_salt is null)),
  check (password_hash is null or setup_token_hash is null),
  check (data is null or coalesce(
    jsonb_typeof(data) = 'object' and data -> 'version' = '1'::jsonb
    and octet_length(data::text) <= 2200000, false
  ))
);

create table if not exists public.best_man_sessions (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  document_id text not null default 'main' references public.best_man_document(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (expires_at > created_at and expires_at <= created_at + interval '31 days')
);
create index if not exists best_man_sessions_expiry_idx on public.best_man_sessions(expires_at);
create index if not exists best_man_sessions_document_idx on public.best_man_sessions(document_id);

-- One current window per pseudonymous address/scope. The all-zero hash is a
-- global budget, charged before creating any per-address row; this bounds the
-- number of live rows even if a caller changes its claimed address repeatedly.
create table if not exists public.best_man_attempts (
  ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  scope text not null check (scope in ('login', 'setup', 'status', 'state')),
  attempts integer not null default 1 check (attempts between 1 and 1000000),
  expires_at timestamptz not null,
  primary key (ip_hash, scope)
);
create index if not exists best_man_attempts_expiry_idx on public.best_man_attempts(expires_at);

alter table public.best_man_document enable row level security;
alter table public.best_man_sessions enable row level security;
alter table public.best_man_attempts enable row level security;
revoke all on public.best_man_document, public.best_man_sessions, public.best_man_attempts from public, anon, authenticated;
grant select, insert, update, delete on public.best_man_document, public.best_man_sessions, public.best_man_attempts to service_role;

create or replace function public.best_man_check_attempt(p_ip_hash text, p_scope text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_expiry timestamptz;
  v_seconds integer;
  v_limit integer;
  v_global_limit integer;
  v_count integer;
  v_global_hash text := repeat('0', 64);
begin
  if p_ip_hash !~ '^[0-9a-f]{64}$' or p_ip_hash = v_global_hash then
    raise exception 'Invalid rate-limit identity';
  end if;
  case p_scope
    when 'login' then v_seconds := 900; v_limit := 10; v_global_limit := 300;
    when 'setup' then v_seconds := 900; v_limit := 6; v_global_limit := 100;
    when 'status' then v_seconds := 60; v_limit := 60; v_global_limit := 3000;
    when 'state' then v_seconds := 60; v_limit := 180; v_global_limit := 10000;
    else raise exception 'Invalid rate-limit scope';
  end case;
  delete from public.best_man_attempts where expires_at <= v_now;
  delete from public.best_man_sessions where expires_at <= v_now;
  v_expiry := to_timestamp((floor(extract(epoch from v_now) / v_seconds) + 1) * v_seconds);

  insert into public.best_man_attempts as stored (ip_hash, scope, attempts, expires_at)
  values (v_global_hash, p_scope, 1, v_expiry)
  on conflict (ip_hash, scope) do update
    set attempts = case when stored.expires_at <= v_now then 1 else least(stored.attempts + 1, 1000000) end,
        expires_at = greatest(stored.expires_at, excluded.expires_at)
  returning attempts, expires_at into v_count, v_expiry;
  if v_count > v_global_limit then
    return jsonb_build_object('allowed', false, 'retry_after', greatest(1, ceil(extract(epoch from v_expiry - v_now))));
  end if;

  insert into public.best_man_attempts as stored (ip_hash, scope, attempts, expires_at)
  values (p_ip_hash, p_scope, 1, v_expiry)
  on conflict (ip_hash, scope) do update
    set attempts = case when stored.expires_at <= v_now then 1 else least(stored.attempts + 1, 1000000) end,
        expires_at = greatest(stored.expires_at, excluded.expires_at)
  returning attempts, expires_at into v_count, v_expiry;
  return jsonb_build_object('allowed', v_count <= v_limit, 'retry_after', greatest(1, ceil(extract(epoch from v_expiry - v_now))));
end;
$$;
revoke all on function public.best_man_check_attempt(text, text) from public, anon, authenticated;
grant execute on function public.best_man_check_attempt(text, text) to service_role;

insert into public.best_man_document (id) values ('main') on conflict (id) do nothing;

comment on table public.best_man_document is 'Single private wedding notebook; accessible only through the dedicated password-authenticated Edge Function.';
comment on table public.best_man_attempts is 'Short-lived HMAC address identifiers and global rate budgets; no raw IP addresses.';
