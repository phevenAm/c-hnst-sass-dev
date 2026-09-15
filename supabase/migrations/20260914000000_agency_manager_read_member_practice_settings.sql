-- Agency managers need read access to a member's practice_settings (phone,
-- address, business name) to show it on the new member detail page — see
-- src/pages/agency/AgencyMemberDetailPage. Deliberately SELECT-only: a
-- freelance member still owns/edits their own business details themselves
-- (see src/pages/common/SettingsPage isAgencyEmployee gating), a manager
-- should not be able to silently change it.
create policy "agency managers act for members"
  on public.practice_settings
  for select
  using (acts_for_admin(admin_id));

notify pgrst, 'reload schema';
