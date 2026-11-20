-- Preserve identical retries; atomically honor changed participant preferences.
create or replace function public.lmw_submit(
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

