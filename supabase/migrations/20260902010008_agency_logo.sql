-- Agency co-branding: an optional logo shown next to the Clarity mark in
-- manage mode (and, later, on member-facing surfaces).
alter table public.agencies
  add column if not exists logo_url text;
