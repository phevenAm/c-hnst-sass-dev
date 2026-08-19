-- "users can delete own notifications" already exists live in production —
-- added directly via the dashboard at some point and never captured in a
-- migration, so a fresh database built from this repo's migrations would be
-- missing it (Clear all / dismiss on NotificationBell would silently no-op
-- under RLS). Recording it here so migration history matches reality.

do $func$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'notifications'
      and policyname = 'users can delete own notifications'
  ) then
    execute $pol$
      create policy "users can delete own notifications"
        on public.notifications
        for delete
        using (user_id = auth.uid())
    $pol$;
  end if;
end $func$;
