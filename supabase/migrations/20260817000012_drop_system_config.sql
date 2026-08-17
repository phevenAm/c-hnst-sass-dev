-- system_config was used for a DB-side app version check that has been
-- removed. version.json (regenerated on every build) handles this instead.
drop table if exists public.system_config;
