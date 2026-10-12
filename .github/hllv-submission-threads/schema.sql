-- Add append-only conversations. Private replies NEVER become public on approval.
CREATE TABLE hllv_private.submission_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 suggestion_id uuid NOT NULL REFERENCES hllv_private.submissions(id) ON DELETE CASCADE,
 version integer NOT NULL CHECK(version>0),
 author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 author_role text NOT NULL CHECK(author_role IN ('member','moderator')),
 visibility text NOT NULL DEFAULT 'private' CHECK(visibility IN ('private','public')),
 body text NOT NULL CHECK(length(btrim(body)) BETWEEN 1 AND 2000),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 request_id uuid,
 audit_id bigint UNIQUE REFERENCES hllv_private.audit(id) ON DELETE CASCADE,
 imported boolean NOT NULL DEFAULT false,
 hidden_at timestamptz,
 hidden_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 UNIQUE(author_id,request_id),
 CHECK(visibility<>'public' OR author_role='moderator'),
 CHECK(hidden_at IS NULL OR visibility='public')
);
CREATE INDEX submission_messages_thread ON hllv_private.submission_messages(suggestion_id,created_at DESC,id);
ALTER TABLE hllv_private.submission_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON hllv_private.submission_messages FROM PUBLIC,anon,authenticated;
COMMENT ON TABLE hllv_private.submission_messages IS 'Private owner/moderator conversations and explicitly posted public moderator comments. No direct client grants. Previous overwritten notes cannot be reconstructed.';
INSERT INTO hllv_private.submission_messages(suggestion_id,version,author_role,visibility,body,imported)
SELECT id,version,'moderator','private',submitter_note,true FROM hllv_private.submissions
WHERE publication_mode='community' AND length(btrim(submitter_note))>0;
CREATE FUNCTION hllv_private.capture_community_reply() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s hllv_private.submissions;
BEGIN
 IF NEW.action='community_moderated' THEN
  SELECT * INTO s FROM hllv_private.submissions WHERE id=NEW.suggestion_id AND publication_mode='community';
  IF FOUND AND length(btrim(s.submitter_note))>0 THEN
   INSERT INTO hllv_private.submission_messages(suggestion_id,version,author_id,author_role,body,created_at,audit_id)
   VALUES(s.id,NEW.version,NEW.actor_id,'moderator',s.submitter_note,NEW.happened_at,NEW.id);
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION hllv_private.capture_community_reply() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER capture_community_reply AFTER INSERT ON hllv_private.audit
FOR EACH ROW EXECUTE FUNCTION hllv_private.capture_community_reply();
CREATE FUNCTION hllv_private.public_comment_projection(item_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH eligible AS (
  SELECT m.id,m.body,m.version,m.created_at FROM hllv_private.submission_messages m
  JOIN hllv_private.submissions s ON s.id=m.suggestion_id
  JOIN hllv_private.community_approvals a ON a.suggestion_id=s.id
  WHERE s.id=item_id AND s.publication_mode='community' AND s.state='published'
   AND a.visible AND a.version=s.version AND s.owner_accepted_version=s.version
   AND m.visibility='public' AND m.hidden_at IS NULL AND m.version=s.version
 ), recent AS (SELECT * FROM eligible ORDER BY created_at DESC,id DESC LIMIT 3)
 SELECT jsonb_build_object('public_comment_count',(SELECT count(*) FROM eligible),
 'public_comments',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'body',body,'version',version,'created_at',created_at,'author_label','Site moderator') ORDER BY created_at DESC,id DESC) FROM recent),'[]'::jsonb))
$$;
REVOKE ALL ON FUNCTION hllv_private.public_comment_projection(uuid) FROM PUBLIC,anon,authenticated;
DO $$
DECLARE src text:=pg_get_functiondef('hllv_private.community_record(uuid,boolean)'::regprocedure);
 needle text:='|| CASE WHEN private_fields THEN jsonb_build_object(';
BEGIN
 IF (length(src)-length(replace(src,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Inspect changed record projection before installing conversations.'; END IF;
 src:=replace(src,needle,'|| hllv_private.public_comment_projection(s.id) '||needle);
 EXECUTE src;
END $$;
CREATE FUNCTION hllv_private.submission_thread(action text DEFAULT 'read',payload jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid; moderator boolean:=false; s hllv_private.submissions; msg hllv_private.submission_messages;
 sid uuid; req uuid; body_text text; pg integer; oldest boolean; entries jsonb; total integer;
BEGIN
 IF action IS NULL OR action NOT IN ('read','public','reply','public_comment','hide_public_comment','check') OR payload IS NULL OR jsonb_typeof(payload)<>'object' THEN
  RAISE EXCEPTION 'Invalid conversation request.' USING ERRCODE='22023';
 END IF;
 IF action<>'public' THEN
  u:=hllv_private.community_actor();
  SELECT EXISTS(SELECT 1 FROM hllv_private.members WHERE user_id=u AND active AND role='moderator') INTO moderator;
 END IF;
 sid:=(payload->>'id')::uuid;
 SELECT * INTO s FROM hllv_private.submissions WHERE id=sid AND publication_mode='community';
 IF NOT FOUND THEN RAISE EXCEPTION 'Conversation unavailable.' USING ERRCODE='42501'; END IF;
 IF action='public' THEN
  IF s.state<>'published' OR s.owner_accepted_version<>s.version OR NOT EXISTS(SELECT 1 FROM hllv_private.community_approvals WHERE suggestion_id=sid AND visible AND version=s.version) THEN
   RAISE EXCEPTION 'Public comments are unavailable for this entry.' USING ERRCODE='42501';
  END IF;
 ELSIF u<>s.owner_id AND NOT moderator THEN RAISE EXCEPTION 'Conversation unavailable.' USING ERRCODE='42501'; END IF;
 IF action IN ('public_comment','hide_public_comment') AND NOT moderator THEN RAISE EXCEPTION 'Only site moderators can post or hide public comments.' USING ERRCODE='42501'; END IF;
 IF action IN ('read','public') THEN
  pg:=coalesce((payload->>'page')::integer,0);oldest:=coalesce(payload->>'order','newest')='oldest';
  IF pg<0 OR pg>10000 OR coalesce(payload->>'order','newest') NOT IN ('newest','oldest') THEN RAISE EXCEPTION 'Invalid conversation page.' USING ERRCODE='22023'; END IF;
  WITH events AS (
   SELECT 'm-'||m.id::text AS key,m.created_at AS at,jsonb_build_object('id',m.id,'kind','message','at',m.created_at,'body',m.body,'version',m.version,
    'visibility',m.visibility,'author_label',CASE WHEN m.imported THEN 'Earlier moderator reply' WHEN m.author_role='moderator' THEN 'Site moderator' ELSE 'Member (submitter)' END,
    'is_mine',CASE WHEN submission_thread.action='public' THEN false ELSE m.author_id=u END,'imported',m.imported,'hidden',m.hidden_at IS NOT NULL) AS entry
   FROM hllv_private.submission_messages m WHERE m.suggestion_id=sid AND (submission_thread.action<>'public' OR (m.visibility='public' AND m.version=s.version AND m.hidden_at IS NULL))
   UNION ALL
   SELECT 'a-'||a.id::text,a.happened_at,jsonb_build_object('kind','event','at',a.happened_at,'version',a.version,'action',a.action,
    'decision',CASE WHEN a.detail->>'decision' IN ('published','needs_information','declined','duplicate','pending') THEN a.detail->>'decision' END)
   FROM hllv_private.audit a WHERE submission_thread.action<>'public' AND a.suggestion_id=sid AND a.action NOT IN ('community_private_reply','community_public_comment')
   UNION ALL
   SELECT 'v-'||v.version::text,v.recorded_at,jsonb_build_object('kind','version','at',v.recorded_at,'version',v.version,'wording',v.wording)
   FROM hllv_private.versions v WHERE submission_thread.action<>'public' AND v.suggestion_id=sid
  ), ordered AS (
   SELECT *,row_number() OVER(ORDER BY CASE WHEN oldest THEN at END ASC,CASE WHEN NOT oldest THEN at END DESC,key) AS n FROM events
  ) SELECT (SELECT count(*) FROM events),coalesce(jsonb_agg(entry ORDER BY n),'[]'::jsonb) INTO total,entries FROM ordered WHERE n>pg*30 AND n<=(pg+1)*30;
  RETURN jsonb_build_object('entries',entries,'total',total,'page',pg,'page_size',30,'checked_at',clock_timestamp()) ||
   CASE WHEN submission_thread.action='public' THEN '{}'::jsonb ELSE jsonb_build_object('submission',hllv_private.community_record(sid,true),'can_reply',s.state<>'withdrawn','can_post_public',moderator AND s.state='published','moderator',moderator) END;
 END IF;
 IF action='check' THEN
  SELECT * INTO msg FROM hllv_private.submission_messages WHERE suggestion_id=sid AND author_id=u AND request_id=(payload->>'request_id')::uuid;
  RETURN CASE WHEN NOT FOUND THEN 'null'::jsonb ELSE jsonb_build_object('message_id',msg.id,'saved_at',msg.created_at,'visibility',msg.visibility,'hidden',msg.hidden_at IS NOT NULL,'submission',hllv_private.community_record(sid,true)) END;
 END IF;
 PERFORM hllv_private.rate_check(u);
 SELECT * INTO s FROM hllv_private.submissions WHERE id=sid FOR UPDATE;
 IF action='hide_public_comment' THEN
  SELECT * INTO msg FROM hllv_private.submission_messages WHERE id=(payload->>'message_id')::uuid AND suggestion_id=sid AND visibility='public' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Public comment unavailable.' USING ERRCODE='42501'; END IF;
  IF msg.hidden_at IS NULL THEN
   UPDATE hllv_private.submission_messages SET hidden_at=clock_timestamp(),hidden_by=u WHERE id=msg.id;
   INSERT INTO hllv_private.audit(actor_id,suggestion_id,action,version) VALUES(u,sid,'community_public_comment_hidden',msg.version);
  END IF;
  RETURN jsonb_build_object('message_id',msg.id,'hidden',true,'submission',hllv_private.community_record(sid,true));
 END IF;
 req:=(payload->>'request_id')::uuid;body_text:=btrim(coalesce(payload->>'body',''));
 IF req IS NULL OR length(body_text) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Write a reply of 1 to 2000 characters.' USING ERRCODE='22023'; END IF;
 SELECT * INTO msg FROM hllv_private.submission_messages WHERE author_id=u AND request_id=req;
 IF FOUND THEN
  IF msg.suggestion_id<>sid OR msg.body<>body_text OR msg.visibility<>CASE WHEN action='public_comment' THEN 'public' ELSE 'private' END THEN RAISE EXCEPTION 'This request belongs to a different reply.' USING ERRCODE='22023'; END IF;
  RETURN jsonb_build_object('message_id',msg.id,'saved_at',msg.created_at,'visibility',msg.visibility,'submission',hllv_private.community_record(sid,true));
 END IF;
 IF s.state='withdrawn' THEN RAISE EXCEPTION 'This submission was withdrawn. Its conversation is read-only.' USING ERRCODE='42501'; END IF;
 IF s.version IS DISTINCT FROM (payload->>'version')::integer THEN RAISE EXCEPTION 'The submission wording changed. Refresh the conversation before replying.' USING ERRCODE='40001'; END IF;
 IF action='public_comment' AND (payload->>'public_consent' IS DISTINCT FROM 'true' OR s.state<>'published' OR s.owner_accepted_version<>s.version OR NOT EXISTS(SELECT 1 FROM hllv_private.community_approvals WHERE suggestion_id=sid AND visible AND version=s.version)) THEN
  RAISE EXCEPTION 'Approve this wording first and explicitly confirm a public comment.' USING ERRCODE='42501';
 END IF;
 IF action='reply' AND NOT moderator AND NOT (SELECT enabled FROM hllv_private.community_settings WHERE id) THEN RAISE EXCEPTION 'Community replies are temporarily paused.' USING ERRCODE='42501'; END IF;
 INSERT INTO hllv_private.submission_messages(suggestion_id,version,author_id,author_role,visibility,body,request_id)
 VALUES(sid,s.version,u,CASE WHEN moderator THEN 'moderator' ELSE 'member' END,CASE WHEN action='public_comment' THEN 'public' ELSE 'private' END,body_text,req) RETURNING * INTO msg;
 UPDATE hllv_private.submissions SET updated_at=clock_timestamp(),state=CASE WHEN action='reply' AND NOT moderator AND state='needs_information' THEN 'pending' ELSE state END WHERE id=sid;
 INSERT INTO hllv_private.audit(actor_id,suggestion_id,action,version) VALUES(u,sid,CASE WHEN action='reply' THEN 'community_private_reply' ELSE 'community_public_comment' END,s.version);
 RETURN jsonb_build_object('message_id',msg.id,'saved_at',msg.created_at,'visibility',msg.visibility,'submission',hllv_private.community_record(sid,true));
END $$;
REVOKE ALL ON FUNCTION hllv_private.submission_thread(text,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.hllv_submission_thread(action text DEFAULT 'read',payload jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT hllv_private.submission_thread(action,payload) $$;
REVOKE ALL ON FUNCTION public.hllv_submission_thread(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hllv_submission_thread(text,jsonb),hllv_private.submission_thread(text,jsonb) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
