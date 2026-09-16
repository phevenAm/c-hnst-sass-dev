-- Agencies: lock a client's session rate to the agency-set default_rate_pence
-- unless the manager explicitly allows the assigned staff member to charge
-- their own rate — stops staff overcharging (or undercharging) a client
-- above/below what the agency agreed, by default.
alter table public.client_stubs
  add column if not exists allow_staff_custom_rate boolean not null default false;

comment on column public.client_stubs.allow_staff_custom_rate is
  'When false (default) and default_rate_pence is set, the assigned staff member cannot charge this client a different rate — enforced client-side in CreateSessionModal. When true, or default_rate_pence is null, the fee is freely editable.';

notify pgrst, 'reload schema';
