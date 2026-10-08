"""Idempotent explicit-null guards for the initial, not-yet-provisioned schema."""
from pathlib import Path
p=Path('suggestion_box/migrations/001_pilot.sql')
s=p.read_text()
s=s.replace('s.version<>expected_version','s.version IS DISTINCT FROM expected_version').replace('b.version<>expected_version','b.version IS DISTINCT FROM expected_version')
for old,new in [
 ('OR m.authorized_until<=now()','OR m.authorized_until IS NULL OR m.authorized_until<=now()'),
 ('OR cfg.voting_until<=clock_timestamp()','OR cfg.voting_until IS NULL OR cfg.voting_until<=clock_timestamp()')
]:
 if new not in s:
  s=s.replace(old,new)
p.write_text(s)
