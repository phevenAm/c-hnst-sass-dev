-- practice_settings.counsellor_name (used for "Sent on behalf of <name>" in
-- client emails, see supabase/functions/_shared/email.ts) had no UI to edit
-- it — it could only be set by hand in the DB, which is how one practice
-- ended up sending client emails "on behalf of" a name that was never meant
-- to go out. Rather than add a second, separate "display name" field for
-- admins to keep in sync, this makes counsellor_name track the admin's
-- existing profile display name (users.display_name, already editable on
-- Settings → Profile) automatically, so there's a single field to maintain.
create or replace function public.sync_counsellor_name_from_display_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $func$
begin
  if new.role != 'admin' then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.display_name is not distinct from old.display_name then
    return new;
  end if;

  update public.practice_settings
  set counsellor_name = nullif(trim(new.display_name), '')
  where admin_id = new.id;
  return new;
end;
$func$;

drop trigger if exists sync_counsellor_name on public.users;
create trigger sync_counsellor_name
  after insert or update of display_name on public.users
  for each row
  execute function public.sync_counsellor_name_from_display_name();

-- Backfill: bring every existing admin's counsellor_name in line with their
-- current profile display name now, rather than waiting for their next edit.
update public.practice_settings ps
set counsellor_name = nullif(trim(u.display_name), '')
from public.users u
where u.id = ps.admin_id
  and u.role = 'admin'
  and ps.counsellor_name is distinct from nullif(trim(u.display_name), '');

notify pgrst, 'reload schema';
