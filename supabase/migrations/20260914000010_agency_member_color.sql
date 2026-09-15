-- Per-staff colour for the agency sessions calendar (src/pages/agency/AgencySessionsPage),
-- configured on the member detail page. Managers only, via the existing
-- setAgencyMember RPC path — see set-agency-member edge function.
alter table public.agency_members
  add column if not exists color text;

notify pgrst, 'reload schema';
