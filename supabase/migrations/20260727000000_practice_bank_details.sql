alter table public.practice_settings
  add column if not exists bank_name            text,
  add column if not exists bank_account_name    text,
  add column if not exists bank_sort_code       text,
  add column if not exists bank_account_number  text,
  add column if not exists bank_payment_reference text;
