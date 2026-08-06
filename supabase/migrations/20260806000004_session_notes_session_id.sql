-- Link session_notes to a specific session (optional — null = account-level note).
alter table public.session_notes
  add column if not exists session_id uuid references public.sessions(id) on delete cascade;

create index if not exists session_notes_session_id_idx on public.session_notes(session_id);
