-- Storage quotas become a per-tier lever (previously starter+growth shared 2.5
-- GiB, unlimited 5 GiB).
--
--   starter ....  0        -- no file storage; the /admin/files feature is
--                             hidden in the app for this tier
--   growth .....  2.5 GiB
--   unlimited ..  10  GiB
--   agency .....  10  GiB   -- unchanged; agencies.max_storage_bytes default
--
-- Data-only: just three UPDATEs against the plan_limits reference table. No
-- schema change, no locks, no PostgREST reload needed.

update public.plan_limits set max_storage_bytes = 0           where plan = 'starter';   -- no storage
update public.plan_limits set max_storage_bytes = 2684354560  where plan = 'growth';    -- 2.5 GiB
update public.plan_limits set max_storage_bytes = 10737418240 where plan = 'unlimited'; -- 10  GiB

-- file_storage_quota() already returns 0 verbatim for starter (coalesce only
-- covers a NULL / missing row), so the file_enforce_quota trigger blocks every
-- upload on that tier as a server-side backstop to the hidden UI.
