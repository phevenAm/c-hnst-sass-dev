-- Lets an admin pick a fixed calendar colour for a client, mirroring
-- agency_members.color (20260914000010). Previously every client's colour
-- was purely a hash of their id (schedulerUtils.ts's colourForClient) with
-- no way to override it. Nullable: unset clients keep the hash-derived
-- colour as a fallback. CHECK constraint because — unlike agency_members,
-- which is written only through the set-agency-member edge function — this
-- column is written directly from the browser (admin already owns the row
-- via existing users RLS), so there's no server-side gate validating the
-- hex format before it reaches the table.
alter table public.users
  add column if not exists color text
    check (color is null or color ~ '^#[0-9a-fA-F]{6}$');

notify pgrst, 'reload schema';
