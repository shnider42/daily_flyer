-- Closed shared-workspace pilot. Personal browser storage remains unrelated.
-- Applying this migration does NOT register the Auth hook. Follow README.md's
-- activation gate before exposing any hosted signup UI or enabling team mode.

create table dayboard_private.organizer_approvals (
  email text primary key check (
    email=lower(btrim(email)) and length(email) between 3 and 254
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  enabled boolean not null default true,
  workspace_limit integer not null default 3 check (workspace_limit between 1 and 100),
  approved_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table dayboard_private.organizer_approvals enable row level security;
revoke all on dayboard_private.organizer_approvals from public,anon,authenticated,supabase_auth_admin;

-- Start with no approvals. The operator adds specific emails through a trusted
-- SQL connection; user-editable Auth metadata never grants organizer rights.
comment on table dayboard_private.organizer_approvals is
  'Operator-controlled organizer admission and creation quota. Disabling approval does not revoke existing workspace membership.';

-- Auth receives only the columns needed by its invoker hook. It cannot read
-- invitation tokens/hashes, workspace contents, or the operator inventory.
grant usage on schema dayboard_private to supabase_auth_admin;
grant select(email,enabled) on dayboard_private.organizer_approvals to supabase_auth_admin;
create policy dayboard_auth_read_organizer_approval on dayboard_private.organizer_approvals
  for select to supabase_auth_admin using (true);
grant select(email,expires_at,revoked_at,accepted_at) on dayboard_private.invitations to supabase_auth_admin;
create policy dayboard_auth_read_invitation_admission on dayboard_private.invitations
  for select to supabase_auth_admin using (true);
create index dayboard_invitations_admission on dayboard_private.invitations(email,expires_at)
  where revoked_at is null and accepted_at is null;

create function dayboard_private.before_user_created(event jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_email text:=lower(btrim(event->'user'->>'email'));
begin
  if jsonb_typeof(event->'user'->'email')='string'
    and coalesce(event->'user'->'is_anonymous','false'::jsonb)='false'::jsonb
    and length(v_email) between 3 and 254
    and v_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    and (
      exists(select 1 from dayboard_private.organizer_approvals a where a.email=v_email and a.enabled)
      or exists(select 1 from dayboard_private.invitations i where i.email=v_email
        and i.revoked_at is null and i.accepted_at is null and i.expires_at>now())
    ) then
    return '{}'::jsonb;
  end if;
  -- A single response avoids revealing an email's approval/invitation details
  -- or any workspace name. No public RPC accepts an email to query admission.
  return jsonb_build_object('error',jsonb_build_object('http_code',403,
    'message','Shared Dayboard access requires a current invitation or host approval.'));
end $$;
revoke all on function dayboard_private.before_user_created(jsonb) from public,anon,authenticated,supabase_auth_admin;
grant execute on function dayboard_private.before_user_created(jsonb) to supabase_auth_admin;

create function dayboard_private.capabilities() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=dayboard_private.actor(); v_limit integer:=0; v_count bigint;
begin
  select a.workspace_limit into v_limit from dayboard_private.organizer_approvals a
    join auth.users u on lower(btrim(u.email))=a.email
    where u.id=v_actor and a.enabled;
  select count(*) into v_count from public.dayboard_workspaces where owner_id=v_actor;
  return jsonb_build_object('mayCreateWorkspace',coalesce(v_limit,0)>v_count,
    'workspaceLimit',coalesce(v_limit,0),'ownedWorkspaceCount',v_count);
end $$;
create function public.dayboard_capabilities() returns jsonb
language sql stable security invoker set search_path='' as $$select dayboard_private.capabilities()$$;
revoke all on function dayboard_private.capabilities(),public.dayboard_capabilities() from public,anon,authenticated,supabase_auth_admin;
grant execute on function dayboard_private.capabilities(),public.dayboard_capabilities() to authenticated;

create or replace function dayboard_private.create_workspace(p_name text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=dayboard_private.actor(); v_id uuid; v_existing dayboard_private.receipts;
  v_name text:=btrim(p_name); v_hash text; v_email text; v_limit integer;
begin
  if v_name is null or length(v_name) not between 1 and 100 or p_request_id is null then
    raise exception using errcode='22023',message='Give the workspace a name of 1 to 100 characters.';
  end if;
  -- Serialize quota checks and retries for this actual account. Recheck the
  -- verified identity after waiting; an Auth ban/email change may have raced.
  select lower(btrim(email)) into v_email from auth.users where id=v_actor for update;
  perform dayboard_private.actor();
  v_hash:=encode(sha256(convert_to(v_name,'UTF8')),'hex');
  select * into v_existing from dayboard_private.receipts where user_id=v_actor and request_id=p_request_id;
  if found then
    if v_existing.operation<>'create' or v_existing.fingerprint<>v_hash then
      raise exception using errcode='22023',message='That request ID was already used for another action.';
    end if;
    -- A retry returns the already-created authorized board; it never allocates
    -- another board, even if approval was subsequently disabled or quota fell.
    return dayboard_private.snapshot(v_existing.workspace_id);
  end if;
  -- FOR SHARE also serializes this decision with operator approval changes.
  select workspace_limit into v_limit from dayboard_private.organizer_approvals
    where email=v_email and enabled for share;
  if not found then
    raise exception using errcode='42501',message='Creating shared workspaces requires host approval.';
  end if;
  if (select count(*) from public.dayboard_workspaces where owner_id=v_actor)>=v_limit then
    raise exception using errcode='22023',message='This account has reached its approved workspace limit.';
  end if;
  insert into public.dayboard_workspaces(name,owner_id) values(v_name,v_actor) returning id into v_id;
  insert into dayboard_private.members(workspace_id,user_id,role) values(v_id,v_actor,'owner');
  insert into dayboard_private.areas(workspace_id,id,value,updated_by)
    values(v_id,'general','{"id":"general","name":"General","color":"blue"}',v_actor);
  insert into dayboard_private.receipts(user_id,request_id,workspace_id,operation,fingerprint)
    values(v_actor,p_request_id,v_id,'create',v_hash);
  insert into dayboard_private.activity(workspace_id,actor_id,action) values(v_id,v_actor,'created workspace');
  return dayboard_private.snapshot(v_id);
end $$;
revoke all on function dayboard_private.create_workspace(text,uuid) from public,anon,authenticated,supabase_auth_admin;
grant execute on function dayboard_private.create_workspace(text,uuid) to authenticated;

-- Operator-only metadata. INVOKER prevents a future accidental SELECT grant
-- from borrowing the view owner's privileges. Do not expose this schema/API.
create view dayboard_private.host_inventory with (security_invoker=true) as
select
  w.id as workspace_id,w.name as workspace_name,w.owner_id,u.email as owner_email,
  w.created_at,w.updated_at,
  m.member_count,i.pending_invitation_count,i.invitation_history_count,
  t.task_count,p.project_count,a.area_count,
  t.removed_count+p.removed_count+a.removed_count as removed_record_count,
  t.live_bytes+p.live_bytes+a.live_bytes as live_model_bytes,
  t.retained_bytes+p.retained_bytes+a.retained_bytes as retained_model_bytes,
  pins.pin_record_count,r.receipt_count,h.activity_count,
  greatest(w.updated_at,h.last_activity_at) as last_activity_at
from public.dayboard_workspaces w join auth.users u on u.id=w.owner_id
cross join lateral (
  select count(*) as member_count from dayboard_private.members where workspace_id=w.id
) m
cross join lateral (
  select count(*) filter (where revoked_at is null and accepted_at is null and expires_at>now()) as pending_invitation_count,
    count(*) as invitation_history_count from dayboard_private.invitations where workspace_id=w.id
) i
cross join lateral (
  select count(*) filter (where not deleted) as task_count,count(*) filter (where deleted) as removed_count,
    coalesce(sum(octet_length(value::text)) filter (where not deleted),0) as live_bytes,
    coalesce(sum(octet_length(value::text)),0) as retained_bytes
    from dayboard_private.tasks where workspace_id=w.id
) t
cross join lateral (
  select count(*) filter (where not deleted) as project_count,count(*) filter (where deleted) as removed_count,
    coalesce(sum(octet_length(value::text)) filter (where not deleted),0) as live_bytes,
    coalesce(sum(octet_length(value::text)),0) as retained_bytes
    from dayboard_private.projects where workspace_id=w.id
) p
cross join lateral (
  select count(*) filter (where not deleted) as area_count,count(*) filter (where deleted) as removed_count,
    coalesce(sum(octet_length(value::text)) filter (where not deleted),0) as live_bytes,
    coalesce(sum(octet_length(value::text)),0) as retained_bytes
    from dayboard_private.areas where workspace_id=w.id
) a
cross join lateral (
  select count(*) as pin_record_count from dayboard_private.pins where workspace_id=w.id
) pins
cross join lateral (
  select count(*) as receipt_count from dayboard_private.receipts where workspace_id=w.id
) r
cross join lateral (
  select count(*) as activity_count,max(created_at) as last_activity_at from dayboard_private.activity where workspace_id=w.id
) h;
revoke all on dayboard_private.host_inventory from public,anon,authenticated,supabase_auth_admin;
comment on view dayboard_private.host_inventory is
  'Operator-only counts and serialized model-payload sizes, including tombstones. Not total PostgreSQL disk usage. Contains no task bodies, notes, invitation tokens or token hashes.';
