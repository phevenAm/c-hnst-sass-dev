# Local Supabase testing

The `staging` branch uses the local Supabase stack for destructive end-to-end
testing. The migration files in `supabase/migrations/` are the shared source of
truth for both the hosted database and the local database.

## Prerequisites

- Docker Desktop must be installed and running.
- The Supabase CLI is available through `npx supabase`.

## First-time setup

```bash
npm run db:local:start
npm run db:local:reset
```

`db:local:reset` recreates the local database from every migration. It is safe
for test data and intentionally destructive.

The local Supabase URL and anon key are printed by `supabase start`. Use those
values in the local frontend environment, not the production values:

```text
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<local-anon-key>
```

## Stripe test secrets

Keep Stripe test credentials in a local, ignored env file. Do not copy live
credentials into this file and do not commit it:

```text
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_CONNECT_WEBHOOK_SECRET=whsec_...
STRIPE_CONNECT_CLIENT_ID=ca_...
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_STARTER_ANNUAL=price_...
STRIPE_PRICE_GROWTH=price_...
STRIPE_PRICE_GROWTH_ANNUAL=price_...
STRIPE_PRICE_UNLIMITED=price_...
STRIPE_PRICE_UNLIMITED_ANNUAL=price_...
```

Serve functions with that file when running billing tests:

```bash
npx supabase functions serve --env-file supabase/.env.local
```

Use the Stripe CLI in test mode to forward webhook events to the local
function:

```bash
stripe listen --forward-to http://127.0.0.1:54321/functions/v1/stripe-webhook
```

Use the webhook signing secret printed by Stripe CLI as the local
`STRIPE_WEBHOOK_SECRET`.

## Migration rule

When changing the database, add a new migration file and commit it to the
branch. Apply the same migration history to local and hosted environments with:

```bash
npm run db:local:reset
npm run db:remote:push
```

Never edit the hosted database manually and then try to reproduce the change
locally. The migration file must come first. `db:remote:push` should only be
run with the intended hosted project linked.

Stop the local stack when finished:

```bash
npm run db:local:stop
```