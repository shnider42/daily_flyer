-- Farwake persistence: server-only access, atomic compare-and-swap snapshots.
-- The deployment key hash is inserted separately and never committed.
create schema if not exists farwake;
revoke all on schema farwake from public, anon, authenticated;
grant usage on schema farwake to service_role;

create table if not exists farwake.config (
  singleton boolean primary key default true check (singleton),
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$')
);
create table if not exists farwake.realms (
  realm_id text primary key check (realm_id ~ '^[A-Za-z0-9_-]{4,64}$'),
  version bigint not null default 1 check (version > 0),
  snapshot jsonb not null,
  updated_at timestamptz not null default now()
);
alter table farwake.config enable row level security;
alter table farwake.realms enable row level security;
revoke all on all tables in schema farwake from public, anon, authenticated;
grant select on farwake.config to service_role;
grant select, insert, update on farwake.realms to service_role;
create policy farwake_config_server on farwake.config for select to service_role using (true);
create policy farwake_realms_server on farwake.realms for all to service_role using (true) with check (true);

create or replace function public.farwake_store(
  p_secret text,
  p_op text,
  p_realm text default null,
  p_expected bigint default null,
  p_snapshot jsonb default null
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare current_version bigint; current_snapshot jsonb; new_version bigint;
begin
  if p_secret is null or length(p_secret) < 40 or not exists (
    select 1 from farwake.config where singleton
      and key_hash = encode(sha256(convert_to(p_secret, 'UTF8')), 'hex')
  ) then return jsonb_build_object('ok',false,'error','unauthorized'); end if;
  if p_op = 'ping' then return jsonb_build_object('ok',true); end if;
  if p_realm is null or p_realm !~ '^[A-Za-z0-9_-]{4,64}$' then
    return jsonb_build_object('ok',false,'error','invalid_realm');
  end if;
  if p_op = 'load' then
    select version,snapshot into current_version,current_snapshot from farwake.realms where realm_id=p_realm;
    return jsonb_build_object('ok',true,'version',coalesce(current_version,0),'snapshot',current_snapshot);
  elsif p_op = 'save' then
    if p_expected is null or p_expected < 0 or p_snapshot is null
      or jsonb_typeof(p_snapshot) <> 'object' or octet_length(p_snapshot::text) > 12000000 then
      return jsonb_build_object('ok',false,'error','invalid_snapshot');
    end if;
    perform pg_advisory_xact_lock(hashtextextended('farwake:' || p_realm, 0));
    select version into current_version from farwake.realms where realm_id=p_realm for update;
    current_version := coalesce(current_version,0);
    if current_version <> p_expected then
      return jsonb_build_object('ok',false,'conflict',true,'version',current_version);
    end if;
    new_version := current_version + 1;
    insert into farwake.realms(realm_id,version,snapshot,updated_at)
      values(p_realm,new_version,p_snapshot,now())
      on conflict(realm_id) do update set version=excluded.version,snapshot=excluded.snapshot,updated_at=excluded.updated_at;
    return jsonb_build_object('ok',true,'version',new_version);
  end if;
  return jsonb_build_object('ok',false,'error','invalid_operation');
end $$;
revoke all on function public.farwake_store(text,text,text,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.farwake_store(text,text,text,bigint,jsonb) to service_role;
