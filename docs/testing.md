# Testing

Two suites: **unit** (Vitest, fast, no network) and **e2e** (Playwright, slow,
runs against the real linked Supabase project). Plus lint/format via Biome.

---

## Unit tests — Vitest

```bash
npm run test        # watch mode  (first pass = whole suite, then only reruns changed files)
npm run test:run    # one-shot    — the whole suite once, no watch. Use this for "did I break anything".
npx vitest run src/Helpers/Helpers.test.ts      # one file, once
npx vitest src/Helpers/Helpers.test.ts          # one file, watch
```

> `npm run test` is a **watcher**. Its first run executes everything (~3 min),
> then it sits waiting for changes and only re-runs the files a change touches —
> which is why it can look like "only a few ran". For the full suite in one go,
> use `npm run test:run`.

- Config lives in the `test` block of `vite.config.js`.
- Picks up `src/**/*.{test,spec}.{ts,tsx,js}` and
  `supabase/functions/**/*.{test,spec}.ts` (pure, Deno-free edge-function logic).
- Environment is `jsdom`; global setup is `src/test/setupTests.js`.
- **Scope:** component rendering + pure logic. Supabase is mocked — these tests
  do **not** exercise RLS, grants, column wiring, edge functions, or webhooks.
  For that, use the e2e suite.
- Coverage: `npx vitest run --coverage` (istanbul). There's also a
  hand-maintained coverage catalogue on the `/dev` route (superadmin only).

---

## End-to-end tests — Playwright

The specs under `e2e/` drive the **deployed edge functions and the real linked
Supabase project** (not a local DB). They use dedicated fixture accounts
(`smissah321+e2e-…@gmail.com`) and clean up after themselves.

### Prerequisites

1. **Dev server running** on `http://localhost:5174` — browser-driving specs
   navigate there:
   ```bash
   npm start
   ```
2. **Fixtures seeded** (once; idempotent — re-run any time to reset fixture state):
   ```bash
   npm run test:e2e:seed        # = node e2e/settings/seed-fixtures.mjs
   ```
   This creates/normalises the shared e2e admin + client and a known
   `practice_settings` baseline on the linked project.
3. **Supabase CLI logged in** — specs that need privileged DB access shell out to
   `supabase db query --linked`. If you see
   `password authentication failed for user "cli_login_postgres"`, the CLI's
   OAuth DB role is flaking: retry, or put `SUPABASE_DB_PASSWORD=…` in `.env`
   for a stable connection.

### Running

```bash
npm run test:e2e                                   # every spec under e2e/  (~30+ min)
npx playwright test e2e/auth-redirects             # one folder
npx playwright test e2e/settings/settings-behavior.spec.ts   # one file
npx playwright test -g "reschedule"                # by title
npm run axe                                        # Playwright UI (pick & watch specs)
npx playwright show-report                         # open the last HTML report
```

- `playwright.config.ts`: `testDir: "e2e"`, `baseURL` is `:5174`, `video: "on"`.
  Only specs that actually open a page record video (into `test-results/` and
  `playwright-report/`, both git-ignored); API-only specs record nothing.
- Many specs are **serial within a file** (`test.describe.configure({ mode: "serial" })`)
  because they share one fixture practice.
- Every spec cleans up its own rows on exit; a killed run can leave residue —
  re-running `npm run test:e2e:seed` resets the shared fixture, and most specs
  also sweep their namespace in `afterAll`.

### Stripe e2e — separate

Stripe checkout needs a real redirect target, so those specs run against the
**deployed** app and have their own fixtures:

```bash
npm run test:e2e:stripe:seed     # = node e2e/stripe/seed-fixtures.mjs
npm run test:e2e:stripe          # = playwright test e2e/stripe/stripe.spec.ts
```

---

## Accessibility

```bash
npm run a11y        # node axe-scan.mjs  — headless axe pass over key routes
npm run axe:run     # playwright test    — includes e2e/axe-scan.spec.ts
```

---

## Lint & format

```bash
npm run lint        # biome lint .
npm run lint:fix    # biome check --write .   (lint + format + safe fixes)
npm run ci:check    # biome check .           (what CI runs — no writes)
```

---

## Before opening a PR

```bash
npm run test:run && npm run build && npm run ci:check
```

e2e is not part of that gate (too slow / needs the live project); run the
relevant `e2e/` folder by hand when a change touches RLS, an edge function, a
webhook, or a multi-step flow.
