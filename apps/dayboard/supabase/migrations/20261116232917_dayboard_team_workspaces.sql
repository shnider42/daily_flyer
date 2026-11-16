-- Dayboard shared workspaces. Personal browser storage is not involved.
-- Public RPCs are SECURITY INVOKER. Their narrowly granted private workers
-- require a verified account, authorize workspace membership, and validate
-- commands before writing. The only directly readable public table carries
-- workspace metadata/revisions for authorized realtime invalidation.

create schema if not exists dayboard_private;
revoke all on schema dayboard_private from public, anon, authenticated;
grant usage on schema dayboard_private to authenticated;

create table public.dayboard_workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 100),
  owner_id uuid not null references auth.users(id) on delete restrict,
  revision bigint not null default 0 check (revision >= 0),
  next_task_number bigint not null default 1 check (next_task_number between 1 and 9007199254740991),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index dayboard_workspaces_owner on public.dayboard_workspaces(owner_id);

create table dayboard_private.members (
  workspace_id uuid not null references public.dayboard_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (workspace_id,user_id)
);
create unique index dayboard_one_owner on dayboard_private.members(workspace_id) where role='owner';
create index dayboard_members_user on dayboard_private.members(user_id,workspace_id);

create table dayboard_private.areas (
  workspace_id uuid not null references public.dayboard_workspaces(id) on delete cascade,
  id text not null check (id ~ '^[a-z0-9][a-z0-9_-]{0,199}$' and id <> 'all'),
  value jsonb not null,
  version bigint not null default 1 check (version > 0),
  deleted boolean not null default false,
  name_key text generated always as (case when deleted then null else lower(btrim(value->>'name')) end) stored,
  updated_by uuid references auth.users(id) on delete set null,
  position bigint generated always as identity,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id,id),
  unique (workspace_id,name_key) deferrable initially deferred
);
create table dayboard_private.projects (
  workspace_id uuid not null references public.dayboard_workspaces(id) on delete cascade,
  id text not null check (length(btrim(id)) between 1 and 200),
  value jsonb not null,
  area_id text generated always as (value->>'area') stored,
  version bigint not null default 1 check (version > 0),
  deleted boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (workspace_id,id),
  foreign key (workspace_id,area_id) references dayboard_private.areas(workspace_id,id) deferrable initially deferred
);
create index dayboard_projects_area on dayboard_private.projects(workspace_id,area_id);
create table dayboard_private.tasks (
  workspace_id uuid not null references public.dayboard_workspaces(id) on delete cascade,
  id text not null check (length(btrim(id)) between 1 and 200),
  value jsonb not null,
  area_id text generated always as (value->>'area') stored,
  project_id text generated always as (nullif(value->>'projectId','')) stored,
  task_number bigint not null check (task_number between 1 and 9007199254740991),
  version bigint not null default 1 check (version > 0),
  deleted boolean not null default false,
  assignee_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (workspace_id,id),
  unique (workspace_id,task_number),
  foreign key (workspace_id,area_id) references dayboard_private.areas(workspace_id,id) deferrable initially deferred,
  foreign key (workspace_id,project_id) references dayboard_private.projects(workspace_id,id) deferrable initially deferred,
  foreign key (workspace_id,assignee_id) references dayboard_private.members(workspace_id,user_id) deferrable initially deferred
);
create index dayboard_tasks_area on dayboard_private.tasks(workspace_id,area_id);
create index dayboard_tasks_project on dayboard_private.tasks(workspace_id,project_id);
create index dayboard_tasks_assignee on dayboard_private.tasks(workspace_id,assignee_id);
create table dayboard_private.pins (
  workspace_id uuid not null,
  user_id uuid not null,
  task_id text not null,
  pinned boolean not null default false,
  version bigint not null default 1 check (version > 0),
  primary key (workspace_id,user_id,task_id),
  foreign key (workspace_id,user_id) references dayboard_private.members(workspace_id,user_id) on delete cascade,
  foreign key (workspace_id,task_id) references dayboard_private.tasks(workspace_id,id) on delete cascade deferrable initially deferred
);
create index dayboard_pins_task on dayboard_private.pins(workspace_id,task_id);

create table dayboard_private.invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.dayboard_workspaces(id) on delete cascade,
  email text not null check (length(email) between 3 and 254),
  token_hash text not null unique,
  invited_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '7 days'),
  revoked_at timestamptz,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null
);
create index dayboard_invitations_workspace on dayboard_private.invitations(workspace_id,created_at);
create index dayboard_invitations_creator on dayboard_private.invitations(invited_by);
create index dayboard_invitations_acceptor on dayboard_private.invitations(accepted_by);
create table dayboard_private.receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  workspace_id uuid not null references public.dayboard_workspaces(id) on delete cascade,
  operation text not null check (operation in ('create','commit')),
  fingerprint text not null,
  versions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id,request_id)
);
create index dayboard_receipts_workspace on dayboard_private.receipts(workspace_id);
create table dayboard_private.activity (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.dayboard_workspaces(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity text,
  entity_id text,
  created_at timestamptz not null default now()
);
create index dayboard_activity_recent on dayboard_private.activity(workspace_id,id desc);
create index dayboard_activity_actor on dayboard_private.activity(actor_id);

alter table public.dayboard_workspaces enable row level security;
alter table dayboard_private.members enable row level security;
alter table dayboard_private.areas enable row level security;
alter table dayboard_private.projects enable row level security;
alter table dayboard_private.tasks enable row level security;
alter table dayboard_private.pins enable row level security;
alter table dayboard_private.invitations enable row level security;
alter table dayboard_private.receipts enable row level security;
alter table dayboard_private.activity enable row level security;
revoke all on public.dayboard_workspaces from public,anon,authenticated;
revoke all on all tables in schema dayboard_private from public,anon,authenticated;
revoke all on all sequences in schema dayboard_private from public,anon,authenticated;

create function dayboard_private.iso_stamp(p_time timestamptz) returns text
language sql immutable strict set search_path='' as $$
  select to_char(p_time at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$$;
create function dayboard_private.actor() returns uuid
language plpgsql stable security definer set search_path='' as $$
declare v_user uuid:=auth.uid();
begin
  if v_user is null or not exists (
    select 1 from auth.users u where u.id=v_user and u.email_confirmed_at is not null
      and u.email is not null and not coalesce(u.is_anonymous,false)
      and u.deleted_at is null and (u.banned_until is null or u.banned_until <= now())
  ) then raise exception using errcode='42501',message='Sign in with a verified email account to use team workspaces.'; end if;
  return v_user;
end $$;
create function dayboard_private.is_member(p_workspace_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from dayboard_private.members m join auth.users u on u.id=m.user_id
    where m.workspace_id=p_workspace_id and m.user_id=auth.uid()
      and u.email is not null and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
      and u.deleted_at is null and (u.banned_until is null or u.banned_until <= now())
  )
$$;
create policy dayboard_workspace_members_read on public.dayboard_workspaces
  for select to authenticated using ((select dayboard_private.is_member(id)));
grant select on public.dayboard_workspaces to authenticated;

create function dayboard_private.lock_workspace(p_workspace_id uuid,p_owner boolean default false)
returns public.dayboard_workspaces language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=dayboard_private.actor(); v_row public.dayboard_workspaces;
begin
  select w.* into v_row from public.dayboard_workspaces w
    join dayboard_private.members m on m.workspace_id=w.id and m.user_id=v_actor
    where w.id=p_workspace_id and (not p_owner or m.role='owner') for update of w;
  if not found then raise exception using errcode='42501',message='You do not have access to that workspace or action.'; end if;
  -- Membership can be removed while this statement waits for a workspace lock.
  if not exists(select 1 from dayboard_private.members where workspace_id=p_workspace_id and user_id=v_actor and (not p_owner or role='owner')) then
    raise exception using errcode='42501',message='You do not have access to that workspace or action.';
  end if;
  return v_row;
end $$;

-- Match the browser model's trim and UTF-16 string length rules. Otherwise a
-- crafted payload could pass SQL validation but make every browser reject the
-- resulting snapshot (for example a whitespace-only title or long emoji text).
create function dayboard_private.trim_text(p_value text) returns text
language sql immutable strict set search_path='' as $$
  select btrim(p_value,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')
$$;
create function dayboard_private.utf16_length(p_value text) returns integer
language sql immutable strict set search_path='' as $$
  select length(p_value)+length(regexp_replace(p_value collate "C",U&'[\0001-\FFFF]','','g'))
$$;
create function dayboard_private.text_field(p_value jsonb,p_key text,p_max integer,p_required boolean default false)
returns text language plpgsql immutable set search_path='' as $$
declare v_text text;
begin
  if jsonb_typeof(p_value->p_key) is distinct from 'string' then raise exception using errcode='22023',message=p_key||' must be text.'; end if;
  v_text:=p_value->>p_key;
  if dayboard_private.utf16_length(v_text)>p_max or (p_required and length(dayboard_private.trim_text(v_text))=0) then
    raise exception using errcode='22023',message=p_key||' is empty or too long.';
  end if;
  return v_text;
end $$;
create function dayboard_private.check_date(p_value text) returns void
language plpgsql immutable set search_path='' as $$
begin
  if p_value='' then return; end if;
  if p_value !~ '^\d{4}-\d{2}-\d{2}$' or to_char(p_value::date,'YYYY-MM-DD')<>p_value then
    raise exception using errcode='22023',message='Use a real calendar date in YYYY-MM-DD format.';
  end if;
exception when datetime_field_overflow or invalid_datetime_format then
  raise exception using errcode='22023',message='Use a real calendar date in YYYY-MM-DD format.';
end $$;
create function dayboard_private.check_instant(p_value text) returns void
language plpgsql immutable set search_path='' as $$
begin
  if p_value !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$' then
    raise exception using errcode='22023',message='Use an ISO date and time.';
  end if;
  perform dayboard_private.check_date(substr(p_value,1,10));
  perform p_value::timestamptz;
exception when datetime_field_overflow or invalid_datetime_format then
  raise exception using errcode='22023',message='Use a valid ISO date and time.';
end $$;
create function dayboard_private.check_url(p_value text) returns void
language plpgsql immutable set search_path='' as $$
declare v_authority text; v_port text; v_host text;
begin
  if p_value='' then return; end if;
  if p_value !~* '^https?://(\[[0-9a-f:]+\]|[a-z0-9._-]+)(:[0-9]{1,5})?([/?#][^[:cntrl:][:space:]]*)?$' then
    raise exception using errcode='22023',message='Links must use http:// or https:// without credentials.';
  end if;
  v_authority:=split_part(regexp_replace(p_value,'^https?://','','i'),'/',1);
  v_port:=substring(split_part(split_part(v_authority,'?',1),'#',1) from ':([0-9]+)$');
  if v_port is not null and v_port::integer>65535 then raise exception using errcode='22023',message='The link port is invalid.'; end if;
  v_host:=(regexp_match(p_value,'^https?://(\[[0-9a-f:]+\]|[a-z0-9._-]+)','i'))[1];
  if left(v_host,1)='[' then
    if family(substr(v_host,2,length(v_host)-2)::inet)<>6 then raise exception using errcode='22023',message='The link host is invalid.'; end if;
  elsif lower(rtrim(v_host,'.')) ~ '(^|\.)([0-9]+|0x[0-9a-f]*)$' then
    -- WHATWG URL parsing treats numeric final labels as IPv4 addresses. Only
    -- accept the canonical four-part address that the browser model emits.
    if v_host !~ '^([0-9]{1,3}\.){3}[0-9]{1,3}$' or family(v_host::inet)<>4 then raise exception using errcode='22023',message='The link host is invalid.'; end if;
  end if;
exception when invalid_text_representation then
  raise exception using errcode='22023',message='The link host is invalid.';
end $$;
create function dayboard_private.validate_value(p_entity text,p_id text,p_value jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare v_keys text[]; v_key text; v_item jsonb; v_seen text[]:='{}'; v_item_id text; v_text text; v_checklist jsonb:='[]';
begin
  if jsonb_typeof(p_value) is distinct from 'object' or length(btrim(p_id)) not between 1 and 200 then
    raise exception using errcode='22023',message='A record needs an ID and an object value.';
  end if;
  if dayboard_private.text_field(p_value,'id',200,true)<>p_id or dayboard_private.trim_text(p_id)<>p_id then raise exception using errcode='22023',message='Record IDs cannot be changed or contain surrounding whitespace.'; end if;
  if p_entity='area' then
    v_keys:=array['id','name','color'];
    if p_id !~ '^[a-z0-9][a-z0-9_-]{0,199}$' or p_id='all' then raise exception using errcode='22023',message='The area ID is invalid.'; end if;
    v_text:=dayboard_private.trim_text(dayboard_private.text_field(p_value,'name',80,true));
    if dayboard_private.text_field(p_value,'color',20,true) not in ('blue','green','amber','purple','teal','rose','slate') then raise exception using errcode='22023',message='Choose a supported area color.'; end if;
    p_value:=jsonb_set(p_value,'{name}',to_jsonb(v_text));
  elsif p_entity='project' then
    v_keys:=array['id','name','area','url','description','starter','archived'];
    v_text:=dayboard_private.trim_text(dayboard_private.text_field(p_value,'name',200,true));
    p_value:=jsonb_set(p_value,'{name}',to_jsonb(v_text));
    perform dayboard_private.text_field(p_value,'area',200,true);
    perform dayboard_private.text_field(p_value,'description',10000,false);
    perform dayboard_private.check_url(dayboard_private.text_field(p_value,'url',4096,false));
    foreach v_key in array array['starter','archived'] loop
      if jsonb_typeof(p_value->v_key) is distinct from 'boolean' then raise exception using errcode='22023',message=v_key||' must be true or false.'; end if;
    end loop;
  elsif p_entity='task' then
    v_keys:=array['id','number','title','area','status','priority','projectId','notes','due','followUp','effort','today','checklist','createdAt','updatedAt','completedAt','archived','starter','repeat','repeatNextId','url','order'];
    v_text:=dayboard_private.trim_text(dayboard_private.text_field(p_value,'title',500,true));
    p_value:=jsonb_set(p_value,'{title}',to_jsonb(v_text));
    perform dayboard_private.text_field(p_value,'area',200,true);
    perform dayboard_private.text_field(p_value,'projectId',200,false);
    perform dayboard_private.text_field(p_value,'notes',200000,false);
    perform dayboard_private.text_field(p_value,'repeatNextId',200,false);
    if p_value->>'repeatNextId'=p_id then raise exception using errcode='22023',message='A repeating task cannot point to itself.'; end if;
    if dayboard_private.text_field(p_value,'status',20,true) not in ('inbox','next','doing','waiting','done','someday') then raise exception using errcode='22023',message='The task status is invalid.'; end if;
    if dayboard_private.text_field(p_value,'priority',20,true) not in ('high','normal','low') then raise exception using errcode='22023',message='The task priority is invalid.'; end if;
    if dayboard_private.text_field(p_value,'repeat',20,true) not in ('none','daily','weekly','monthly') then raise exception using errcode='22023',message='The recurrence is invalid.'; end if;
    foreach v_key in array array['today','archived','starter'] loop
      if jsonb_typeof(p_value->v_key) is distinct from 'boolean' then raise exception using errcode='22023',message=v_key||' must be true or false.'; end if;
    end loop;
    foreach v_key in array array['number','effort','order'] loop
      if jsonb_typeof(p_value->v_key) is distinct from 'number' or abs((p_value->>v_key)::numeric)>9007199254740991 then raise exception using errcode='22023',message=v_key||' must be a safe number.'; end if;
    end loop;
    if (p_value->>'number')::numeric<0 or trunc((p_value->>'number')::numeric)<>(p_value->>'number')::numeric then raise exception using errcode='22023',message='Task number must be a nonnegative integer.'; end if;
    if (p_value->>'effort')::numeric not in (0,15,30,60,90) then raise exception using errcode='22023',message='Choose a supported estimate.'; end if;
    perform dayboard_private.check_date(dayboard_private.text_field(p_value,'due',10,false));
    perform dayboard_private.check_date(dayboard_private.text_field(p_value,'followUp',10,false));
    perform dayboard_private.check_instant(dayboard_private.text_field(p_value,'createdAt',40,true));
    perform dayboard_private.check_instant(dayboard_private.text_field(p_value,'updatedAt',40,true));
    if p_value->'completedAt' is distinct from 'null'::jsonb then
      perform dayboard_private.check_instant(dayboard_private.text_field(p_value,'completedAt',40,true));
      p_value:=jsonb_set(p_value,'{completedAt}',to_jsonb(dayboard_private.iso_stamp((p_value->>'completedAt')::timestamptz)));
    end if;
    perform dayboard_private.check_url(dayboard_private.text_field(p_value,'url',4096,false));
    if jsonb_typeof(p_value->'checklist') is distinct from 'array' or jsonb_array_length(p_value->'checklist')>500 then raise exception using errcode='22023',message='A checklist may contain at most 500 items.'; end if;
    for v_item in select value from jsonb_array_elements(p_value->'checklist') loop
      if jsonb_typeof(v_item) is distinct from 'object' or exists(select 1 from jsonb_object_keys(v_item) k where k not in ('id','text','done')) then raise exception using errcode='22023',message='The checklist item is invalid.'; end if;
      v_item_id:=dayboard_private.trim_text(dayboard_private.text_field(v_item,'id',200,true));
      v_text:=dayboard_private.trim_text(dayboard_private.text_field(v_item,'text',2000,true));
      if v_item_id=any(v_seen) or jsonb_typeof(v_item->'done') is distinct from 'boolean' then raise exception using errcode='22023',message='Checklist IDs must be unique and completion must be true or false.'; end if;
      v_seen:=array_append(v_seen,v_item_id);
      v_checklist:=v_checklist||jsonb_build_array(jsonb_build_object('id',v_item_id,'text',v_text,'done',v_item->'done'));
    end loop;
    p_value:=jsonb_set(p_value,'{checklist}',v_checklist);
  else raise exception using errcode='22023',message='Unsupported record type.';
  end if;
  if exists(select 1 from jsonb_object_keys(p_value) k where not k=any(v_keys)) then raise exception using errcode='22023',message='The record contains an unsupported field.'; end if;
  return p_value;
end $$;

create function dayboard_private.snapshot(p_workspace_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=dayboard_private.actor(); v_workspace public.dayboard_workspaces; v_role text; v_result jsonb;
begin
  select w.* into v_workspace from public.dayboard_workspaces w
    join dayboard_private.members m on m.workspace_id=w.id and m.user_id=v_actor
    where w.id=p_workspace_id for share of w;
  if not found then raise exception using errcode='42501',message='You do not have access to that workspace.'; end if;
  select role into v_role from dayboard_private.members where workspace_id=p_workspace_id and user_id=v_actor;
  if v_role is null then raise exception using errcode='42501',message='You do not have access to that workspace.'; end if;
  select jsonb_build_object(
    'workspace',jsonb_build_object('id',v_workspace.id,'name',v_workspace.name,'revision',v_workspace.revision,'role',v_role),
    'data',jsonb_build_object(
      'schemaVersion',2,'revision',v_workspace.revision,'updatedAt',dayboard_private.iso_stamp(v_workspace.updated_at),'settings','{}'::jsonb,
      'areas',coalesce((select jsonb_agg(a.value order by a.position) from dayboard_private.areas a where a.workspace_id=p_workspace_id and not a.deleted),'[]'::jsonb),
      'projects',coalesce((select jsonb_agg(p.value order by p.id) from dayboard_private.projects p where p.workspace_id=p_workspace_id and not p.deleted),'[]'::jsonb),
      'tasks',coalesce((select jsonb_agg(t.value||jsonb_build_object('today',coalesce(pin.pinned,false)) order by t.task_number) from dayboard_private.tasks t
        left join dayboard_private.pins pin on pin.workspace_id=t.workspace_id and pin.task_id=t.id and pin.user_id=v_actor
        where t.workspace_id=p_workspace_id and not t.deleted),'[]'::jsonb)
    ),
    'versions',jsonb_build_object(
      'areas',coalesce((select jsonb_object_agg(id,version) from dayboard_private.areas where workspace_id=p_workspace_id),'{}'::jsonb),
      'projects',coalesce((select jsonb_object_agg(id,version) from dayboard_private.projects where workspace_id=p_workspace_id),'{}'::jsonb),
      'tasks',coalesce((select jsonb_object_agg(id,version) from dayboard_private.tasks where workspace_id=p_workspace_id),'{}'::jsonb),
      'pins',coalesce((select jsonb_object_agg(task_id,version) from dayboard_private.pins where workspace_id=p_workspace_id and user_id=v_actor),'{}'::jsonb)
    ),
    'assignees',coalesce((select jsonb_object_agg(id,assignee_id) from dayboard_private.tasks where workspace_id=p_workspace_id and not deleted),'{}'::jsonb),
    'audit',coalesce((select jsonb_object_agg(id,jsonb_build_object('createdBy',created_by,'updatedBy',updated_by)) from dayboard_private.tasks where workspace_id=p_workspace_id and not deleted),'{}'::jsonb),
    'members',coalesce((select jsonb_agg(jsonb_build_object('userId',m.user_id,'email',u.email,
      'displayName',left(coalesce(nullif(btrim(u.raw_user_meta_data->>'display_name'),''),nullif(btrim(u.raw_user_meta_data->>'full_name'),''),split_part(u.email,'@',1)),80),'role',m.role) order by m.joined_at,m.user_id)
      from dayboard_private.members m join auth.users u on u.id=m.user_id where m.workspace_id=p_workspace_id),'[]'::jsonb),
    'activity',coalesce((select jsonb_agg(x.entry order by x.id desc) from (
      select a.id,jsonb_build_object('id',a.id,'actorId',a.actor_id,'action',a.action,'entity',a.entity,'entityId',a.entity_id,'createdAt',dayboard_private.iso_stamp(a.created_at)) entry
      from dayboard_private.activity a where a.workspace_id=p_workspace_id order by a.id desc limit 30) x),'[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

create function dayboard_private.workspaces() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=dayboard_private.actor(); v_result jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'name',w.name,'role',m.role,
    'memberCount',(select count(*) from dayboard_private.members c where c.workspace_id=w.id)) order by w.created_at,w.id),'[]'::jsonb)
    into v_result from public.dayboard_workspaces w join dayboard_private.members m on m.workspace_id=w.id and m.user_id=v_actor;
  return v_result;
end $$;
create function dayboard_private.create_workspace(p_name text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=dayboard_private.actor(); v_id uuid; v_existing dayboard_private.receipts; v_name text:=btrim(p_name); v_hash text;
begin
  if v_name is null or length(v_name) not between 1 and 100 or p_request_id is null then raise exception using errcode='22023',message='Give the workspace a name of 1 to 100 characters.'; end if;
  -- Per-actor lock prevents simultaneous creation retries from creating twice.
  perform 1 from auth.users where id=v_actor for update;
  v_hash:=encode(sha256(convert_to(v_name,'UTF8')),'hex');
  select * into v_existing from dayboard_private.receipts where user_id=v_actor and request_id=p_request_id;
  if found then
    if v_existing.operation<>'create' or v_existing.fingerprint<>v_hash then raise exception using errcode='22023',message='That request ID was already used for another action.'; end if;
    return dayboard_private.snapshot(v_existing.workspace_id);
  end if;
  if (select count(*) from public.dayboard_workspaces where owner_id=v_actor)>=100 then raise exception using errcode='22023',message='This account has reached its workspace limit.'; end if;
  insert into public.dayboard_workspaces(name,owner_id) values(v_name,v_actor) returning id into v_id;
  insert into dayboard_private.members(workspace_id,user_id,role) values(v_id,v_actor,'owner');
  insert into dayboard_private.areas(workspace_id,id,value,updated_by) values(v_id,'general','{"id":"general","name":"General","color":"blue"}',v_actor);
  insert into dayboard_private.receipts(user_id,request_id,workspace_id,operation,fingerprint) values(v_actor,p_request_id,v_id,'create',v_hash);
  insert into dayboard_private.activity(workspace_id,actor_id,action) values(v_id,v_actor,'created workspace');
  return dayboard_private.snapshot(v_id);
end $$;

create function dayboard_private.commit_changes(p_workspace_id uuid,p_request_id uuid,p_changes jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=dayboard_private.actor(); v_workspace public.dayboard_workspaces; v_change jsonb; v_entity text; v_id text; v_operation text;
  v_expected bigint; v_actual bigint; v_value jsonb; v_existing jsonb; v_number bigint; v_assignee uuid; v_seen text[]:='{}'; v_marker text;
  v_hash text; v_receipt dayboard_private.receipts; v_versions jsonb:='{"tasks":{},"projects":{},"areas":{},"pins":{}}'; v_group text; v_stamp text;
begin
  v_workspace:=dayboard_private.lock_workspace(p_workspace_id);
  if p_request_id is null or jsonb_typeof(p_changes) is distinct from 'array' or jsonb_array_length(p_changes)>12000 or octet_length(p_changes::text)>12582912 then
    raise exception using errcode='22023',message='The change batch is invalid or too large.';
  end if;
  v_hash:=encode(sha256(convert_to(p_changes::text,'UTF8')),'hex');
  select * into v_receipt from dayboard_private.receipts where user_id=v_actor and request_id=p_request_id;
  if found then
    if v_receipt.operation<>'commit' or v_receipt.workspace_id<>p_workspace_id or v_receipt.fingerprint<>v_hash then raise exception using errcode='22023',message='That request ID was already used for another action.'; end if;
    return dayboard_private.snapshot(p_workspace_id)||jsonb_build_object('receipt',jsonb_build_object('requestId',p_request_id,'replayed',true,'versions',v_receipt.versions));
  end if;
  v_stamp:=dayboard_private.iso_stamp(clock_timestamp());
  for v_change in select value from jsonb_array_elements(p_changes) loop
    if jsonb_typeof(v_change) is distinct from 'object' or exists(select 1 from jsonb_object_keys(v_change) k where k not in ('entity','id','operation','expectedVersion','value','assigneeId')) then raise exception using errcode='22023',message='The change contains unsupported fields.'; end if;
    v_entity:=dayboard_private.text_field(v_change,'entity',10,true);
    v_id:=dayboard_private.text_field(v_change,'id',200,true);
    v_operation:=dayboard_private.text_field(v_change,'operation',10,true);
    if v_entity not in ('task','project','area','pin') or v_operation not in ('put','delete') or jsonb_typeof(v_change->'expectedVersion') is distinct from 'number'
      or (v_change->>'expectedVersion')::numeric<0 or (v_change->>'expectedVersion')::numeric>9007199254740991
      or trunc((v_change->>'expectedVersion')::numeric)<>(v_change->>'expectedVersion')::numeric then
      raise exception using errcode='22023',message='The change or expected version is invalid.';
    end if;
    v_expected:=(v_change->>'expectedVersion')::bigint; v_actual:=null; v_existing:=null; v_number:=null; v_assignee:=null;
    v_marker:=v_entity||':'||v_id;
    if v_marker=any(v_seen) then raise exception using errcode='22023',message='A batch cannot change the same record twice.'; end if;
    v_seen:=array_append(v_seen,v_marker);
    if v_entity='task' then select version,value,task_number,assignee_id into v_actual,v_existing,v_number,v_assignee from dayboard_private.tasks where workspace_id=p_workspace_id and id=v_id;
    elsif v_entity='project' then select version,value into v_actual,v_existing from dayboard_private.projects where workspace_id=p_workspace_id and id=v_id;
    elsif v_entity='area' then select version,value into v_actual,v_existing from dayboard_private.areas where workspace_id=p_workspace_id and id=v_id;
    else select version into v_actual from dayboard_private.pins where workspace_id=p_workspace_id and user_id=v_actor and task_id=v_id;
    end if;
    if coalesce(v_actual,0)<>v_expected then raise exception using errcode='40001',message='This '||v_entity||' changed. Review the latest version before saving.'; end if;
    if v_operation='delete' and v_actual is null and v_entity<>'pin' then raise exception using errcode='22023',message='The record no longer exists.'; end if;
    if v_entity='pin' then
      if v_operation='put' and (jsonb_typeof(v_change->'value') is distinct from 'object' or jsonb_typeof(v_change->'value'->'pinned') is distinct from 'boolean'
        or exists(select 1 from jsonb_object_keys(v_change->'value') k where k<>'pinned')) then raise exception using errcode='22023',message='A Today selection needs a pinned value.'; end if;
      -- A deletion and its conditional unpin belong in the same transaction;
      -- the task may already be a tombstone earlier in this command batch.
      if not exists(select 1 from dayboard_private.tasks where workspace_id=p_workspace_id and id=v_id
        and (not deleted or v_operation='delete' or not (v_change->'value'->>'pinned')::boolean)) then
        raise exception using errcode='22023',message='That task is no longer available to pin.';
      end if;
      insert into dayboard_private.pins(workspace_id,user_id,task_id,pinned,version)
        values(p_workspace_id,v_actor,v_id,v_operation='put' and (v_change->'value'->>'pinned')::boolean,coalesce(v_actual,0)+1)
        on conflict(workspace_id,user_id,task_id) do update set pinned=excluded.pinned,version=excluded.version;
    else
      if v_operation='put' then v_value:=dayboard_private.validate_value(v_entity,v_id,v_change->'value'); else v_value:=v_existing; end if;
      if v_entity='area' then
        insert into dayboard_private.areas(workspace_id,id,value,version,deleted,updated_by,updated_at) values(p_workspace_id,v_id,v_value,coalesce(v_actual,0)+1,v_operation='delete',v_actor,clock_timestamp())
          on conflict(workspace_id,id) do update set value=excluded.value,version=excluded.version,deleted=excluded.deleted,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
      elsif v_entity='project' then
        insert into dayboard_private.projects(workspace_id,id,value,version,deleted,updated_by,updated_at) values(p_workspace_id,v_id,v_value,coalesce(v_actual,0)+1,v_operation='delete',v_actor,clock_timestamp())
          on conflict(workspace_id,id) do update set value=excluded.value,version=excluded.version,deleted=excluded.deleted,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
      else
        if v_actual is null then
          update public.dayboard_workspaces set next_task_number=next_task_number+1 where id=p_workspace_id returning next_task_number-1 into v_number;
        end if;
        if v_change?'assigneeId' then
          if jsonb_typeof(v_change->'assigneeId') not in ('string','null') then raise exception using errcode='22023',message='Choose a workspace member as assignee.'; end if;
          begin v_assignee:=nullif(v_change->>'assigneeId','')::uuid; exception when invalid_text_representation then raise exception using errcode='22023',message='Choose a workspace member as assignee.'; end;
        end if;
        if v_assignee is not null and not exists(select 1 from dayboard_private.members where workspace_id=p_workspace_id and user_id=v_assignee) then raise exception using errcode='22023',message='The assignee is not a workspace member.'; end if;
        v_value:=v_value||jsonb_build_object('number',v_number,'today',false,'updatedAt',v_stamp,'createdAt',coalesce(v_existing->>'createdAt',v_stamp));
        insert into dayboard_private.tasks(workspace_id,id,value,task_number,version,deleted,assignee_id,created_by,updated_by,updated_at)
          values(p_workspace_id,v_id,v_value,v_number,coalesce(v_actual,0)+1,v_operation='delete',v_assignee,v_actor,v_actor,clock_timestamp())
          on conflict(workspace_id,id) do update set value=excluded.value,version=excluded.version,deleted=excluded.deleted,assignee_id=excluded.assignee_id,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
      end if;
      insert into dayboard_private.activity(workspace_id,actor_id,action,entity,entity_id) values(p_workspace_id,v_actor,case when v_operation='delete' then 'removed' when v_actual is null then 'created' else 'updated' end,v_entity,v_id);
    end if;
    v_group:=case v_entity when 'task' then 'tasks' when 'project' then 'projects' when 'area' then 'areas' else 'pins' end;
    v_versions:=jsonb_set(v_versions,array[v_group,v_id],to_jsonb(coalesce(v_actual,0)+1),true);
  end loop;
  -- Clear personal pins for completed/archived/removed work after explicit pin
  -- commands, so task+pin transactions do not race their own side effects.
  update dayboard_private.pins p set pinned=false,version=p.version+1 from dayboard_private.tasks t
    where t.workspace_id=p_workspace_id and p.workspace_id=t.workspace_id and p.task_id=t.id and p.pinned
      and (t.deleted or (t.value->>'archived')::boolean or t.value->>'status' in ('done','someday'));
  for v_id,v_actual in select task_id,version from dayboard_private.pins where workspace_id=p_workspace_id and user_id=v_actor and (v_versions->'pins')?task_id loop
    v_versions:=jsonb_set(v_versions,array['pins',v_id],to_jsonb(v_actual),true);
  end loop;
  if not exists(select 1 from dayboard_private.areas where workspace_id=p_workspace_id and not deleted) then raise exception using errcode='22023',message='A workspace needs at least one area.'; end if;
  if exists(select 1 from dayboard_private.projects p left join dayboard_private.areas a on a.workspace_id=p.workspace_id and a.id=p.area_id
      where p.workspace_id=p_workspace_id and not p.deleted and (a.id is null or a.deleted)) then raise exception using errcode='22023',message='Every project must belong to an existing area in this workspace.'; end if;
  if exists(select 1 from dayboard_private.tasks t left join dayboard_private.areas a on a.workspace_id=t.workspace_id and a.id=t.area_id
      left join dayboard_private.projects p on p.workspace_id=t.workspace_id and p.id=t.project_id
      where t.workspace_id=p_workspace_id and not t.deleted and (a.id is null or a.deleted or (t.project_id is not null and (p.id is null or p.deleted or p.area_id<>t.area_id)))) then
    raise exception using errcode='22023',message='Every task must use an existing area and a matching project in this workspace.';
  end if;
  if exists(select 1 from dayboard_private.tasks t where t.workspace_id=p_workspace_id and not t.deleted and t.value->>'repeatNextId'<>''
      and not exists(select 1 from dayboard_private.tasks n where n.workspace_id=p_workspace_id and n.id=t.value->>'repeatNextId')) then raise exception using errcode='22023',message='The next recurring task must belong to this workspace.'; end if;
  if exists(select 1 from dayboard_private.tasks where workspace_id=p_workspace_id and not deleted and value->>'repeatNextId'<>'' group by value->>'repeatNextId' having count(*)>1) then raise exception using errcode='22023',message='A recurring occurrence cannot belong to two parent tasks.'; end if;
  if (select count(*) from dayboard_private.tasks where workspace_id=p_workspace_id and not deleted)>10000 or (select count(*) from dayboard_private.projects where workspace_id=p_workspace_id and not deleted)>1000 then raise exception using errcode='22023',message='The workspace has reached its task or project limit.'; end if;
  if (select coalesce(sum(octet_length(v.value::text)),0) from (
      select value from dayboard_private.tasks where workspace_id=p_workspace_id and not deleted union all
      select value from dayboard_private.projects where workspace_id=p_workspace_id and not deleted union all
      select value from dayboard_private.areas where workspace_id=p_workspace_id and not deleted) v)>10485760 then raise exception using errcode='22023',message='The workspace is too large to save.'; end if;
  update public.dayboard_workspaces set revision=revision+1,updated_at=clock_timestamp() where id=p_workspace_id;
  insert into dayboard_private.receipts(user_id,request_id,workspace_id,operation,fingerprint,versions) values(v_actor,p_request_id,p_workspace_id,'commit',v_hash,v_versions);
  return dayboard_private.snapshot(p_workspace_id)||jsonb_build_object('receipt',jsonb_build_object('requestId',p_request_id,'replayed',false,'versions',v_versions));
end $$;

create function dayboard_private.invite(p_workspace_id uuid,p_email text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=dayboard_private.actor(); v_email text:=lower(btrim(p_email)); v_token text; v_invite dayboard_private.invitations;
begin
  perform dayboard_private.lock_workspace(p_workspace_id,true);
  if v_email is null or length(v_email)>254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception using errcode='22023',message='Enter a valid email address.'; end if;
  if exists(select 1 from dayboard_private.members m join auth.users u on u.id=m.user_id where m.workspace_id=p_workspace_id and lower(u.email)=v_email) then raise exception using errcode='22023',message='That person is already a member.'; end if;
  if (select count(*) from dayboard_private.invitations where workspace_id=p_workspace_id and revoked_at is null and accepted_at is null and expires_at>now())>=100 then raise exception using errcode='22023',message='This workspace has too many pending invitations.'; end if;
  update dayboard_private.invitations set revoked_at=now() where workspace_id=p_workspace_id and email=v_email and revoked_at is null and accepted_at is null;
  v_token:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
  insert into dayboard_private.invitations(workspace_id,email,token_hash,invited_by) values(p_workspace_id,v_email,encode(sha256(convert_to(v_token,'UTF8')),'hex'),v_actor) returning * into v_invite;
  return jsonb_build_object('id',v_invite.id,'email',v_invite.email,'token',v_token,'expiresAt',dayboard_private.iso_stamp(v_invite.expires_at));
end $$;
create function dayboard_private.invitations(p_workspace_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
  perform dayboard_private.lock_workspace(p_workspace_id,true);
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'email',email,'expiresAt',dayboard_private.iso_stamp(expires_at),'revoked',revoked_at is not null,'accepted',accepted_at is not null) order by created_at desc),'[]'::jsonb)
    into v_result from dayboard_private.invitations where workspace_id=p_workspace_id and revoked_at is null and accepted_at is null and expires_at>now();
  return v_result;
end $$;
create function dayboard_private.checked_invitation(p_token text) returns dayboard_private.invitations
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=dayboard_private.actor(); v_email text; v_invite dayboard_private.invitations;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception using errcode='42501',message='This invitation is invalid, expired, or belongs to a different email account.'; end if;
  select lower(email) into v_email from auth.users where id=v_actor;
  select * into v_invite from dayboard_private.invitations where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and email=v_email;
  if not found or v_invite.revoked_at is not null or v_invite.expires_at<=now()
    or (v_invite.accepted_at is not null and not (v_invite.accepted_by=v_actor and exists(select 1 from dayboard_private.members where workspace_id=v_invite.workspace_id and user_id=v_actor))) then
    raise exception using errcode='42501',message='This invitation is invalid, expired, or belongs to a different email account.';
  end if;
  return v_invite;
end $$;
create function dayboard_private.invitation_preview(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_invite dayboard_private.invitations:=dayboard_private.checked_invitation(p_token); v_name text;
begin
  select name into v_name from public.dayboard_workspaces where id=v_invite.workspace_id;
  return jsonb_build_object('workspaceName',v_name,'email',v_invite.email,'expiresAt',dayboard_private.iso_stamp(v_invite.expires_at),'alreadyJoined',v_invite.accepted_at is not null);
end $$;
create function dayboard_private.accept_invite(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=dayboard_private.actor(); v_invite dayboard_private.invitations:=dayboard_private.checked_invitation(p_token);
begin
  -- Lock the same workspace row used by revocation and membership mutations.
  perform 1 from public.dayboard_workspaces where id=v_invite.workspace_id for update;
  v_invite:=dayboard_private.checked_invitation(p_token);
  if v_invite.accepted_at is not null then return dayboard_private.snapshot(v_invite.workspace_id); end if;
  if (select count(*) from dayboard_private.members where workspace_id=v_invite.workspace_id)>=100 then raise exception using errcode='22023',message='This workspace has reached its member limit.'; end if;
  insert into dayboard_private.members(workspace_id,user_id,role) values(v_invite.workspace_id,v_actor,'member') on conflict(workspace_id,user_id) do nothing;
  update dayboard_private.invitations set accepted_at=now(),accepted_by=v_actor where id=v_invite.id;
  update public.dayboard_workspaces set revision=revision+1,updated_at=clock_timestamp() where id=v_invite.workspace_id;
  insert into dayboard_private.activity(workspace_id,actor_id,action) values(v_invite.workspace_id,v_actor,'joined workspace');
  return dayboard_private.snapshot(v_invite.workspace_id);
end $$;
create function dayboard_private.revoke_invite(p_workspace_id uuid,p_invitation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform dayboard_private.lock_workspace(p_workspace_id,true);
  update dayboard_private.invitations set revoked_at=now() where workspace_id=p_workspace_id and id=p_invitation_id and accepted_at is null;
  return jsonb_build_object('ok',true);
end $$;
create function dayboard_private.remove_member(p_workspace_id uuid,p_user_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=dayboard_private.actor();
begin
  perform dayboard_private.lock_workspace(p_workspace_id,true);
  if exists(select 1 from dayboard_private.members where workspace_id=p_workspace_id and user_id=p_user_id and role='owner') then raise exception using errcode='22023',message='The workspace owner cannot be removed.'; end if;
  update dayboard_private.tasks set assignee_id=null,version=version+1,updated_by=v_actor,updated_at=clock_timestamp(),value=jsonb_set(value,'{updatedAt}',to_jsonb(dayboard_private.iso_stamp(clock_timestamp()))) where workspace_id=p_workspace_id and assignee_id=p_user_id;
  delete from dayboard_private.members where workspace_id=p_workspace_id and user_id=p_user_id;
  if found then
    update public.dayboard_workspaces set revision=revision+1,updated_at=clock_timestamp() where id=p_workspace_id;
    insert into dayboard_private.activity(workspace_id,actor_id,action) values(p_workspace_id,v_actor,'removed member');
  end if;
  return dayboard_private.snapshot(p_workspace_id);
end $$;

create function public.dayboard_workspaces() returns jsonb language sql security invoker set search_path='' as $$select dayboard_private.workspaces()$$;
create function public.dayboard_create_workspace(p_name text,p_request_id uuid) returns jsonb language sql security invoker set search_path='' as $$select dayboard_private.create_workspace(p_name,p_request_id)$$;
create function public.dayboard_snapshot(p_workspace_id uuid) returns jsonb language sql security invoker set search_path='' as $$select dayboard_private.snapshot(p_workspace_id)$$;
create function public.dayboard_commit(p_workspace_id uuid,p_request_id uuid,p_changes jsonb) returns jsonb language sql security invoker set search_path='' as $$select dayboard_private.commit_changes(p_workspace_id,p_request_id,p_changes)$$;
create function public.dayboard_invite(p_workspace_id uuid,p_email text) returns jsonb language sql security invoker set search_path='' as $$select dayboard_private.invite(p_workspace_id,p_email)$$;
create function public.dayboard_invitations(p_workspace_id uuid) returns jsonb language sql security invoker set search_path='' as $$select dayboard_private.invitations(p_workspace_id)$$;
create function public.dayboard_invitation_preview(p_token text) returns jsonb language sql security invoker set search_path='' as $$select dayboard_private.invitation_preview(p_token)$$;
create function public.dayboard_accept_invite(p_token text) returns jsonb language sql security invoker set search_path='' as $$select dayboard_private.accept_invite(p_token)$$;
create function public.dayboard_revoke_invite(p_workspace_id uuid,p_invitation_id uuid) returns jsonb language sql security invoker set search_path='' as $$select dayboard_private.revoke_invite(p_workspace_id,p_invitation_id)$$;
create function public.dayboard_remove_member(p_workspace_id uuid,p_user_id uuid) returns jsonb language sql security invoker set search_path='' as $$select dayboard_private.remove_member(p_workspace_id,p_user_id)$$;

-- New functions otherwise inherit PUBLIC EXECUTE. Grant only the complete,
-- checked entry points; internal validators/locks cannot be called directly.
revoke all on all functions in schema dayboard_private from public,anon,authenticated;
grant execute on function dayboard_private.is_member(uuid),dayboard_private.workspaces(),dayboard_private.create_workspace(text,uuid),
  dayboard_private.snapshot(uuid),dayboard_private.commit_changes(uuid,uuid,jsonb),dayboard_private.invite(uuid,text),
  dayboard_private.invitations(uuid),dayboard_private.invitation_preview(text),dayboard_private.accept_invite(text),
  dayboard_private.revoke_invite(uuid,uuid),dayboard_private.remove_member(uuid,uuid) to authenticated;
revoke all on function public.dayboard_workspaces(),public.dayboard_create_workspace(text,uuid),public.dayboard_snapshot(uuid),
  public.dayboard_commit(uuid,uuid,jsonb),public.dayboard_invite(uuid,text),public.dayboard_invitations(uuid),
  public.dayboard_invitation_preview(text),public.dayboard_accept_invite(text),public.dayboard_revoke_invite(uuid,uuid),public.dayboard_remove_member(uuid,uuid) from public,anon,authenticated;
grant execute on function public.dayboard_workspaces(),public.dayboard_create_workspace(text,uuid),public.dayboard_snapshot(uuid),
  public.dayboard_commit(uuid,uuid,jsonb),public.dayboard_invite(uuid,text),public.dayboard_invitations(uuid),
  public.dayboard_invitation_preview(text),public.dayboard_accept_invite(text),public.dayboard_revoke_invite(uuid,uuid),public.dayboard_remove_member(uuid,uuid) to authenticated;

-- Only metadata invalidation is published. Private task data is fetched by
-- an authorized snapshot RPC, including after a websocket reconnection.
do $$begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(
    select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='dayboard_workspaces'
  ) then alter publication supabase_realtime add table public.dayboard_workspaces; end if;
end$$;
