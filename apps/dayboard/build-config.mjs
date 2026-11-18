/** Release checks record completed operator setup; the database and Auth hook enforce admission. */
export function resolveTeamConfig(source = {}, env = {}) {
  const enabled = env.DAYBOARD_TEAMS_ENABLED === undefined ? source.enabled === true : env.DAYBOARD_TEAMS_ENABLED === 'true';
  if (!enabled) return {enabled: false, url: '', publishableKey: '', emailProvider: ''};
  const config = {
    enabled: true,
    url: env.DAYBOARD_SUPABASE_URL || source.url,
    publishableKey: env.DAYBOARD_SUPABASE_PUBLISHABLE_KEY || source.publishableKey,
    emailProvider: (env.DAYBOARD_EMAIL_PROVIDER || source.emailProvider || '').trim(),
  };
  const backend = new URL(config.url);
  if (backend.protocol !== 'https:' || backend.username || backend.password || backend.pathname !== '/' || backend.search || backend.hash) throw new Error('Team backend must be an HTTPS origin.');
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.publishableKey)) throw new Error('Team mode requires a publishable API key. Secret and service-role keys are not accepted.');
  if (!config.emailProvider || config.emailProvider.length > 80 || /[\x00-\x1f\x7f]/.test(config.emailProvider)) throw new Error('Identify the configured sign-in email provider with DAYBOARD_EMAIL_PROVIDER before enabling shared mode.');
  if (env.DAYBOARD_AUTH_ADMISSION_VERIFIED !== 'true') throw new Error('Verify the registered Before User Created hook rejects uninvited accounts, then set DAYBOARD_AUTH_ADMISSION_VERIFIED=true.');
  if (env.DAYBOARD_SMTP_VERIFIED !== 'true') throw new Error('Verify sign-in delivery to an invited non-organization account, then set DAYBOARD_SMTP_VERIFIED=true.');
  config.url = backend.origin;
  return config;
}
