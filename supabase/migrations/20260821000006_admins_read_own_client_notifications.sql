-- Admins insert notifications for their clients from the browser (e.g.
-- decline-cancellation, decline-reschedule, accept-reschedule handlers in
-- AdminClientsPageDetailed.tsx) using the anon-key client, subject to RLS.
-- Postgres/PostgREST checks the table's SELECT policy on the row an INSERT
-- produces (needed to compute the response), not just the INSERT policy's
-- WITH CHECK — so an admin inserting a row whose user_id is the *client's*
-- id, not their own, can fail RLS even though "admins can insert
-- notifications" WITH CHECK passes, because the only existing SELECT policy
-- is "user_id = auth.uid()". This adds the missing SELECT policy, scoped to
-- notifications for the admin's own clients (mirrors "admins view own
-- clients" on public.users) rather than opening it to all notifications.
create policy "admins can read own clients notifications"
  on public.notifications for select
  using (
    exists (
      select 1 from public.users
      where users.id = notifications.user_id
        and users.admin_id = auth.uid()
    )
  );
