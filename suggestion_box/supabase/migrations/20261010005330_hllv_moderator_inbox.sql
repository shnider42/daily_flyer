-- Additive moderator inbox. No account/phase/reviewer/publication changes.
CREATE FUNCTION hllv_private.inbox_actor() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=hllv_private.actor('moderator'); sid text:=auth.jwt()->>'session_id';
BEGIN
 IF sid IS NULL OR NOT EXISTS(SELECT 1 FROM auth.sessions s WHERE s.id::text=sid AND s.user_id=u AND (s.not_after IS NULL OR s.not_after>now())) THEN
  RAISE EXCEPTION 'Sign in again to open the moderator inbox.' USING ERRCODE='42501';
 END IF;
 RETURN u;
END $$;
REVOKE ALL ON FUNCTION hllv_private.inbox_actor() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION hllv_private.moderator_inbox() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=hllv_private.inbox_actor(); cfg hllv_private.settings; rows jsonb; visible_ids jsonb;
BEGIN
 SELECT * INTO cfg FROM hllv_private.settings WHERE id;
 visible_ids:=hllv_private.public_board();
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',s.id,'kind',s.kind,'title',s.title,'problem',s.problem,'desired_outcome',s.desired_outcome,
  'related_issue',s.related_issue,'state',s.state,'version',s.version,'owner_accepted_version',s.owner_accepted_version,
  'submitter_note',s.submitter_note,'duplicate_of',s.duplicate_of,'created_at',s.created_at,'updated_at',s.updated_at,
  'last_decision',(SELECT r.decision FROM hllv_private.reviews r WHERE r.suggestion_id=s.id AND r.version=s.version ORDER BY r.reviewed_at DESC,r.id DESC LIMIT 1),
  'reviewed_at',(SELECT r.reviewed_at FROM hllv_private.reviews r WHERE r.suggestion_id=s.id AND r.version=s.version ORDER BY r.reviewed_at DESC,r.id DESC LIMIT 1),
  'public_visible',EXISTS(SELECT 1 FROM jsonb_array_elements(visible_ids) b WHERE b->>'id'=s.id::text),
  'history',(SELECT coalesce(jsonb_agg(jsonb_build_object('action',a.action,'version',a.version,'at',a.happened_at,
    'decision',CASE WHEN a.detail->>'decision' IN ('needs_information','shortlisted','declined','duplicate','pending','cleared','clarify','hold') THEN a.detail->>'decision' ELSE NULL END) ORDER BY a.happened_at DESC,a.id DESC),'[]'::jsonb)
    FROM (SELECT action,version,happened_at,id,detail FROM hllv_private.audit WHERE suggestion_id=s.id ORDER BY happened_at DESC,id DESC LIMIT 100) a)
 ) ORDER BY s.created_at,s.id),'[]'::jsonb) INTO rows
 FROM hllv_private.submissions s WHERE s.state<>'withdrawn';
 RETURN jsonb_build_object('phase',cfg.phase,'can_moderate',cfg.phase IN ('intake','review'),'checked_at',now(),'rows',rows);
END $$;
REVOKE ALL ON FUNCTION hllv_private.moderator_inbox() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION hllv_private.moderator_decision(suggestion uuid,expected_version integer,expected_updated_at timestamptz,decision text,note text,duplicate_of uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=hllv_private.inbox_actor(); cfg hllv_private.settings; s hllv_private.submissions;
BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(734210,1);
 SELECT * INTO cfg FROM hllv_private.settings WHERE id FOR SHARE;
 IF cfg.phase NOT IN ('intake','review') THEN RAISE EXCEPTION 'Live moderation is closed during this pilot phase.' USING ERRCODE='42501'; END IF;
 IF decision IS NULL OR decision NOT IN ('needs_information','shortlisted','declined','duplicate','pending') OR note IS NULL OR length(btrim(note))<5 OR length(note)>1000 THEN
  RAISE EXCEPTION 'Choose a moderation decision and a note of 5 to 1000 characters.' USING ERRCODE='22023';
 END IF;
 SELECT * INTO s FROM hllv_private.submissions WHERE id=suggestion FOR UPDATE;
 IF NOT FOUND OR s.state IN ('withdrawn','published') THEN RAISE EXCEPTION 'This submission is not available for moderation here.' USING ERRCODE='42501'; END IF;
 IF s.version IS DISTINCT FROM expected_version OR s.updated_at IS DISTINCT FROM expected_updated_at THEN
  RAISE EXCEPTION 'This entry changed. Reload it before saving a new decision.' USING ERRCODE='40001';
 END IF;
 IF decision='duplicate' AND (duplicate_of IS NULL OR duplicate_of=suggestion OR NOT EXISTS(SELECT 1 FROM hllv_private.submissions WHERE id=moderator_decision.duplicate_of AND state NOT IN ('withdrawn','duplicate','declined'))) THEN
  RAISE EXCEPTION 'Choose a different active submission as the duplicate target.' USING ERRCODE='22023';
 END IF;
 PERFORM hllv_private.moderate(suggestion,expected_version,decision,btrim(note),CASE WHEN decision='duplicate' THEN duplicate_of ELSE NULL END);
 SELECT * INTO s FROM hllv_private.submissions WHERE id=suggestion;
 RETURN jsonb_build_object('id',s.id,'version',s.version,'state',s.state,'updated_at',s.updated_at,'submitter_note',s.submitter_note,'public_visible',false);
END $$;
REVOKE ALL ON FUNCTION hllv_private.moderator_decision(uuid,integer,timestamptz,text,text,uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.hllv_moderator_inbox() RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT hllv_private.moderator_inbox() $$;
CREATE FUNCTION public.hllv_moderator_decision(suggestion uuid,expected_version integer,expected_updated_at timestamptz,decision text,note text,duplicate_of uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT hllv_private.moderator_decision(suggestion,expected_version,expected_updated_at,decision,note,duplicate_of) $$;
REVOKE ALL ON FUNCTION public.hllv_moderator_inbox(),public.hllv_moderator_decision(uuid,integer,timestamptz,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hllv_moderator_inbox(),public.hllv_moderator_decision(uuid,integer,timestamptz,text,text,uuid),hllv_private.moderator_inbox(),hllv_private.moderator_decision(uuid,integer,timestamptz,text,text,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
