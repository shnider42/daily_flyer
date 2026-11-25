-- Ball Knowledge: isolated, durable score and question-report storage.
-- Public API functions are SECURITY INVOKER. Only bounded private functions
-- cross the table privilege boundary, after verifying a server-only key.
-- The 256-bit key itself is never committed; provision only its SHA-256 hash.

create schema if not exists bk_private;
revoke all on schema bk_private from public, anon, authenticated;
grant usage on schema bk_private to anon, authenticated;

create table bk_private.server_keys (
  name text primary key,
  token_hash bytea not null check (octet_length(token_hash) = 32)
);

create table bk_private.runs (
  id uuid primary key,
  player_id text not null check (player_id ~ '^[a-f0-9]{64}$'),
  nickname text not null check (char_length(btrim(nickname)) between 2 and 20 and nickname !~ '[[:cntrl:]]'),
  score integer not null check (score between 0 and 7875),
  correct integer not null check (correct between 0 and 12),
  total integer not null check (total = 12),
  best_streak integer not null check (best_streak between 0 and correct),
  elapsed_ms integer not null check (elapsed_ms between 0 and 1800000),
  bank_version text not null check (char_length(bank_version) between 1 and 40),
  created_at timestamptz not null default now()
);
create index bk_runs_personal_best on bk_private.runs
  (bank_version, player_id, score desc, correct desc, elapsed_ms, created_at, id);
create index bk_runs_recent on bk_private.runs (bank_version, created_at desc);

create table bk_private.question_reports (
  run_id uuid not null,
  question_id text not null check (char_length(question_id) between 1 and 100),
  reason text not null check (char_length(btrim(reason)) between 3 and 400),
  bank_version text not null check (char_length(bank_version) between 1 and 40),
  created_at timestamptz not null default now(),
  primary key (run_id, question_id)
);
create index bk_reports_question on bk_private.question_reports (question_id, created_at desc);

alter table bk_private.server_keys enable row level security;
alter table bk_private.runs enable row level security;
alter table bk_private.question_reports enable row level security;
revoke all on all tables in schema bk_private from public, anon, authenticated;

create function bk_private.authorized(p_token text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(length(p_token) = 64 and exists (
    select 1 from bk_private.server_keys k
    where k.name = 'game-server'
      and k.token_hash = pg_catalog.sha256(pg_catalog.convert_to(p_token, 'UTF8'))
  ), false);
$$;

create function bk_private.record_run(p_token text, p_run jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not bk_private.authorized(p_token) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_run is null or jsonb_typeof(p_run) <> 'object' then
    raise exception 'Invalid run' using errcode = '22023';
  end if;
  insert into bk_private.runs
    (id, player_id, nickname, score, correct, total, best_streak, elapsed_ms, bank_version)
  values (
    (p_run->>'id')::uuid, p_run->>'player_id', btrim(p_run->>'nickname'),
    (p_run->>'score')::integer, (p_run->>'correct')::integer, (p_run->>'total')::integer,
    (p_run->>'best_streak')::integer, (p_run->>'elapsed_ms')::integer, p_run->>'bank_version'
  ) on conflict (id) do nothing;
  return jsonb_build_object('ok', true, 'id', p_run->>'id');
end;
$$;

create function bk_private.leaderboard(p_period text, p_bank_version text)
returns table (rank bigint, nickname text, score integer, correct integer, total integer, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_period not in ('week', 'all') or p_bank_version is null
     or char_length(p_bank_version) not between 1 and 40 then
    raise exception 'Invalid leaderboard filter' using errcode = '22023';
  end if;
  return query
  with best as (
    select distinct on (r.player_id)
      r.id, r.nickname, r.score, r.correct, r.total, r.elapsed_ms, r.created_at
    from bk_private.runs r
    where r.bank_version = p_bank_version
      and (p_period = 'all' or r.created_at >= now() - interval '7 days')
    order by r.player_id, r.score desc, r.correct desc, r.elapsed_ms, r.created_at, r.id
  )
  select row_number() over (order by b.score desc, b.correct desc, b.elapsed_ms, b.created_at, b.id),
    b.nickname, b.score, b.correct, b.total, b.created_at
  from best b
  order by b.score desc, b.correct desc, b.elapsed_ms, b.created_at, b.id
  limit 50;
end;
$$;

create function bk_private.report_question(p_token text, p_report jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not bk_private.authorized(p_token) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_report is null or jsonb_typeof(p_report) <> 'object' then
    raise exception 'Invalid report' using errcode = '22023';
  end if;
  insert into bk_private.question_reports (run_id, question_id, reason, bank_version)
  values ((p_report->>'run_id')::uuid, p_report->>'question_id',
    btrim(p_report->>'reason'), p_report->>'bank_version')
  on conflict (run_id, question_id) do nothing;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on all functions in schema bk_private from public, anon, authenticated;
grant execute on function bk_private.record_run(text, jsonb) to anon, authenticated;
grant execute on function bk_private.leaderboard(text, text) to anon, authenticated;
grant execute on function bk_private.report_question(text, jsonb) to anon, authenticated;

create function public.bk_record_run(p_token text, p_run jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select bk_private.record_run(p_token, p_run);
$$;
create function public.bk_leaderboard(p_period text, p_bank_version text)
returns table (rank bigint, nickname text, score integer, correct integer, total integer, created_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select * from bk_private.leaderboard(p_period, p_bank_version);
$$;
create function public.bk_report_question(p_token text, p_report jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select bk_private.report_question(p_token, p_report);
$$;
revoke all on function public.bk_record_run(text, jsonb) from public;
revoke all on function public.bk_leaderboard(text, text) from public;
revoke all on function public.bk_report_question(text, jsonb) from public;
grant execute on function public.bk_record_run(text, jsonb) to anon, authenticated;
grant execute on function public.bk_leaderboard(text, text) to anon, authenticated;
grant execute on function public.bk_report_question(text, jsonb) to anon, authenticated;

comment on schema bk_private is 'Ball Knowledge only. No direct client table access. No account or raw network identifiers.';
comment on table bk_private.runs is 'Completed server-scored ranked runs. Nickname and score are public; browser identifier is HMAC hashed.';
comment on table bk_private.question_reports is 'Private question-quality feedback. Reports do not automatically delete questions.';
