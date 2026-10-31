-- Private practice data is separate from submissions/reviews/board/votes.
CREATE TABLE hllv_private.rehearsals (
 owner_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 kind text NOT NULL CHECK(kind IN ('suggestion','bug_priority')),
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 8 AND 120),
 problem text NOT NULL CHECK(length(btrim(problem)) BETWEEN 20 AND 1500),
 desired_outcome text NOT NULL CHECK(length(btrim(desired_outcome)) BETWEEN 10 AND 1000),
 related_issue text REFERENCES hllv_private.issue_links(id),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','needs_information','shortlisted','declined')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 note text NOT NULL DEFAULT '' CHECK(length(note)<=1000),
 history jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(history)='array' AND jsonb_array_length(history)<=30),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(kind<>'bug_priority' OR related_issue IS NOT NULL)
);
ALTER TABLE hllv_private.rehearsals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE hllv_private.rehearsals FROM PUBLIC,anon,authenticated;
COMMENT ON TABLE hllv_private.rehearsals IS 'One private disposable practice entry per moderator. Never part of the public board, reviewer queue, participant quota, or votes.';
CREATE FUNCTION hllv_private.rehearsal(action text DEFAULT 'get',payload jsonb DEFAULT '{}'::jsonb,expected_id uuid DEFAULT NULL,expected_version integer DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=hllv_private.actor('moderator');sid text:=auth.jwt()->>'session_id';r hllv_private.rehearsals;event jsonb;
BEGIN
 IF sid IS NULL OR NOT EXISTS(SELECT 1 FROM auth.sessions s WHERE s.id::text=sid AND s.user_id=u AND (s.not_after IS NULL OR s.not_after>now())) THEN
  RAISE EXCEPTION 'Please sign in again before opening private practice.' USING ERRCODE='42501';
 END IF;
 IF action IS NULL OR action NOT IN ('get','save','needs_information','shortlisted','declined','pending','remove') THEN
  RAISE EXCEPTION 'This practice action is unavailable. Practice entries cannot be published.' USING ERRCODE='22023';
 END IF;
 IF action<>'get' THEN PERFORM hllv_private.rate_check(u); END IF;
 SELECT * INTO r FROM hllv_private.rehearsals WHERE owner_id=u FOR UPDATE;
 IF action='get' THEN RETURN CASE WHEN r.id IS NULL THEN 'null'::jsonb ELSE (to_jsonb(r)-'owner_id') || '{"practice_only":true,"can_publish":false}'::jsonb END;END IF;
 IF action='save' AND r.id IS NULL THEN
  IF expected_id IS NOT NULL OR expected_version IS NOT NULL THEN RAISE EXCEPTION 'Practice changed. Reload before saving.' USING ERRCODE='40001';END IF;
  IF coalesce(payload->>'practice_ack','')<>'true' THEN RAISE EXCEPTION 'Acknowledge that this is private practice, not a real submission.' USING ERRCODE='22023';END IF;
  INSERT INTO hllv_private.rehearsals(owner_id,kind,title,problem,desired_outcome,related_issue,history)
  VALUES(u,payload->>'kind',btrim(payload->>'title'),btrim(payload->>'problem'),btrim(payload->>'desired_outcome'),nullif(payload->>'related_issue',''),jsonb_build_array(jsonb_build_object('action','saved_private','state','pending','version',1,'at',clock_timestamp()))) RETURNING * INTO r;
 ELSE
  IF r.id IS NULL OR r.id IS DISTINCT FROM expected_id OR r.version IS DISTINCT FROM expected_version THEN RAISE EXCEPTION 'Practice changed. Reload before continuing.' USING ERRCODE='40001';END IF;
  IF action='remove' THEN DELETE FROM hllv_private.rehearsals WHERE owner_id=u;RETURN 'null'::jsonb;END IF;
  IF jsonb_array_length(r.history)>=30 THEN RAISE EXCEPTION 'This practice run is full. Delete your test and start a new one.' USING ERRCODE='22023';END IF;
  IF action='save' THEN
   IF coalesce(payload->>'practice_ack','')<>'true' THEN RAISE EXCEPTION 'Acknowledge that this is private practice, not a real submission.' USING ERRCODE='22023';END IF;
   UPDATE hllv_private.rehearsals SET kind=payload->>'kind',title=btrim(payload->>'title'),problem=btrim(payload->>'problem'),desired_outcome=btrim(payload->>'desired_outcome'),related_issue=nullif(payload->>'related_issue',''),state='pending',note='',version=version+1,updated_at=clock_timestamp() WHERE owner_id=u RETURNING * INTO r;
  ELSE
   IF action IN ('needs_information','declined') AND length(btrim(coalesce(payload->>'note','')))<5 THEN RAISE EXCEPTION 'Add a short note explaining this practice decision.' USING ERRCODE='22023';END IF;
   UPDATE hllv_private.rehearsals SET state=action,note=coalesce(payload->>'note',''),version=version+1,updated_at=clock_timestamp() WHERE owner_id=u RETURNING * INTO r;
  END IF;
  event=jsonb_build_object('action',CASE WHEN action='save' THEN 'revised_private' ELSE 'practice_moderation' END,'state',r.state,'version',r.version,'at',r.updated_at);
  UPDATE hllv_private.rehearsals SET history=history||jsonb_build_array(event) WHERE owner_id=u RETURNING * INTO r;
 END IF;
 RETURN (to_jsonb(r)-'owner_id') || '{"practice_only":true,"can_publish":false}'::jsonb;
END $$;
REVOKE ALL ON FUNCTION hllv_private.rehearsal(text,jsonb,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION hllv_private.rehearsal(text,jsonb,uuid,integer) TO authenticated;
CREATE FUNCTION public.hllv_rehearsal(action text DEFAULT 'get',payload jsonb DEFAULT '{}'::jsonb,expected_id uuid DEFAULT NULL,expected_version integer DEFAULT NULL) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT hllv_private.rehearsal(action,payload,expected_id,expected_version) $$;
REVOKE ALL ON FUNCTION public.hllv_rehearsal(text,jsonb,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hllv_rehearsal(text,jsonb,uuid,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
