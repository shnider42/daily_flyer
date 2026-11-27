"""Read-only check: no registration, auth email, session or private data."""
import json
from pathlib import Path
from urllib.request import Request,urlopen
cfg=json.loads(Path('hllv_tracker/suggestions-config.json').read_text())
req=Request(cfg['supabase_url']+'/auth/v1/settings',headers={'apikey':cfg['publishable_key']})
with urlopen(req,timeout=20) as r:settings=json.load(r)
assert settings.get('disable_signup') is False,'New signups are disabled in Supabase Auth'
assert settings.get('external',{}).get('email') is True,'Email signup is disabled'
assert settings.get('mailer_autoconfirm') is False,'Email confirmation must remain required'
print('HOSTED_AUTH_SETTINGS_PASS: email signup allowed; email verification required. SMTP and recipient delivery are not exposed by this check.')
