-- Optional separate migration after confirming pg_cron is available and supported.
-- This is the internal retention job for the pilot, not an outreach automation.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
select cron.schedule(
  'lmw-pilot-retention-cleanup',
  '17 * * * *',
  $job$
    select public.lmw_cleanup_expired();
    delete from cron.job_run_details
      where jobid = (
        select jobid from cron.job
          where jobname = 'lmw-pilot-retention-cleanup' and username = current_user
      )
      and end_time < now() - interval '7 days';
  $job$
);
