"""Idempotent guards for the initial, not-yet-provisioned pilot schema."""
from pathlib import Path
p=Path('suggestion_box/migrations/001_pilot.sql')
s=p.read_text()
s=s.replace('s.version<>expected_version','s.version IS DISTINCT FROM expected_version').replace('b.version<>expected_version','b.version IS DISTINCT FROM expected_version')
for old,new in [
 ('OR m.authorized_until<=now()','OR m.authorized_until IS NULL OR m.authorized_until<=now()'),
 ('OR cfg.voting_until<=clock_timestamp()','OR cfg.voting_until IS NULL OR cfg.voting_until<=clock_timestamp()')
]:
 if new not in s:s=s.replace(old,new)
old='WHERE m.user_id=u AND m.active AND a.email_confirmed_at IS NOT NULL;'
new="""WHERE m.user_id=u AND m.active AND a.email_confirmed_at IS NOT NULL
 AND (m.role<>'reviewer' OR (m.authorized_until>now()
 AND length(btrim(coalesce(m.authorization_reference,'')))>=8
 AND length(btrim(coalesce(m.public_label,'')))>=3));"""
if old in s:s=s.replace(old,new,1)
else:assert new in s,'Actor authorization integration changed'
p.write_text(s)
