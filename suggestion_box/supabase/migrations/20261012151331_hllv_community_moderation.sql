-- Community moderation is a separate publication authority, never developer review.
-- Preserve all existing identities, strict-pilot records, votes and private practice.
ALTER TABLE hllv_private.submissions ADD COLUMN publication_mode text NOT NULL DEFAULT 'developer' CHECK(publication_mode IN ('developer','community'));
ALTER TABLE hllv_private.submissions ADD COLUMN client_request_id uuid;
CREATE UNIQUE INDEX community_request_once ON hllv_private.submissions(owner_id,client_request_id) WHERE client_request_id IS NOT NULL;
CREATE INDEX community_intake_order ON hllv_private.submissions(publication_mode,state,created_at);
CREATE TABLE hllv_private.community_settings(id boolean PRIMARY KEY DEFAULT true CHECK(id),enabled boolean NOT NULL DEFAULT false);
INSERT INTO hllv_private.community_settings DEFAULT VALUES;
CREATE TABLE hllv_private.community_approvals(
 suggestion_id uuid PRIMARY KEY REFERENCES hllv_private.submissions(id) ON DELETE CASCADE,
 version integer NOT NULL CHECK(version>0),
 moderator_id uuid NOT NULL REFERENCES auth.users(id),
 approved_at timestamptz NOT NULL DEFAULT now(),visible boolean NOT NULL DEFAULT true
);
ALTER TABLE hllv_private.community_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE hllv_private.community_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE hllv_private.community_settings,hllv_private.community_approvals FROM PUBLIC,anon,authenticated;
COMMENT ON TABLE hllv_private.community_approvals IS 'Site-moderator publication approval only. Never a Team17 review or development commitment.';
CREATE FUNCTION hllv_private.community_actor(required_role text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid(); r text;
BEGIN
 SELECT coalesce(m.role,'participant') INTO r FROM auth.users a
 JOIN auth.sessions s ON s.user_id=a.id AND s.id::text=auth.jwt()->>'session_id'
 LEFT JOIN hllv_private.members m ON m.user_id=a.id
 WHERE a.id=u AND a.email_confirmed_at IS NOT NULL AND NOT coalesce(a.is_anonymous,false)
 AND (a.banned_until IS NULL OR a.banned_until<=now()) AND coalesce(m.active,true)
 AND (s.not_after IS NULL OR s.not_after>now());
 IF r IS NULL OR (required_role IS NOT NULL AND r<>required_role) THEN
  RAISE EXCEPTION 'A verified site account with the required access is needed. Please sign in.' USING ERRCODE='42501';
 END IF;
 RETURN u;
END $$;
REVOKE ALL ON FUNCTION hllv_private.community_actor(text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION hllv_private.community_record(item_id uuid,private_fields boolean DEFAULT false) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('id',s.id,'kind',s.kind,'title',s.title,'problem',s.problem,
 'desired_outcome',s.desired_outcome,'related_issue',s.related_issue,'version',s.version,
 'state',s.state,'created_at',s.created_at,'updated_at',s.updated_at,
 'approval_mode','community','approval_label',CASE WHEN a.visible AND a.version=s.version AND s.state='published' THEN 'Moderator approved' ELSE NULL END,
 'approved_at',CASE WHEN a.visible AND a.version=s.version AND s.state='published' THEN a.approved_at ELSE NULL END,
 'developer_review','Not recorded',
 'votes',(SELECT count(*) FROM hllv_private.votes v JOIN auth.users u ON u.id=v.voter_id LEFT JOIN hllv_private.members m ON m.user_id=u.id
 WHERE v.suggestion_id=s.id AND v.version=s.version AND coalesce(m.active,true) AND u.email_confirmed_at IS NOT NULL AND NOT coalesce(u.is_anonymous,false) AND (u.banned_until IS NULL OR u.banned_until<=now())),
 'my_vote',EXISTS(SELECT 1 FROM hllv_private.votes v WHERE v.suggestion_id=s.id AND v.version=s.version AND v.voter_id=auth.uid()))
 || CASE WHEN private_fields THEN jsonb_build_object('submitter_note',s.submitter_note,'request_id',s.client_request_id,'duplicate_of',s.duplicate_of,
 'history',(SELECT coalesce(jsonb_agg(jsonb_build_object('action',h.action,'version',h.version,'at',h.happened_at) ORDER BY h.id DESC),'[]'::jsonb)
 FROM (SELECT id,action,version,happened_at FROM hllv_private.audit WHERE suggestion_id=s.id ORDER BY id DESC LIMIT 20) h)) ELSE '{}'::jsonb END
 FROM hllv_private.submissions s LEFT JOIN hllv_private.community_approvals a ON a.suggestion_id=s.id
 WHERE s.id=item_id AND s.publication_mode='community'
$$;
REVOKE ALL ON FUNCTION hllv_private.community_record(uuid,boolean) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION hllv_private.community(action text DEFAULT 'status',payload jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid; r text; enabled_now boolean; item hllv_private.submissions; sid uuid; req uuid;
 rows jsonb; total integer; pg integer:=0; q text; filter_state text; desired_state text; note_text text; target uuid;
BEGIN
 IF payload IS NULL OR jsonb_typeof(payload)<>'object' THEN RAISE EXCEPTION 'Invalid request.' USING ERRCODE='22023'; END IF;
 SELECT enabled INTO enabled_now FROM hllv_private.community_settings WHERE id;
 IF action='status' THEN RETURN jsonb_build_object('enabled',coalesce(enabled_now,false),'approval_mode','community','policy_version','community-v1','daily_submission_limit',3); END IF;
 IF action IS NULL OR action NOT IN ('board','profile','mine','queue','find_submission','submit','edit','withdraw','moderate','vote') THEN
  RAISE EXCEPTION 'Unknown community action.' USING ERRCODE='22023'; END IF;
 IF action<>'board' THEN
  u:=hllv_private.community_actor(CASE WHEN action IN ('queue','moderate') THEN 'moderator' ELSE NULL END);
  SELECT coalesce((SELECT role FROM hllv_private.members WHERE user_id=u),'participant') INTO r;
 END IF;
 IF action='profile' THEN RETURN jsonb_build_object('role',r,'can_moderate',r='moderator'); END IF;
 IF action IN ('board','mine','queue') THEN
  pg:=coalesce((payload->>'page')::integer,0); q:=left(coalesce(payload->>'query',''),120); filter_state:=coalesce(payload->>'state','all');
  IF pg<0 OR pg>10000 OR filter_state NOT IN ('all','pending','needs_information','shortlisted','published','declined','duplicate','withdrawn') THEN RAISE EXCEPTION 'Invalid list filter.' USING ERRCODE='22023'; END IF;
  WITH selected AS (
   SELECT s.id,s.created_at,coalesce(a.approved_at,s.created_at) published_at,hllv_private.community_record(s.id,action<>'board') rec
   FROM hllv_private.submissions s LEFT JOIN hllv_private.community_approvals a ON a.suggestion_id=s.id
   WHERE s.publication_mode='community'
   AND CASE WHEN action='board' THEN s.state='published' AND a.visible AND a.version=s.version AND s.owner_accepted_version=s.version
            WHEN action='mine' THEN s.owner_id=u ELSE s.state<>'withdrawn' END
   AND (filter_state='all' OR s.state=filter_state)
   AND (q='' OR strpos(lower(s.title||' '||s.problem||' '||coalesce(s.related_issue,'')),lower(q))>0)
  ), ordered AS (
   SELECT *,row_number() OVER(ORDER BY
    CASE WHEN action='board' AND coalesce(payload->>'order','votes')='votes' THEN (rec->>'votes')::integer END DESC NULLS LAST,
    CASE WHEN action='queue' THEN created_at END ASC,
    CASE WHEN action<>'queue' THEN published_at END DESC,id) n FROM selected
  ) SELECT (SELECT count(*) FROM selected),coalesce(jsonb_agg(rec ORDER BY n),'[]'::jsonb) INTO total,rows FROM ordered WHERE n>pg*20 AND n<=(pg+1)*20;
  RETURN jsonb_build_object('rows',rows,'total',total,'page',pg,'page_size',20,'checked_at',clock_timestamp(),'enabled',coalesce(enabled_now,false));
 END IF;
 IF action='find_submission' THEN
  req:=(payload->>'request_id')::uuid;
  SELECT * INTO item FROM hllv_private.submissions WHERE owner_id=u AND client_request_id=req AND publication_mode='community';
  RETURN CASE WHEN item.id IS NULL THEN 'null'::jsonb ELSE hllv_private.community_record(item.id,true) END;
 END IF;
 IF enabled_now IS NOT TRUE AND action NOT IN ('withdraw','moderate') THEN RAISE EXCEPTION 'Community submissions and voting are temporarily paused.' USING ERRCODE='42501'; END IF;
 PERFORM hllv_private.rate_check(u);
 IF action='submit' THEN
  req:=(payload->>'request_id')::uuid;
  IF req IS NULL OR payload->>'policy_version' IS DISTINCT FROM 'community-v1' OR payload->>'consent' IS DISTINCT FROM 'true' THEN
   RAISE EXCEPTION 'Read and accept the community submission notice.' USING ERRCODE='22023'; END IF;
  SELECT * INTO item FROM hllv_private.submissions WHERE owner_id=u AND client_request_id=req;
  IF FOUND THEN
   IF item.publication_mode<>'community' THEN RAISE EXCEPTION 'Request unavailable.' USING ERRCODE='42501'; END IF;
   RETURN hllv_private.community_record(item.id,true);
  END IF;
  IF (SELECT count(*) FROM hllv_private.submissions WHERE owner_id=u AND publication_mode='community' AND created_at>now()-interval '24 hours')>=3 THEN
   RAISE EXCEPTION 'You can send three suggestions in 24 hours. Review your existing suggestions before sending another.' USING ERRCODE='22023'; END IF;
  INSERT INTO hllv_private.submissions(owner_id,kind,title,problem,desired_outcome,related_issue,policy_version,publication_mode,client_request_id)
  VALUES(u,payload->>'kind',btrim(payload->>'title'),btrim(payload->>'problem'),btrim(payload->>'desired_outcome'),nullif(payload->>'related_issue',''),'community-v1','community',req) RETURNING * INTO item;
  INSERT INTO hllv_private.audit(actor_id,suggestion_id,action,version) VALUES(u,item.id,'community_submitted_private',item.version);
  RETURN hllv_private.community_record(item.id,true);
 END IF;
 sid:=(payload->>'id')::uuid;
 SELECT * INTO item FROM hllv_private.submissions WHERE id=sid AND publication_mode='community' FOR UPDATE;
 IF NOT FOUND OR (action IN ('edit','withdraw') AND item.owner_id<>u) THEN RAISE EXCEPTION 'Suggestion unavailable.' USING ERRCODE='42501'; END IF;
 IF item.version IS DISTINCT FROM (payload->>'version')::integer THEN RAISE EXCEPTION 'This suggestion changed. Check its latest version.' USING ERRCODE='40001'; END IF;
 IF action='vote' THEN
  IF item.state<>'published' OR NOT EXISTS(SELECT 1 FROM hllv_private.community_approvals WHERE suggestion_id=sid AND version=item.version AND visible) THEN RAISE EXCEPTION 'Voting is available only on published suggestions.' USING ERRCODE='42501'; END IF;
  IF payload->>'support' NOT IN ('true','false') OR payload->>'support' IS NULL THEN RAISE EXCEPTION 'Choose support or remove support.' USING ERRCODE='22023'; END IF;
  IF (payload->>'support')::boolean THEN INSERT INTO hllv_private.votes(suggestion_id,version,voter_id) VALUES(sid,item.version,u) ON CONFLICT DO NOTHING;
  ELSE DELETE FROM hllv_private.votes WHERE suggestion_id=sid AND version=item.version AND voter_id=u; END IF;
  RETURN hllv_private.community_record(sid,false);
 END IF;
 IF item.updated_at IS DISTINCT FROM (payload->>'updated_at')::timestamptz OR item.state='withdrawn' THEN RAISE EXCEPTION 'This entry changed or was withdrawn. Reload before making a decision.' USING ERRCODE='40001'; END IF;
 IF action='edit' THEN
  UPDATE hllv_private.submissions SET title=btrim(payload->>'title'),problem=btrim(payload->>'problem'),desired_outcome=btrim(payload->>'desired_outcome'),kind=payload->>'kind',related_issue=nullif(payload->>'related_issue',''),version=version+1,owner_accepted_version=version+1,state='pending',submitter_note='',duplicate_of=NULL,updated_at=clock_timestamp() WHERE id=sid RETURNING * INTO item;
  UPDATE hllv_private.community_approvals SET visible=false WHERE suggestion_id=sid;
  INSERT INTO hllv_private.audit(actor_id,suggestion_id,action,version) VALUES(u,sid,'community_revised_private',item.version);
 ELSIF action='withdraw' THEN
  UPDATE hllv_private.submissions SET state='withdrawn',updated_at=clock_timestamp() WHERE id=sid RETURNING * INTO item;
  UPDATE hllv_private.community_approvals SET visible=false WHERE suggestion_id=sid;
  INSERT INTO hllv_private.audit(actor_id,suggestion_id,action,version) VALUES(u,sid,'community_withdrawn',item.version);
 ELSIF action='moderate' THEN
  desired_state:=payload->>'decision'; note_text:=btrim(coalesce(payload->>'note',''));
  IF desired_state IS NULL OR desired_state NOT IN ('published','needs_information','declined','duplicate','pending') OR length(note_text)>1000 OR (desired_state<>'published' AND length(note_text)<5) THEN
   RAISE EXCEPTION 'Choose a decision and add a short explanation for private returns or declines.' USING ERRCODE='22023'; END IF;
  IF desired_state='published' AND item.owner_accepted_version<>item.version THEN RAISE EXCEPTION 'The author must accept this wording before publication.' USING ERRCODE='42501'; END IF;
  target:=CASE WHEN desired_state='duplicate' THEN (payload->>'duplicate_of')::uuid ELSE NULL END;
  IF desired_state='duplicate' AND (target IS NULL OR target=sid OR NOT EXISTS(SELECT 1 FROM hllv_private.submissions WHERE id=target AND publication_mode='community' AND state NOT IN ('withdrawn','declined','duplicate'))) THEN RAISE EXCEPTION 'Choose a different active suggestion as the duplicate.' USING ERRCODE='22023'; END IF;
  UPDATE hllv_private.submissions SET state=desired_state,submitter_note=note_text,duplicate_of=target,updated_at=clock_timestamp() WHERE id=sid RETURNING * INTO item;
  IF desired_state='published' THEN
   INSERT INTO hllv_private.community_approvals(suggestion_id,version,moderator_id,approved_at,visible) VALUES(sid,item.version,u,clock_timestamp(),true)
   ON CONFLICT(suggestion_id) DO UPDATE SET version=excluded.version,moderator_id=excluded.moderator_id,approved_at=excluded.approved_at,visible=true;
  ELSE UPDATE hllv_private.community_approvals SET visible=false WHERE suggestion_id=sid; END IF;
  INSERT INTO hllv_private.audit(actor_id,suggestion_id,action,version,detail) VALUES(u,sid,'community_moderated',item.version,jsonb_build_object('decision',desired_state,'authority','site_moderator'));
 END IF;
 RETURN hllv_private.community_record(sid,true);
END $$;
REVOKE ALL ON FUNCTION hllv_private.community(text,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.hllv_community(action text DEFAULT 'status',payload jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT hllv_private.community(action,payload) $$;
REVOKE ALL ON FUNCTION public.hllv_community(text,jsonb) FROM PUBLIC,anon,authenticated;
-- Anonymous callers can only pass the dispatcher's status/approved-board checks.
GRANT EXECUTE ON FUNCTION public.hllv_community(text,jsonb),hllv_private.community(text,jsonb) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
