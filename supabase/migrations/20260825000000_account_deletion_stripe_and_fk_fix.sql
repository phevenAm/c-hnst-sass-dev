-- Account deletion currently never touches Stripe at all: delete_own_account()
-- deletes practice_settings (which holds billing_customer_id/
-- stripe_subscription_id) via cascade with no cancellation call, so Stripe
-- keeps billing a deleted account indefinitely with no record left in
-- Clarity to trace it back to. Fixing the actual cancellation is an edge
-- function (needs the Stripe SDK) — this migration only fixes a DB-level
-- bug that would otherwise make deletion fail outright for any admin who
-- has ever created a real (non-stub) client session: sessions.created_by
-- references auth.users with no ON DELETE behavior (defaults to RESTRICT),
-- so deleting the admin's auth.users row would raise a foreign key
-- violation. Matches the pattern already used elsewhere (client_id on the
-- same table SETs NULL) — the client keeps their session history even
-- after their admin's account is gone.
alter table public.sessions
  drop constraint sessions_created_by_fkey,
  add constraint sessions_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null;
