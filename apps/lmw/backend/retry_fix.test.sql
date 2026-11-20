-- Run against the deployed database after applying retry_fix.sql.
-- Every synthetic row and bucket is rolled back, including on a failed assertion.
begin;
do $$
declare
  test_id uuid := gen_random_uuid();
  test_hash text := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  test_bucket text := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  payload jsonb := '{"first_name":"Backend","last_name":"Retry Test","graduate_year":"2020","email":"lmw-retry-test@example.com","phone":"617-555-0100","current_employer":"","engagement":"yes","interests":["committee"],"availability":"one_time","help_needed":"","contact_permission":"email","phone_permission":true,"privacy_consent":true}'::jsonb;
  result text;
  saved public.lmw_responses%rowtype;
begin
  result := public.lmw_submit(test_id, 'networking-night', test_hash, test_bucket, payload);
  if result <> 'created' then raise exception 'Initial submission expected created, got %', result; end if;
  update public.lmw_responses set status='connected', note='Preserve this organizer note' where id=test_id;
  result := public.lmw_submit(test_id, 'networking-night', test_hash, test_bucket, payload);
  if result <> 'existing' then raise exception 'Exact retry expected existing, got %', result; end if;
  select * into saved from public.lmw_responses where id=test_id;
  if saved.status <> 'connected' then raise exception 'Identical retry changed organizer progress'; end if;

  payload := payload || '{"contact_permission":"none","phone_permission":false,"engagement":"not_now","interests":[]}'::jsonb;
  result := public.lmw_submit(test_id, 'networking-night', test_hash, test_bucket, payload);
  if result <> 'updated' then raise exception 'Changed retry expected updated, got %', result; end if;
  select * into saved from public.lmw_responses where id=test_id;
  if saved.contact_permission <> 'none' or saved.phone_permission or saved.status <> 'closed'
     or saved.engagement <> 'not_now' or cardinality(saved.interests) <> 0 then
    raise exception 'Changed retry failed to persist withdrawn consent';
  end if;
  if saved.note <> 'Preserve this organizer note' then raise exception 'Participant retry altered organizer note'; end if;
  result := public.lmw_submit(test_id, 'networking-night', test_hash, test_bucket, payload);
  if result <> 'existing' then raise exception 'Updated exact retry expected existing, got %', result; end if;

  result := public.lmw_submit(test_id, 'networking-night', repeat('0',64), test_bucket,
    payload || '{"contact_permission":"email"}'::jsonb);
  if result <> 'conflict' then raise exception 'Wrong capability expected conflict, got %', result; end if;
  select * into saved from public.lmw_responses where id=test_id;
  if saved.contact_permission <> 'none' then raise exception 'Wrong capability changed consent'; end if;
end;
$$;
rollback;
