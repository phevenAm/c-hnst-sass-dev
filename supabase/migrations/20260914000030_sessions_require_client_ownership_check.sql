-- ─────────────────────────────────────────────────────────────────────────────
-- Close a gap that let an admin create/update a `sessions` row for a client
-- who isn't theirs.
--
-- Found while investigating: smissah94 (a real admin) was getting session-prep
-- reminders about "Cassie" — the demo client, owned by the demo admin
-- (63aeb602-…), not by smissah94. 34 of Cassie's `sessions` rows had
-- created_by = smissah94's id, dated 15 Jul – 27 Aug 2026, several `paid =
-- true` with real price_pence — real test bookings against a client outside
-- his roster, not a seeding artefact.
--
-- Root cause: neither "admins manage own sessions" nor "agency managers act
-- for members" ever checked that `client_id` actually belongs to
-- `created_by`. Both only checked the *admin* side:
--   admins manage own sessions:      using (created_by = auth.uid())          -- no with check at all
--   agency managers act for members: using/with check acts_for_admin(created_by)
-- acts_for_admin(p) returns true whenever `p = auth.uid()` (self) OR the
-- caller manages p's agency — so for an ordinary admin acting on themselves,
-- BOTH policies already passed unconditionally. Since RLS permissive policies
-- OR together, tightening only one still leaves the other as a bypass, so
-- both get the same check here.
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists "admins manage own sessions" on public.sessions;
create policy "admins manage own sessions"
  on public.sessions
  for all
  using (created_by = auth.uid())
  with check (
    created_by = auth.uid()
    and exists (select 1 from public.users u where u.id = client_id and u.admin_id = created_by)
  );

drop policy if exists "agency managers act for members" on public.sessions;
create policy "agency managers act for members"
  on public.sessions
  for all
  using (acts_for_admin(created_by))
  with check (
    acts_for_admin(created_by)
    and exists (select 1 from public.users u where u.id = client_id and u.admin_id = created_by)
  );
