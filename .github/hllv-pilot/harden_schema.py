"""Normalize explicit null handling before testing/publishing the initial SQL schema."""
from pathlib import Path
p=Path('suggestion_box/migrations/001_pilot.sql')
s=p.read_text().replace('s.version<>expected_version','s.version IS DISTINCT FROM expected_version').replace('b.version<>expected_version','b.version IS DISTINCT FROM expected_version').replace("OR m.authorized_until<=now()","OR m.authorized_until IS NULL OR m.authorized_until<=now()").replace("OR cfg.voting_until<=clock_timestamp()","OR cfg.voting_until IS NULL OR cfg.voting_until<=clock_timestamp()")
p.write_text(s)
