-- Only exempt verified site moderators from the daily community-submission quota.
-- Keep authentication, publication checks, request throttling and unique votes intact.
DO $$
DECLARE
 src text:=pg_get_functiondef('hllv_private.community(text,jsonb)'::regprocedure);
 old_cap text:=$old$IF (SELECT count(*) FROM hllv_private.submissions WHERE owner_id=u AND publication_mode='community' AND created_at>now()-interval '24 hours')>=3 THEN$old$;
 new_cap text:=$new$IF r IS DISTINCT FROM 'moderator' AND (SELECT count(*) FROM hllv_private.submissions WHERE owner_id=u AND publication_mode='community' AND created_at>now()-interval '24 hours')>=3 THEN$new$;
 old_profile text:=$old$jsonb_build_object('role',r,'can_moderate',r='moderator')$old$;
 new_profile text:=$new$jsonb_build_object('role',r,'can_moderate',r='moderator','daily_submission_limit',CASE WHEN r='moderator' THEN NULL::integer ELSE 3 END)$new$;
 old_status text:=$old$'daily_submission_limit',3)$old$;
 new_status text:=$new$'daily_submission_limit',3,'moderator_submission_limit_exempt',true)$new$;
BEGIN
 IF (length(src)-length(replace(src,old_cap,'')))/length(old_cap)<>1
 OR (length(src)-length(replace(src,old_profile,'')))/length(old_profile)<>1
 OR (length(src)-length(replace(src,old_status,'')))/length(old_status)<>1 THEN
  RAISE EXCEPTION 'Community quota implementation changed; inspect before applying.';
 END IF;
 src:=replace(replace(replace(src,old_cap,new_cap),old_profile,new_profile),old_status,new_status);
 EXECUTE src;
END $$;
NOTIFY pgrst,'reload schema';
