-- Email send audit log
create table public.email_logs (
  id              uuid        primary key default gen_random_uuid(),
  admin_id        uuid        references public.users(id) on delete set null,
  client_id       uuid        references public.users(id) on delete set null,
  session_id      uuid        references public.sessions(id) on delete set null,
  email_type      text        not null,
  recipient_email text        not null,
  subject         text        not null,
  resend_email_id text,
  status          text        not null default 'sent'
                              check (status in ('sent', 'failed', 'skipped')),
  error_message   text,
  sent_at         timestamptz not null default now(),
  created_at      timestamptz not null default now(),

  constraint email_logs_email_type_check check (
    email_type in (
      'session_reminder',
      'session_booked',
      'session_cancelled',
      'session_rescheduled',
      'payment_reminder',
      'payment_confirmed',
      'questionnaire_assigned',
      'stub_invite',
      'feedback',
      'reschedule_request'
    )
  )
);

alter table public.email_logs enable row level security;

-- Admins read their own logs; superadmins read all
create policy "Admins read own email logs"
  on public.email_logs for select
  using (
    auth.uid() = admin_id
    or exists (
      select 1 from public.users
      where id = auth.uid() and is_superadmin = true
    )
  );

create index email_logs_admin_id_idx      on public.email_logs (admin_id);
create index email_logs_client_id_idx     on public.email_logs (client_id);
create index email_logs_email_type_idx    on public.email_logs (email_type);
create index email_logs_sent_at_idx       on public.email_logs (sent_at desc);

comment on table public.email_logs is
  'Audit log of all outgoing emails. Inserted by edge functions using the service role key.';
