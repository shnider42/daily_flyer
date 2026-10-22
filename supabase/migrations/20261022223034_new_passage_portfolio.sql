-- New Passage only. No HLLV tables, memberships, Auth settings, or users change.
create schema new_passage_private;
revoke all on schema new_passage_private from public, anon, authenticated;
grant usage on schema new_passage_private to anon, authenticated;

create table new_passage_private.editors (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table new_passage_private.entries (
  id uuid primary key default gen_random_uuid(),
  draft jsonb not null,
  published jsonb,
  version integer not null default 1 check(version > 0),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null
);
create index np_entries_updated_by on new_passage_private.entries(updated_by);
alter table new_passage_private.editors enable row level security;
alter table new_passage_private.entries enable row level security;
revoke all on all tables in schema new_passage_private from public, anon, authenticated;

-- A separate allowlist, verified email and an existing live Auth session are required.
create function new_passage_private.is_editor() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists (
  select 1 from new_passage_private.editors e
  join auth.users u on u.id=e.user_id
  join auth.sessions s on s.user_id=u.id
  where e.user_id=auth.uid() and e.active
    and u.email_confirmed_at is not null
    and (u.banned_until is null or u.banned_until < now())
    and s.id::text=auth.jwt()->>'session_id'
    and (s.not_after is null or s.not_after > now())
 );
$$;
create function new_passage_private.require_editor() returns uuid
language plpgsql stable security definer set search_path='' as $$
begin
 if not new_passage_private.is_editor() then
   raise exception 'Portfolio editor access is not assigned to this account, or the session has ended.' using errcode='42501';
 end if;
 return auth.uid();
end $$;

create function new_passage_private.clean_content(entry_id uuid, content jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare k text; limit_n int; cleaned jsonb:='{}'; val text; sort_n int; image_path text;
begin
 if content is null or jsonb_typeof(content)<>'object' or octet_length(content::text)>18000 then
  raise exception 'Entry content is invalid or too large.' using errcode='22023';
 end if;
 foreach k in array array['title','category','organization','period','summary','story','outcome','link_url','image_path','image_alt','accent'] loop
  if content ? k and jsonb_typeof(content->k)<>'string' then
   raise exception 'Entry fields must be text.' using errcode='22023';
  end if;
  val:=btrim(coalesce(content->>k,''));
  limit_n:=case k when 'title' then 100 when 'category' then 40 when 'organization' then 120 when 'period' then 60 when 'summary' then 300 when 'story' then 4000 when 'outcome' then 1200 when 'link_url' then 500 when 'image_path' then 180 when 'image_alt' then 200 else 10 end;
  if length(val)>limit_n then raise exception 'Entry field exceeds its length limit.' using errcode='22023'; end if;
  cleaned:=cleaned||jsonb_build_object(k,val);
 end loop;
 if length(cleaned->>'title')<3 or length(cleaned->>'summary')<10 then
  raise exception 'Add a title of at least 3 characters and a summary of at least 10 characters.' using errcode='22023';
 end if;
 if cleaned->>'category' not in ('Coaching','Education','Leadership','International experience','Community','Other') or cleaned->>'accent' not in ('aqua','warm','mint','navy') then
  raise exception 'Choose a supported category and card color.' using errcode='22023';
 end if;
 if cleaned->>'link_url'<>'' and cleaned->>'link_url' !~ '^https://[^[:space:]<>]+$' then
  raise exception 'Supporting links must start with https://.' using errcode='22023';
 end if;
 if coalesce(content->>'sort_order','0') !~ '^[0-9]{1,3}$' then
  raise exception 'Display order must be an integer from 0 to 999.' using errcode='22023';
 end if;
 sort_n:=coalesce(content->>'sort_order','0')::int;
 image_path:=cleaned->>'image_path';
 if image_path<>'' then
  if image_path !~ ('^'||entry_id::text||'/[a-f0-9-]{36}\.(jpg|png|webp)$')
    or not exists(select 1 from storage.objects where bucket_id='new-passage-portfolio' and name=image_path)
    or length(cleaned->>'image_alt')<3 then
   raise exception 'Upload a photo for this entry and add a photo description.' using errcode='22023';
  end if;
 end if;
 return cleaned||jsonb_build_object('sort_order',sort_n);
end $$;

create function new_passage_private.public_entries() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(published||jsonb_build_object('id',id)
   order by (published->>'sort_order')::int,published_at desc,id),'[]')
 from new_passage_private.entries where published is not null;
$$;
create function new_passage_private.editor_entries() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform new_passage_private.require_editor();
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'draft',draft,'version',version,
  'published',published is not null,'has_changes',draft is distinct from published,'updated_at',updated_at)
  order by updated_at desc,id),'[]') into result from new_passage_private.entries;
 return result;
end $$;
create function new_passage_private.save_entry(entry_id uuid, expected_version integer, content jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=new_passage_private.require_editor(); row_data new_passage_private.entries; cleaned jsonb;
begin
 if entry_id is null or expected_version is null or expected_version<0 then
  raise exception 'Entry identity is missing.' using errcode='22023';
 end if;
 cleaned:=new_passage_private.clean_content(entry_id,content);
 perform pg_catalog.pg_advisory_xact_lock(781204,1);
 select * into row_data from new_passage_private.entries where id=entry_id for update;
 if found then
  if row_data.version<>expected_version then raise exception 'This entry changed elsewhere. Reload it before saving.' using errcode='40001'; end if;
  update new_passage_private.entries set draft=cleaned,version=version+1,updated_at=now(),updated_by=actor where id=entry_id;
 else
  if expected_version<>0 then raise exception 'This entry no longer exists. Reload saved entries.' using errcode='40001'; end if;
  if (select count(*) from new_passage_private.entries)>=200 then raise exception 'The portfolio has reached its 200-entry limit.' using errcode='54000'; end if;
  insert into new_passage_private.entries(id,draft,updated_by) values(entry_id,cleaned,actor);
 end if;
 return new_passage_private.editor_entries();
end $$;
create function new_passage_private.set_publication(entry_id uuid, expected_version integer, make_public boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=new_passage_private.require_editor(); row_data new_passage_private.entries;
begin
 if make_public is null or expected_version is null then raise exception 'Choose a publication action.' using errcode='22023'; end if;
 select * into row_data from new_passage_private.entries where id=entry_id for update;
 if not found or row_data.version<>expected_version then raise exception 'This entry changed elsewhere. Reload it before publishing.' using errcode='40001'; end if;
 if make_public then perform new_passage_private.clean_content(entry_id,row_data.draft); end if;
 update new_passage_private.entries set published=case when make_public then draft else null end,
  published_at=case when make_public then now() else null end,version=version+1,updated_at=now(),updated_by=actor where id=entry_id;
 return new_passage_private.editor_entries();
end $$;

-- Public API exposes narrow functions, never the draft table or editor roster.
create function public.np_portfolio() returns jsonb language sql security invoker set search_path='' as $$ select new_passage_private.public_entries() $$;
create function public.np_editor_entries() returns jsonb language sql security invoker set search_path='' as $$ select new_passage_private.editor_entries() $$;
create function public.np_save_entry(entry_id uuid,expected_version integer,content jsonb) returns jsonb language sql security invoker set search_path='' as $$ select new_passage_private.save_entry(entry_id,expected_version,content) $$;
create function public.np_set_publication(entry_id uuid,expected_version integer,make_public boolean) returns jsonb language sql security invoker set search_path='' as $$ select new_passage_private.set_publication(entry_id,expected_version,make_public) $$;
revoke all on all functions in schema new_passage_private from public,anon,authenticated;
revoke all on function public.np_portfolio(),public.np_editor_entries(),public.np_save_entry(uuid,integer,jsonb),public.np_set_publication(uuid,integer,boolean) from public,anon,authenticated;
grant execute on function public.np_portfolio(),new_passage_private.public_entries() to anon,authenticated;
grant execute on function public.np_editor_entries(),public.np_save_entry(uuid,integer,jsonb),public.np_set_publication(uuid,integer,boolean),new_passage_private.editor_entries(),new_passage_private.save_entry(uuid,integer,jsonb),new_passage_private.set_publication(uuid,integer,boolean) to authenticated;

-- Uploads stay private until referenced by a published entry. Only raster images.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('new-passage-portfolio','new-passage-portfolio',false,4194304,array['image/jpeg','image/png','image/webp']);
create function new_passage_private.can_read_image(object_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select new_passage_private.is_editor() or exists(
  select 1 from new_passage_private.entries where published->>'image_path'=object_name
 );
$$;
revoke all on function new_passage_private.can_read_image(text) from public,anon,authenticated;
grant execute on function new_passage_private.can_read_image(text) to anon,authenticated;
grant execute on function new_passage_private.is_editor() to authenticated;
create policy np_portfolio_image_read on storage.objects for select to anon,authenticated
 using(bucket_id='new-passage-portfolio' and new_passage_private.can_read_image(name));
create policy np_portfolio_image_upload on storage.objects for insert to authenticated
 with check(bucket_id='new-passage-portfolio' and new_passage_private.is_editor()
  and name ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.(jpg|png|webp)$');
-- Immutable object names; no broad update/delete policy or public bucket.
notify pgrst,'reload schema';
