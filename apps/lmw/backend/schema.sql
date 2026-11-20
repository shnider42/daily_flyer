-- LMW pilot: independent tables. Existing DFE schemas and accounts are untouched.
-- Apply using Supabase apply_migration. API calls use the server's secret key only.
create table public.lmw_events (
  slug text primary key check (slug ~ '^[a-z][a-z0-9-]{0,79}$'),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  is_open boolean not null default true,
  response_limit integer not null default 1000 check (response_limit between 1 and 1000),
  created_at timestamptz not null default now()
);

create table public.lmw_responses (
  id uuid primary key,
  event_slug text not null references public.lmw_events(slug),
  manage_token_hash text not null unique check (manage_token_hash ~ '^[a-f0-9]{64}$'),
  first_name text not null check (char_length(btrim(first_name)) between 1 and 80),
  last_name text not null check (char_length(btrim(last_name)) between 1 and 80),
  graduate_year text not null check (graduate_year in ('current', 'unknown') or (graduate_year ~ '^[0-9]{4}$' and graduate_year between '1987' and '2100')),
  email text not null check (char_length(email) between 3 and 254 and email = lower(btrim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  email_verified boolean not null default false check (email_verified = false),
  phone text not null default '' check (char_length(phone) <= 40),
  current_employer text not null default '' check (char_length(current_employer) <= 160),
  engagement text not null check (engagement in ('yes', 'maybe', 'not_now')),
  interests text[] not null default '{}' check (cardinality(interests) <= 6 and interests <@ array['network','committee','volunteer','mentor','event','idea']::text[]),
  availability text not null default '' check (availability in ('','one_time','occasional','ongoing','unsure')),
  help_needed text not null default '' check (char_length(help_needed) <= 700),
  contact_permission text not null check (contact_permission in ('email','none')),
  phone_permission boolean not null default false,
  privacy_consent boolean not null check (privacy_consent = true),
  consent_version text not null default 'lmw-pilot-v1' check (consent_version = 'lmw-pilot-v1'),
  accepted_at timestamptz not null default now(),
  status text not null default 'new' check (status in ('new','planned','connected','closed')),
  note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '90 days'),
  check (engagement <> 'not_now' or cardinality(interests) = 0),
  check (not phone_permission or (phone <> '' and contact_permission = 'email')),
  check (contact_permission <> 'none' or status <> 'planned')
);
create index lmw_responses_event_created_idx on public.lmw_responses(event_slug, created_at desc);
create index lmw_responses_expiry_idx on public.lmw_responses(expires_at);

create table public.lmw_organizer_keys (
  key_hash text primary key check (key_hash ~ '^[a-f0-9]{64}$'),
  label text not null check (char_length(label) between 1 and 120),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);
create table public.lmw_rate_limits (
  bucket_hash text primary key check (bucket_hash ~ '^[a-f0-9]{64}$'),
  request_count integer not null default 1 check (request_count > 0),
  expires_at timestamptz not null
);
create index lmw_rate_limits_expiry_idx on public.lmw_rate_limits(expires_at);

alter table public.lmw_events enable row level security;
alter table public.lmw_responses enable row level security;
alter table public.lmw_organizer_keys enable row level security;
alter table public.lmw_rate_limits enable row level security;
revoke all on public.lmw_events, public.lmw_responses, public.lmw_organizer_keys, public.lmw_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.lmw_events, public.lmw_responses, public.lmw_organizer_keys, public.lmw_rate_limits to service_role;

create function public.lmw_cleanup_expired() returns void
language sql security invoker set search_path = '' as $$
  delete from public.lmw_responses where expires_at <= now();
  delete from public.lmw_rate_limits where expires_at <= now();
$$;
revoke all on function public.lmw_cleanup_expired() from public, anon, authenticated;
grant execute on function public.lmw_cleanup_expired() to service_role;

-- Atomically enforce the event cap and a generous per-network 15-minute bucket.
-- HMAC bucket identifiers are computed on the Edge Function; raw IPs never enter SQL.
create function public.lmw_submit(
  p_id uuid, p_event text, p_hash text, p_bucket text, p_data jsonb
) returns text
language plpgsql security invoker set search_path = '' as $$
declare
  event_row public.lmw_events%rowtype;
  existing_row public.lmw_responses%rowtype;
  existing_data jsonb;
  bucket_count integer;
begin
  perform public.lmw_cleanup_expired();
  select * into event_row from public.lmw_events where slug = p_event for update;
  if not found then return 'not_found'; end if;
  select * into existing_row from public.lmw_responses where id = p_id and event_slug = p_event for update;
  if found then
    if existing_row.manage_token_hash <> p_hash then return 'conflict'; end if;
    existing_data := jsonb_build_object(
      'first_name', existing_row.first_name, 'last_name', existing_row.last_name,
      'graduate_year', existing_row.graduate_year, 'email', existing_row.email,
      'phone', existing_row.phone, 'current_employer', existing_row.current_employer,
      'engagement', existing_row.engagement, 'interests', existing_row.interests,
      'availability', existing_row.availability, 'help_needed', existing_row.help_needed,
      'contact_permission', existing_row.contact_permission,
      'phone_permission', existing_row.phone_permission, 'privacy_consent', existing_row.privacy_consent
    );
    if existing_data = p_data then return 'existing'; end if;
    -- A lost network response may be followed by an edited retry. Possession of
    -- both the ID and original capability authorizes these participant changes.
    -- Never acknowledge newly withdrawn consent while retaining the old choice.
    update public.lmw_responses set
      first_name = p_data->>'first_name', last_name = p_data->>'last_name',
      graduate_year = p_data->>'graduate_year', email = p_data->>'email',
      phone = p_data->>'phone', current_employer = p_data->>'current_employer',
      engagement = p_data->>'engagement',
      interests = array(select jsonb_array_elements_text(p_data->'interests')),
      availability = p_data->>'availability', help_needed = p_data->>'help_needed',
      contact_permission = p_data->>'contact_permission',
      phone_permission = (p_data->>'phone_permission')::boolean,
      privacy_consent = (p_data->>'privacy_consent')::boolean,
      consent_version = 'lmw-pilot-v1', accepted_at = now(), updated_at = now(),
      expires_at = now() + interval '90 days',
      status = case when p_data->>'contact_permission' = 'none' then 'closed' else 'new' end
      where id = p_id and event_slug = p_event and manage_token_hash = p_hash;
    return 'updated';
  end if;
  if not event_row.is_open then return 'closed'; end if;
  if (select count(*) from public.lmw_responses where event_slug = p_event and expires_at > now()) >= event_row.response_limit then return 'capacity'; end if;
  insert into public.lmw_rate_limits(bucket_hash, request_count, expires_at)
    values(p_bucket, 1, now() + interval '15 minutes')
    on conflict(bucket_hash) do update set request_count = public.lmw_rate_limits.request_count + 1
    returning request_count into bucket_count;
  if bucket_count > 100 then return 'rate_limited'; end if;
  insert into public.lmw_responses (
    id, event_slug, manage_token_hash, first_name, last_name, graduate_year, email,
    phone, current_employer, engagement, interests, availability, help_needed,
    contact_permission, phone_permission, privacy_consent, status
  ) values (
    p_id, p_event, p_hash, p_data->>'first_name', p_data->>'last_name', p_data->>'graduate_year', p_data->>'email',
    p_data->>'phone', p_data->>'current_employer', p_data->>'engagement',
    array(select jsonb_array_elements_text(p_data->'interests')),
    p_data->>'availability', p_data->>'help_needed', p_data->>'contact_permission',
    (p_data->>'phone_permission')::boolean, (p_data->>'privacy_consent')::boolean,
    case when p_data->>'contact_permission' = 'none' then 'closed' else 'new' end
  );
  return 'created';
exception when unique_violation then
  return 'conflict';
end;
$$;
revoke all on function public.lmw_submit(uuid,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.lmw_submit(uuid,text,text,text,jsonb) to service_role;

insert into public.lmw_events(slug, title) values ('networking-night', 'LMW networking night');

comment on table public.lmw_responses is 'Independent LMW pilot responses. Unverified email addresses. Service-only access through lmw-connect. App access expires 90 days after participant save.';
comment on table public.lmw_rate_limits is 'Temporary HMAC network buckets; no raw IP addresses. Remove after 15 minutes.';
