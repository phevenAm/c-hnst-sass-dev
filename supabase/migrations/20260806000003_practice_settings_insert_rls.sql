-- Allow admins to INSERT their own practice_settings row from the browser client.
-- Without this, supabase.from("practice_settings").upsert() fails silently when
-- the row doesn't exist yet (e.g. accounts predating the handle_new_user trigger).

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'practice_settings'
      and policyname = 'Admins can insert own practice_settings'
  ) then
    execute $pol$
      create policy "Admins can insert own practice_settings"
        on public.practice_settings
        for insert
        to authenticated
        with check (admin_id = auth.uid())
    $pol$;
  end if;
end $$;

-- Backfill: create a practice_settings row for any admin who signed up before
-- the handle_new_user trigger was in place.
insert into public.practice_settings (admin_id)
select u.id
from   public.users u
left   join public.practice_settings ps on ps.admin_id = u.id
where  u.role = 'admin'
  and  ps.admin_id is null;
