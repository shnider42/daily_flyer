begin;
select set_config('test.np_user',gen_random_uuid()::text,true),set_config('test.np_other',gen_random_uuid()::text,true),set_config('test.np_session',gen_random_uuid()::text,true),set_config('test.np_other_session',gen_random_uuid()::text,true),set_config('test.np_entry',gen_random_uuid()::text,true),set_config('test.np_image',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at) values(current_setting('test.np_user')::uuid,'np-transaction-editor@example.invalid',now()),(current_setting('test.np_other')::uuid,'np-transaction-outsider@example.invalid',now());
insert into auth.sessions(id,user_id,created_at,updated_at) values(current_setting('test.np_session')::uuid,current_setting('test.np_user')::uuid,now(),now()),(current_setting('test.np_other_session')::uuid,current_setting('test.np_other')::uuid,now(),now());
insert into new_passage_private.editors(user_id) values(current_setting('test.np_user')::uuid);
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.np_user'),'role','authenticated','session_id',current_setting('test.np_session'))::text,true);
do $$
declare body jsonb:=jsonb_build_object('title','Transaction test','summary','Draft must remain private.','category','Coaching','accent','aqua','sort_order',0); rows jsonb; id uuid:=current_setting('test.np_entry')::uuid;
begin
 rows:=public.np_save_entry(id,0,body);
 if not rows @> jsonb_build_array(jsonb_build_object('id',id,'version',1)) then raise exception 'Save failed'; end if;
 if public.np_portfolio()::text like '%Draft must remain private%' then raise exception 'Draft leaked'; end if;
 begin perform public.np_save_entry(id,0,body); raise exception 'Stale write accepted'; exception when serialization_failure then null; end;
 perform public.np_set_publication(id,1,true);
 if not public.np_portfolio() @> jsonb_build_array(jsonb_build_object('id',id,'summary','Draft must remain private.')) then raise exception 'Publish failed'; end if;
 perform public.np_save_entry(id,2,body||jsonb_build_object('summary','New unpublished secret draft.'));
 if public.np_portfolio()::text like '%New unpublished secret%' then raise exception 'Draft update leaked'; end if;
 begin perform public.np_set_publication(id,2,true); raise exception 'Stale publication accepted'; exception when serialization_failure then null; end;
 begin perform public.np_save_entry(id,3,body||jsonb_build_object('link_url','javascript:alert(1)')); raise exception 'Unsafe URL accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.np_save_entry(id,3,body||jsonb_build_object('image_path',id::text||'/fake.svg','image_alt','Test image')); raise exception 'Unsafe image accepted'; exception when invalid_parameter_value then null; end;
 perform public.np_set_publication(id,3,false);
 if public.np_portfolio()::text like '%Transaction test%' then raise exception 'Unpublish failed'; end if;
 if jsonb_array_length(public.np_editor_entries())<>1 then raise exception 'Saved draft lost'; end if;
 begin perform 1 from new_passage_private.entries; raise exception 'Direct table read allowed'; exception when insufficient_privilege then null; end;
 insert into storage.objects(bucket_id,name) values('new-passage-portfolio',id::text||'/'||current_setting('test.np_image')||'.jpg');
 perform public.np_save_entry(id,4,body||jsonb_build_object('image_path',id::text||'/'||current_setting('test.np_image')||'.jpg','image_alt','A test photo'));
 perform public.np_set_publication(id,5,true);
end $$;
-- An anonymous viewer can see the photo only while its entry is published.
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ begin
 if not exists(select 1 from storage.objects where bucket_id='new-passage-portfolio') then raise exception 'Published photo not readable'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.np_user'),'role','authenticated','session_id',current_setting('test.np_session'))::text,true);
select public.np_set_publication(current_setting('test.np_entry')::uuid,6,false);
-- Signed-in outsiders cannot borrow the editor's access, including storage.
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.np_other'),'role','authenticated','session_id',current_setting('test.np_other_session'))::text,true);
do $$ begin
 begin perform public.np_editor_entries(); raise exception 'Outsider read allowed'; exception when insufficient_privilege then null; end;
 begin perform public.np_save_entry(current_setting('test.np_entry')::uuid,4,'{}'); raise exception 'Outsider write allowed'; exception when insufficient_privilege then null; end;
 begin perform public.np_set_publication(current_setting('test.np_entry')::uuid,4,true); raise exception 'Outsider publish allowed'; exception when insufficient_privilege then null; end;
 if exists(select 1 from storage.objects where bucket_id='new-passage-portfolio') then raise exception 'Private image exposed'; end if;
 begin insert into storage.objects(bucket_id,name) values('new-passage-portfolio',gen_random_uuid()::text||'/'||gen_random_uuid()::text||'.jpg'); raise exception 'Outsider upload allowed'; exception when insufficient_privilege then null; end;
end $$;
-- An editor UUID alone cannot substitute for a valid session.
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.np_user'),'role','authenticated','session_id',gen_random_uuid())::text,true);
do $$ begin
 begin perform public.np_editor_entries(); raise exception 'Missing session allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update new_passage_private.editors set active=false where user_id=current_setting('test.np_user')::uuid;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.np_user'),'role','authenticated','session_id',current_setting('test.np_session'))::text,true);
do $$ begin
 begin perform public.np_editor_entries(); raise exception 'Revoked editor allowed'; exception when insufficient_privilege then null; end;
end $$;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ begin
 perform public.np_portfolio();
 begin perform public.np_editor_entries(); raise exception 'Anonymous private read allowed'; exception when insufficient_privilege then null; end;
 begin perform public.np_save_entry(current_setting('test.np_entry')::uuid,4,'{}'); raise exception 'Anonymous write allowed'; exception when insufficient_privilege then null; end;
 if exists(select 1 from storage.objects where bucket_id='new-passage-portfolio') then raise exception 'Anonymous draft image exposed'; end if;
end $$;
reset role;
rollback;
select 'PASS: draft isolation, explicit publication, unpublish, concurrency, validation, editor/outsider/anon permissions, live-session requirement, revocation and private image policies. All synthetic rows rolled back.' as result;
