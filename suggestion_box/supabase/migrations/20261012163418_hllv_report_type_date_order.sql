-- Add a community problem-report type without changing publication authority.
ALTER TABLE hllv_private.submissions DROP CONSTRAINT submissions_kind_check;
ALTER TABLE hllv_private.submissions ADD CONSTRAINT submissions_kind_check
 CHECK(kind IN ('suggestion','bug_priority') OR (kind='problem_report' AND publication_mode='community'));
-- Preserve the already-audited dispatcher; change only chronological list ordering.
DO $$
DECLARE src text:=pg_get_functiondef('hllv_private.community(text,jsonb)'::regprocedure);
 old_select text:='SELECT s.id,s.created_at,coalesce(a.approved_at,s.created_at) published_at';
 old_order text:=$old$CASE WHEN action='queue' THEN created_at END ASC,
    CASE WHEN action<>'queue' THEN published_at END DESC,id$old$;
 new_order text:=$new$CASE WHEN payload->>'order'='oldest' THEN CASE WHEN action='board' THEN published_at ELSE updated_at END END ASC,
    CASE WHEN coalesce(payload->>'order','newest')<>'oldest' THEN CASE WHEN action='board' THEN published_at ELSE updated_at END END DESC,id$new$;
BEGIN
 IF strpos(src,old_select)=0 OR strpos(src,old_order)=0 THEN
  RAISE EXCEPTION 'Community dispatcher changed: review list ordering before applying this migration.';
 END IF;
 src:=replace(src,old_select,'SELECT s.id,s.created_at,s.updated_at,coalesce(a.approved_at,s.created_at) published_at');
 src:=replace(src,old_order,new_order);
 EXECUTE src;
END $$;
NOTIFY pgrst,'reload schema';
