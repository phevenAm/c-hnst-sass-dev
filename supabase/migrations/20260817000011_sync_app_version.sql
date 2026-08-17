-- Sync system_config app_version to the current release.
-- The seed migration set this to 3.5.0; the app is now 4.1.2.
-- Update this value with each release so the PWA update banner only
-- shows when a genuinely newer build is available.
insert into public.system_config (key, value)
values ('app_version', '4.1.2')
on conflict (key) do update set value = excluded.value, updated_at = now();
