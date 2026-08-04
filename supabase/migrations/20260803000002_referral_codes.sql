alter table public.practice_settings
  add column if not exists referral_code text unique,
  add column if not exists referred_by_code text;

create or replace function public.generate_referral_code()
returns trigger
language plpgsql
as $func$
begin
  new.referral_code := upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  return new;
end;
$func$;

create trigger set_referral_code
  before insert on public.practice_settings
  for each row
  when (new.referral_code is null)
  execute function public.generate_referral_code();

-- Backfill existing rows
update public.practice_settings
set referral_code = upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8))
where referral_code is null;
