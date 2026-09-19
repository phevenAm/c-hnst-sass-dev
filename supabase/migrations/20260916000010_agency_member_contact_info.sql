-- ─────────────────────────────────────────────────────────────────────────────
-- Two things found while chasing "staff Email/Phone shows Not set with no way
-- to enter it" (AgencyMemberDetailPage):
--
-- 1. A REAL DATA EXPOSURE: practice_settings actually carries a "agency
--    managers act for members" SELECT policy (acts_for_admin(admin_id)) —
--    contrary to 20260902010003's own header comment, which explicitly says
--    this table was "deliberately NOT widened" alongside users/sessions/
--    resources because it also holds bank_name/bank_account_number/
--    bank_sort_code and encryption key material. Whatever added this policy
--    (not found in this migration history — may predate it or be a manual
--    dashboard change) means an agency manager can currently read a
--    colleague's full row, bank details and encryption material included,
--    via a plain `.from("practice_settings").select("*")`. Dropped below.
--
-- 2. With that gone, the manager needs a SAFE, narrow way back in for the
--    legitimate case (AgencyMemberDetailPage's read-only Contact/Business
--    card) — and there was never any way to WRITE these fields for a member
--    who structurally can't set them themselves (an employee never sees the
--    editable Business information card in Settings, see isAgencyEmployee).
--    Two SECURITY DEFINER RPCs, touching only business_name/phone/address —
--    never bank_*, encryption keys, or anything else on that row.
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists "agency managers act for members" on public.practice_settings;

create or replace function public.get_agency_member_contact_info(p_member_id uuid)
returns table (business_name text, phone text, address text)
language sql stable security definer set search_path = ''
as $func$
  select ps.business_name, ps.phone, ps.address
    from public.practice_settings ps
    where ps.admin_id = p_member_id
      and public.acts_for_admin(p_member_id);
$func$;

create or replace function public.update_agency_member_contact_info(
  p_member_id uuid, p_business_name text, p_phone text, p_address text
)
returns void
language plpgsql security definer set search_path = ''
as $func$
begin
  if not public.acts_for_admin(p_member_id) then
    raise exception 'NOT_YOUR_MEMBER: you can only edit a member of your own agency';
  end if;

  update public.practice_settings
     set business_name = p_business_name, phone = p_phone, address = p_address
   where admin_id = p_member_id;
end;
$func$;

revoke all on function public.get_agency_member_contact_info(uuid) from public, anon;
revoke all on function public.update_agency_member_contact_info(uuid, text, text, text) from public, anon;
grant execute on function public.get_agency_member_contact_info(uuid) to authenticated;
grant execute on function public.update_agency_member_contact_info(uuid, text, text, text) to authenticated;

notify pgrst, 'reload schema';
