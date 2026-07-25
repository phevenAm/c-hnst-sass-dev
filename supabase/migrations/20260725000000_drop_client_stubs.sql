-- Remove the client_stubs system entirely.
-- session_notes.user_id already uses ON DELETE SET NULL, so notes survive
-- client account deletion — they just lose the name link, which is acceptable.

drop trigger if exists on_user_delete_preserve_notes on public.users;
drop function if exists public.preserve_notes_on_user_delete();

alter table public.session_notes
  drop column if exists stub_id;

drop table if exists public.client_stubs cascade;
