-- Invitation-only Suggestion Box. Apply to a DEDICATED Supabase project.
-- No private user data or authorization evidence belongs in Git.
BEGIN;
CREATE SCHEMA hllv_private;
REVOKE ALL ON SCHEMA hllv_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA hllv_private TO anon, authenticated;
CREATE TABLE hllv_private.settings (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 phase text NOT NULL DEFAULT 'setup' CHECK(phase IN ('setup','intake','review','voting','closed')),
 publication_authorized boolean NOT NULL DEFAULT false,
 protocol_reference text, voting_until timestamptz,
 policy_version text NOT NULL DEFAULT 'pilot-2026-10-08'
);
INSERT INTO hllv_private.settings DEFAULT VALUES;
CREATE TABLE hllv_private.members (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 role text NOT NULL CHECK(role IN ('participant','moderator','reviewer')),
 active boolean NOT NULL DEFAULT true,
 public_label text, authorization_reference text, authorized_until timestamptz,
 added_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE hllv_private.issue_links(id text PRIMARY KEY CHECK(id ~ '^HLLV-[0-9]{3,6}$'));
CREATE TABLE hllv_private.submissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('suggestion','bug_priority')),
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 8 AND 120),
 problem text NOT NULL CHECK(length(btrim(problem)) BETWEEN 20 AND 1500),
 desired_outcome text NOT NULL CHECK(length(btrim(desired_outcome)) BETWEEN 10 AND 1000),
 related_issue text REFERENCES hllv_private.issue_links(id),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 owner_accepted_version integer NOT NULL DEFAULT 1,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','needs_information','shortlisted','declined','duplicate','withdrawn','published')),
 submitter_note text NOT NULL DEFAULT '' CHECK(length(submitter_note)<=1000),
 duplicate_of uuid REFERENCES hllv_private.submissions(id), policy_version text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(kind<>'bug_priority' OR related_issue IS NOT NULL)
);
CREATE TABLE hllv_private.reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 suggestion_id uuid NOT NULL REFERENCES hllv_private.submissions(id) ON DELETE CASCADE,
 version integer NOT NULL, reviewer_id uuid NOT NULL REFERENCES auth.users(id),
 decision text NOT NULL CHECK(decision IN ('cleared','clarify','hold')),
 public_label text NOT NULL,
 implementation text NOT NULL CHECK(implementation IN ('no_commitment','under_consideration','planned','not_planned')),
 public_response text NOT NULL CHECK(length(public_response)<=1000),
 private_reference text NOT NULL CHECK(length(btrim(private_reference)) BETWEEN 8 AND 1000),
 reviewed_at timestamptz NOT NULL DEFAULT now()
);
-- Separate allowlisted projection: never send the private row to the public browser.
CREATE TABLE hllv_private.board (
 id uuid PRIMARY KEY REFERENCES hllv_private.submissions(id) ON DELETE CASCADE,
 version integer NOT NULL,kind text NOT NULL,title text NOT NULL,problem text NOT NULL,
 desired_outcome text NOT NULL,related_issue text,
 review_id uuid NOT NULL REFERENCES hllv_private.reviews(id),
 review_label text NOT NULL,reviewed_at timestamptz NOT NULL,
 implementation text NOT NULL,public_response text NOT NULL,
 published_at timestamptz NOT NULL DEFAULT now(),visible boolean NOT NULL DEFAULT true
);
CREATE TABLE hllv_private.votes (
 suggestion_id uuid NOT NULL REFERENCES hllv_private.submissions(id) ON DELETE CASCADE,
 version integer NOT NULL,voter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(suggestion_id,version,voter_id)
);
CREATE TABLE hllv_private.audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor_id uuid,suggestion_id uuid,action text NOT NULL,version integer,
 detail jsonb NOT NULL DEFAULT '{}'::jsonb,happened_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE hllv_private.versions (
 suggestion_id uuid NOT NULL REFERENCES hllv_private.submissions(id) ON DELETE CASCADE,
 version integer NOT NULL,wording jsonb NOT NULL,recorded_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(suggestion_id,version)
);
CREATE TABLE hllv_private.rate_limits (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 window_start timestamptz NOT NULL,requests integer NOT NULL
);
CREATE INDEX ON hllv_private.submissions(owner_id);
CREATE INDEX ON hllv_private.reviews(suggestion_id,version,reviewed_at DESC);
CREATE INDEX ON hllv_private.votes(suggestion_id,version);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['settings','members','issue_links','submissions','reviews','board','votes','audit','rate_limits','versions'] LOOP
  EXECUTE format('ALTER TABLE hllv_private.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON hllv_private.%I FROM PUBLIC, anon, authenticated',t);
 END LOOP;
END $$;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA hllv_private FROM PUBLIC,anon,authenticated;
CREATE FUNCTION hllv_private.capture_version() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO hllv_private.versions(suggestion_id,version,wording)
 VALUES(NEW.id,NEW.version,jsonb_build_object('kind',NEW.kind,'title',NEW.title,'problem',NEW.problem,'desired_outcome',NEW.desired_outcome,'related_issue',NEW.related_issue)) ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
CREATE TRIGGER preserve_wording AFTER INSERT OR UPDATE OF version ON hllv_private.submissions
 FOR EACH ROW EXECUTE FUNCTION hllv_private.capture_version();
-- Membership is operator-assigned. User metadata or an email domain cannot grant roles.
CREATE FUNCTION hllv_private.actor(required_role text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid();r text;
BEGIN
 SELECT m.role INTO r FROM hllv_private.members m JOIN auth.users a ON a.id=m.user_id
 WHERE m.user_id=u AND m.active AND a.email_confirmed_at IS NOT NULL;
 IF r IS NULL OR (required_role IS NOT NULL AND r<>required_role) THEN
 RAISE EXCEPTION 'An active, verified pilot invitation with the required role is needed.' USING ERRCODE='42501'; END IF;
 RETURN u;
END $$;
CREATE FUNCTION hllv_private.rate_check(u uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n integer;
BEGIN
 -- Serialize capacity/publication transactions for this deliberately small pilot.
 PERFORM pg_catalog.pg_advisory_xact_lock(734210,1);
 INSERT INTO hllv_private.rate_limits VALUES(u,clock_timestamp(),1)
 ON CONFLICT(user_id) DO UPDATE SET
 requests=CASE WHEN hllv_private.rate_limits.window_start<clock_timestamp()-interval '1 minute' THEN 1 ELSE hllv_private.rate_limits.requests+1 END,
 window_start=CASE WHEN hllv_private.rate_limits.window_start<clock_timestamp()-interval '1 minute' THEN clock_timestamp() ELSE hllv_private.rate_limits.window_start END RETURNING requests INTO n;
 IF n>30 THEN RAISE EXCEPTION 'Please pause before trying again.'; END IF;
END $$;
CREATE FUNCTION hllv_private.ready_review() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT s.publication_authorized AND length(btrim(coalesce(s.protocol_reference,'')))>=8
 AND EXISTS(SELECT 1 FROM hllv_private.members m JOIN auth.users a ON a.id=m.user_id
 WHERE m.active AND m.role='reviewer' AND a.email_confirmed_at IS NOT NULL
 AND length(btrim(coalesce(m.public_label,'')))>=3
 AND length(btrim(coalesce(m.authorization_reference,'')))>=8 AND m.authorized_until>now())
 FROM hllv_private.settings s WHERE s.id
$$;
CREATE FUNCTION hllv_private.status() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('phase',s.phase,'intake_open',s.phase='intake' AND hllv_private.ready_review(),
 'voting_open',s.phase='voting' AND s.voting_until>now() AND hllv_private.ready_review(),
 'voting_until',s.voting_until,'policy_version',s.policy_version,
 'participant_limit',20,'submission_limit',15,'per_person_limit',2,'shortlist_limit',5)
 FROM hllv_private.settings s WHERE s.id
$$;
CREATE FUNCTION hllv_private.profile() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=hllv_private.actor();result jsonb;
BEGIN
 SELECT jsonb_build_object('role',role,'public_label',CASE WHEN role='reviewer' THEN public_label ELSE NULL END)
 INTO result FROM hllv_private.members WHERE user_id=u;RETURN result;
END $$;
CREATE FUNCTION hllv_private.public_board() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(row_data ORDER BY vote_total DESC,published_at,id),'[]'::jsonb) FROM (
 SELECT b.id,b.published_at,
 (SELECT count(*) FROM hllv_private.votes v JOIN hllv_private.members m ON m.user_id=v.voter_id
 WHERE v.suggestion_id=b.id AND v.version=b.version AND m.active AND m.role='participant') AS vote_total,
 jsonb_build_object('id',b.id,'version',b.version,'kind',b.kind,'title',b.title,'problem',b.problem,
 'desired_outcome',b.desired_outcome,'related_issue',b.related_issue,'review_label',b.review_label,
 'reviewed_at',b.reviewed_at,'implementation',b.implementation,'public_response',b.public_response,
 'published_at',b.published_at,
 'votes',(SELECT count(*) FROM hllv_private.votes v JOIN hllv_private.members m ON m.user_id=v.voter_id
 WHERE v.suggestion_id=b.id AND v.version=b.version AND m.active AND m.role='participant'),
 'my_vote',EXISTS(SELECT 1 FROM hllv_private.votes v JOIN hllv_private.members m ON m.user_id=v.voter_id
 WHERE v.suggestion_id=b.id AND v.version=b.version AND v.voter_id=auth.uid() AND m.active)) AS row_data
 FROM hllv_private.board b JOIN hllv_private.submissions s ON s.id=b.id
 JOIN hllv_private.reviews r ON r.id=b.review_id JOIN hllv_private.members reviewer ON reviewer.user_id=r.reviewer_id
 WHERE b.visible AND s.state='published' AND s.version=b.version AND s.owner_accepted_version=b.version
 AND r.decision='cleared' AND r.version=b.version AND reviewer.active AND reviewer.role='reviewer'
 AND reviewer.authorized_until>now() AND hllv_private.ready_review()
 AND NOT EXISTS(SELECT 1 FROM hllv_private.reviews newer WHERE newer.suggestion_id=b.id
 AND newer.version=b.version AND newer.reviewed_at>r.reviewed_at)) q
$$;
CREATE FUNCTION hllv_private.submit(payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=hllv_private.actor('participant');id_out uuid;cfg hllv_private.settings;
BEGIN
 PERFORM hllv_private.rate_check(u);SELECT * INTO cfg FROM hllv_private.settings WHERE id;
 IF cfg.phase<>'intake' OR hllv_private.ready_review() IS NOT TRUE THEN RAISE EXCEPTION 'Pilot intake is closed.'; END IF;
 IF (SELECT count(*) FROM hllv_private.members WHERE active AND role='participant')>20 THEN RAISE EXCEPTION 'Pilot invitation capacity requires operator review.'; END IF;
 IF (SELECT count(*) FROM hllv_private.submissions)>=15 THEN RAISE EXCEPTION 'This pilot intake is full.'; END IF;
 IF (SELECT count(*) FROM hllv_private.submissions WHERE owner_id=u)>=2 THEN RAISE EXCEPTION 'The pilot limit is two submissions per participant.'; END IF;
 IF coalesce(payload->>'policy_version','')<>cfg.policy_version OR coalesce(payload->>'consent','')<>'true' THEN RAISE EXCEPTION 'Please read and accept the current pilot notice.'; END IF;
 INSERT INTO hllv_private.submissions(owner_id,kind,title,problem,desired_outcome,related_issue,policy_version)
 VALUES(u,payload->>'kind',btrim(payload->>'title'),btrim(payload->>'problem'),btrim(payload->>'desired_outcome'),nullif(payload->>'related_issue',''),cfg.policy_version) RETURNING id INTO id_out;
 INSERT INTO hllv_private.audit(actor_id,suggestion_id,action,version) VALUES(u,id_out,'submitted_private',1);
 RETURN jsonb_build_object('id',id_out,'state','pending','version',1);
END $$;
CREATE FUNCTION hllv_private.mine() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'kind',s.kind,'title',s.title,'problem',s.problem,
 'desired_outcome',s.desired_outcome,'related_issue',s.related_issue,'version',s.version,
 'owner_accepted_version',s.owner_accepted_version,'state',s.state,'submitter_note',s.submitter_note,
 'created_at',s.created_at,'updated_at',s.updated_at) ORDER BY s.created_at DESC),'[]'::jsonb)
 FROM hllv_private.submissions s WHERE owner_id=hllv_private.actor()
$$;
CREATE FUNCTION hllv_private.edit(suggestion uuid,expected_version integer,payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=hllv_private.actor();s hllv_private.submissions;r text;
BEGIN
 PERFORM hllv_private.rate_check(u);SELECT role INTO r FROM hllv_private.members WHERE user_id=u;
 SELECT * INTO s FROM hllv_private.submissions WHERE id=suggestion FOR UPDATE;
 IF NOT FOUND OR (s.owner_id<>u AND r<>'moderator') THEN RAISE EXCEPTION 'Submission unavailable.' USING ERRCODE='42501'; END IF;
 IF s.version IS DISTINCT FROM expected_version THEN RAISE EXCEPTION 'This version changed. Reload before editing.'; END IF;
 IF s.state IN ('withdrawn','duplicate','declined') THEN RAISE EXCEPTION 'This submission is closed.'; END IF;
 UPDATE hllv_private.submissions SET title=btrim(payload->>'title'),problem=btrim(payload->>'problem'),
 desired_outcome=btrim(payload->>'desired_outcome'),related_issue=nullif(payload->>'related_issue',''),
 kind=payload->>'kind',version=s.version+1,owner_accepted_version=CASE WHEN s.owner_id=u THEN s.version+1 ELSE 0 END,
 state='pending',submitter_note='Wording changed. Publication and review must be repeated.',updated_at=clock_timestamp() WHERE id=suggestion;
 UPDATE hllv_private.board SET visible=false WHERE id=suggestion;
 INSERT INTO hllv_private.audit(actor_id,suggestion_id,action,version,detail) VALUES(u,suggestion,'edited_review_invalidated',s.version+1,jsonb_build_object('previous_version',s.version));
 RETURN jsonb_build_object('id',suggestion,'state','pending','version',s.version+1);
END $$;
CREATE FUNCTION hllv_private.accept_version(suggestion uuid,expected_version integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=hllv_private.actor('participant');
BEGIN
 PERFORM hllv_private.rate_check(u);
 UPDATE hllv_private.submissions SET owner_accepted_version=version,updated_at=clock_timestamp()
 WHERE id=suggestion AND owner_id=u AND version=expected_version AND state IN ('pending','needs_information');
 IF NOT FOUND THEN RAISE EXCEPTION 'Submission unavailable or version changed.'; END IF;
 INSERT INTO hllv_private.audit(actor_id,suggestion_id,action,version) VALUES(u,suggestion,'owner_accepted_wording',expected_version);
 RETURN jsonb_build_object('accepted',true);
END $$;
CREATE FUNCTION hllv_private.withdraw(suggestion uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=hllv_private.actor('participant');v integer;
BEGIN
 PERFORM hllv_private.rate_check(u);
 UPDATE hllv_private.submissions SET state='withdrawn',updated_at=clock_timestamp() WHERE id=suggestion AND owner_id=u RETURNING version INTO v;
 IF NOT FOUND THEN RAISE EXCEPTION 'Submission unavailable.' USING ERRCODE='42501'; END IF;
 UPDATE hllv_private.board SET visible=false WHERE id=suggestion;
 INSERT INTO hllv_private.audit(actor_id,suggestion_id,action,version) VALUES(u,suggestion,'withdrawn',v);
 RETURN jsonb_build_object('withdrawn',true);
END $$;
CREATE FUNCTION hllv_private.queue() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=hllv_private.actor();r text;
BEGIN
 SELECT role INTO r FROM hllv_private.members WHERE user_id=u;
 IF r NOT IN ('moderator','reviewer') THEN RAISE EXCEPTION 'Review access required.' USING ERRCODE='42501'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'problem',s.problem,
 'desired_outcome',s.desired_outcome,'kind',s.kind,'related_issue',s.related_issue,'version',s.version,
 'owner_accepted_version',s.owner_accepted_version,'state',s.state,'submitter_note',s.submitter_note,
 'last_decision',(SELECT x.decision FROM hllv_private.reviews x WHERE x.suggestion_id=s.id AND x.version=s.version ORDER BY x.reviewed_at DESC LIMIT 1)) ORDER BY s.created_at),'[]'::jsonb)
 FROM hllv_private.submissions s WHERE (r='moderator' OR s.state='shortlisted') AND s.state<>'withdrawn');
END $$;
CREATE FUNCTION hllv_private.moderate(suggestion uuid,expected_version integer,decision text,note text,duplicate_of uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=hllv_private.actor('moderator');s hllv_private.submissions;
BEGIN
 PERFORM hllv_private.rate_check(u);
 IF decision NOT IN ('needs_information','shortlisted','declined','duplicate','pending') OR length(note)>1000 THEN RAISE EXCEPTION 'Invalid moderation decision.'; END IF;
 SELECT * INTO s FROM hllv_private.submissions WHERE id=suggestion FOR UPDATE;
 IF NOT FOUND OR s.state='withdrawn' OR s.version IS DISTINCT FROM expected_version THEN RAISE EXCEPTION 'Submission unavailable or version changed.'; END IF;
 IF decision='shortlisted' THEN
 IF s.owner_accepted_version<>s.version THEN RAISE EXCEPTION 'The submitter must accept the revised wording first.'; END IF;
 IF (SELECT count(*) FROM hllv_private.submissions WHERE state='shortlisted' AND id<>suggestion)>=5 THEN RAISE EXCEPTION 'Review at most five suggestions per pilot batch.'; END IF;
 END IF;
 IF decision='duplicate' AND (duplicate_of IS NULL OR duplicate_of=suggestion OR NOT EXISTS(SELECT 1 FROM hllv_private.submissions WHERE id=moderate.duplicate_of)) THEN RAISE EXCEPTION 'Select a different existing duplicate target.'; END IF;
 UPDATE hllv_private.submissions SET state=decision,submitter_note=coalesce(note,''),duplicate_of=CASE WHEN decision='duplicate' THEN moderate.duplicate_of ELSE NULL END,updated_at=clock_timestamp() WHERE id=suggestion;
 UPDATE hllv_private.board SET visible=false WHERE id=suggestion;
 INSERT INTO hllv_private.audit(actor_id,suggestion_id,action,version,detail) VALUES(u,suggestion,'moderated',s.version,jsonb_build_object('decision',decision));
 RETURN jsonb_build_object('state',decision);
END $$;
CREATE FUNCTION hllv_private.record_review(suggestion uuid,expected_version integer,decision text,implementation text,public_response text,private_reference text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=hllv_private.actor('reviewer');s hllv_private.submissions;m hllv_private.members;
BEGIN
 PERFORM hllv_private.rate_check(u);SELECT * INTO m FROM hllv_private.members WHERE user_id=u;
 IF hllv_private.ready_review() IS NOT TRUE OR m.authorized_until IS NULL OR m.authorized_until<=now() OR length(btrim(coalesce(m.authorization_reference,'')))<8 OR length(btrim(coalesce(m.public_label,'')))<3 THEN RAISE EXCEPTION 'Reviewer authorization is not configured or has expired.' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM hllv_private.submissions WHERE id=suggestion FOR UPDATE;
 IF NOT FOUND OR s.state NOT IN ('shortlisted','published') OR s.version IS DISTINCT FROM expected_version OR s.owner_accepted_version<>s.version THEN RAISE EXCEPTION 'The accepted, shortlisted version is required.'; END IF;
 IF s.owner_id=u THEN RAISE EXCEPTION 'Self-review is not permitted.' USING ERRCODE='42501'; END IF;
 INSERT INTO hllv_private.reviews(suggestion_id,version,reviewer_id,decision,public_label,implementation,public_response,private_reference)
 VALUES(suggestion,s.version,u,decision,m.public_label,implementation,coalesce(public_response,''),private_reference);
 UPDATE hllv_private.board SET visible=false WHERE id=suggestion;
 UPDATE hllv_private.submissions SET state='shortlisted',updated_at=clock_timestamp() WHERE id=suggestion;
 INSERT INTO hllv_private.audit(actor_id,suggestion_id,action,version,detail) VALUES(u,suggestion,'review_recorded',s.version,jsonb_build_object('decision',decision));
 RETURN jsonb_build_object('decision',decision,'published',false);
END $$;
CREATE FUNCTION hllv_private.publish_batch(suggestions uuid[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=hllv_private.actor('moderator');sid uuid;s hllv_private.submissions;r hllv_private.reviews;cfg hllv_private.settings;
BEGIN
 PERFORM hllv_private.rate_check(u);SELECT * INTO cfg FROM hllv_private.settings WHERE id;
 IF cfg.phase<>'review' OR hllv_private.ready_review() IS NOT TRUE THEN RAISE EXCEPTION 'The agreed review phase and publication authorization are required.'; END IF;
 IF coalesce(cardinality(suggestions),0) NOT BETWEEN 1 AND 5 OR cardinality(suggestions)<>(SELECT count(DISTINCT x) FROM unnest(suggestions) x) THEN RAISE EXCEPTION 'Choose one to five distinct cleared entries.'; END IF;
 IF EXISTS(SELECT 1 FROM hllv_private.board WHERE visible) THEN RAISE EXCEPTION 'Close or unpublish the previous pilot batch before a new voting window.'; END IF;
 FOREACH sid IN ARRAY suggestions LOOP
 SELECT * INTO s FROM hllv_private.submissions WHERE id=sid FOR UPDATE;
 IF NOT FOUND OR s.state<>'shortlisted' OR s.owner_accepted_version<>s.version THEN RAISE EXCEPTION 'Every item must be shortlisted with accepted wording.'; END IF;
 SELECT * INTO r FROM hllv_private.reviews WHERE suggestion_id=sid AND version=s.version ORDER BY reviewed_at DESC LIMIT 1;
 IF NOT FOUND OR r.decision<>'cleared' OR r.reviewer_id=u OR NOT EXISTS(SELECT 1 FROM hllv_private.members WHERE user_id=r.reviewer_id AND active AND role='reviewer' AND authorized_until>now()) THEN RAISE EXCEPTION 'Explicit, current reviewer clearance of every exact version is required.'; END IF;
 INSERT INTO hllv_private.board(id,version,kind,title,problem,desired_outcome,related_issue,review_id,review_label,reviewed_at,implementation,public_response)
 VALUES(s.id,s.version,s.kind,s.title,s.problem,s.desired_outcome,s.related_issue,r.id,r.public_label,r.reviewed_at,r.implementation,r.public_response)
 ON CONFLICT(id) DO UPDATE SET version=excluded.version,kind=excluded.kind,title=excluded.title,problem=excluded.problem,
 desired_outcome=excluded.desired_outcome,related_issue=excluded.related_issue,review_id=excluded.review_id,
 review_label=excluded.review_label,reviewed_at=excluded.reviewed_at,implementation=excluded.implementation,
 public_response=excluded.public_response,published_at=clock_timestamp(),visible=true;
 UPDATE hllv_private.submissions SET state='published',updated_at=clock_timestamp() WHERE id=sid;
 INSERT INTO hllv_private.audit(actor_id,suggestion_id,action,version) VALUES(u,sid,'published',s.version);
 END LOOP;
 UPDATE hllv_private.settings SET phase='voting',voting_until=clock_timestamp()+interval '7 days' WHERE id;
 RETURN jsonb_build_object('published',cardinality(suggestions),'voting_days',7);
END $$;
CREATE FUNCTION hllv_private.vote(suggestion uuid,expected_version integer,support boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=hllv_private.actor('participant');cfg hllv_private.settings;b hllv_private.board;
BEGIN
 PERFORM hllv_private.rate_check(u);SELECT * INTO cfg FROM hllv_private.settings WHERE id;
 IF cfg.phase<>'voting' OR cfg.voting_until IS NULL OR cfg.voting_until<=clock_timestamp() OR hllv_private.ready_review() IS NOT TRUE THEN RAISE EXCEPTION 'Pilot voting is closed.'; END IF;
 SELECT * INTO b FROM hllv_private.board WHERE id=suggestion AND visible FOR UPDATE;
 IF NOT FOUND OR b.version IS DISTINCT FROM expected_version OR NOT EXISTS(SELECT 1 FROM hllv_private.submissions WHERE id=b.id AND state='published' AND version=b.version) THEN RAISE EXCEPTION 'This published version is unavailable.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM hllv_private.reviews r JOIN hllv_private.members m ON m.user_id=r.reviewer_id WHERE r.id=b.review_id AND m.active AND m.authorized_until>now()) THEN RAISE EXCEPTION 'This entry is awaiting review.'; END IF;
 IF support THEN INSERT INTO hllv_private.votes(suggestion_id,version,voter_id) VALUES(suggestion,b.version,u) ON CONFLICT DO NOTHING;
 ELSE DELETE FROM hllv_private.votes WHERE suggestion_id=vote.suggestion AND version=b.version AND voter_id=u; END IF;
 RETURN jsonb_build_object('supported',coalesce(support,false));
END $$;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA hllv_private FROM PUBLIC,anon,authenticated;
-- Public wrappers are SECURITY INVOKER; the private implementations enforce every decision.
CREATE FUNCTION public.hllv_pilot_status() RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT hllv_private.status() $$;
CREATE FUNCTION public.hllv_board() RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT hllv_private.public_board() $$;
CREATE FUNCTION public.hllv_profile() RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT hllv_private.profile() $$;
CREATE FUNCTION public.hllv_submit(payload jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT hllv_private.submit(payload) $$;
CREATE FUNCTION public.hllv_my_submissions() RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT hllv_private.mine() $$;
CREATE FUNCTION public.hllv_edit(suggestion uuid,expected_version integer,payload jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT hllv_private.edit(suggestion,expected_version,payload) $$;
CREATE FUNCTION public.hllv_accept_version(suggestion uuid,expected_version integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT hllv_private.accept_version(suggestion,expected_version) $$;
CREATE FUNCTION public.hllv_withdraw(suggestion uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT hllv_private.withdraw(suggestion) $$;
CREATE FUNCTION public.hllv_queue() RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT hllv_private.queue() $$;
CREATE FUNCTION public.hllv_moderate(suggestion uuid,expected_version integer,decision text,note text,duplicate_of uuid DEFAULT NULL) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT hllv_private.moderate(suggestion,expected_version,decision,note,duplicate_of) $$;
CREATE FUNCTION public.hllv_review(suggestion uuid,expected_version integer,decision text,implementation text,public_response text,private_reference text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT hllv_private.record_review(suggestion,expected_version,decision,implementation,public_response,private_reference) $$;
CREATE FUNCTION public.hllv_publish_batch(suggestions uuid[]) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT hllv_private.publish_batch(suggestions) $$;
CREATE FUNCTION public.hllv_vote(suggestion uuid,expected_version integer,support boolean) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT hllv_private.vote(suggestion,expected_version,support) $$;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('hllv_pilot_status','hllv_board','hllv_profile','hllv_submit','hllv_my_submissions','hllv_edit','hllv_accept_version','hllv_withdraw','hllv_queue','hllv_moderate','hllv_review','hllv_publish_batch','hllv_vote') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',f.sig);
 EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.sig);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.hllv_pilot_status(),public.hllv_board() TO anon;
GRANT EXECUTE ON FUNCTION hllv_private.status(),hllv_private.public_board() TO anon,authenticated;
GRANT EXECUTE ON FUNCTION hllv_private.profile(),hllv_private.submit(jsonb),hllv_private.mine(),hllv_private.edit(uuid,integer,jsonb),hllv_private.accept_version(uuid,integer),hllv_private.withdraw(uuid),hllv_private.queue(),hllv_private.moderate(uuid,integer,text,text,uuid),hllv_private.record_review(uuid,integer,text,text,text,text),hllv_private.publish_batch(uuid[]),hllv_private.vote(uuid,integer,boolean) TO authenticated;
COMMIT;
