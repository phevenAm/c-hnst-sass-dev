# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run start        # dev server (Vite)
npm run build        # production build → dist/
npm run test         # run Vitest in watch mode
```

Run a single test file:
```bash
npx vitest src/Helpers/Helpers.test.ts
```

## Architecture

**Stack:** React 19 + TypeScript, Vite, Redux Toolkit, Supabase (auth + database), MUI v9, SCSS modules, Recharts. Deployed on Vercel (this doc previously said Netlify — stale; `vercel.json` + the Supabase Auth redirect allowlist in `supabase/config.toml` are the source of truth).

### Auth — dual-layer pattern

There are two auth mechanisms that co-exist:

1. **`AuthContext`** (`src/context/AuthContext.tsx`) — the live source of truth for the UI. Holds `authUser` (Supabase auth object), `userProfile` (row from the `users` table), `isAdmin`, and session methods (`signIn`, `signUp`, `signOut`). Components should consume this via `useAuth()`.

2. **`authSlice`** (`src/store/slices/authSlice.tsx`) — a Redux slice with its own thunks. Appears to be a legacy or parallel implementation. The main routing and `ProtectedRoute` rely on `AuthContext`, not this slice. <-- this has been deleted now>

`ProtectedRoute` (`src/components/shared/ProtectedRoute/ProtectedRoute.tsx`) accepts `requiredRole: "admin" | "client"` and redirects accordingly. Admins are always redirected away from client routes and vice versa.

**Sign-up requires an access token.** The flow validates against the `platform_access_token` Supabase table and calls the `consume_platform_access_token` RPC to mark tokens as used.

### Redux store

Slices: `userDirectory`, `questionnaires`, `assignments`, `responses`, `resources`, `theme`.

The `inspirationalQuotesApi` uses RTK Query (hitting `https://api.quotable.io`). Its reducer and middleware are registered in the store.

Use typed hooks from `src/store/hooks.ts`:
- `useAppDispatch()` instead of `useDispatch`
- `useAppSelector()` instead of `useSelector`

### Routing

Two role-based route trees under `App.tsx`:
- **Client routes:** `/dashboard`, `/check-in`, `/resources`
- **Admin routes:** `/admin`, `/admin/clients`, `/admin/questionnaires`, `/admin/resources`

`/` redirects based on auth state. The `AppLayout` wrapper adds the shared `Navbar`.

### Styling system

SCSS design tokens live in `src/styles/`: `_colors.scss`, `_spacing.scss`, `_typography.scss`, `_mixins.scss`.

Tokens are exposed as CSS custom properties (`--accent`, `--text-primary`, etc.) in `src/index.scss`. Dark mode is toggled by adding the `.dark` class to `<html>` — managed by `themeSlice` + `ThemeWrapper` in `App.tsx`.

**`sync-tokens.js`** reads leaf `$variable` values from the SCSS files and writes them into the `:root` and `.dark` blocks of `index.scss`. Run after editing token files.

Components use SCSS modules (e.g. `Card.module.scss`) and reference CSS custom properties rather than SCSS variables at the component level.

### Supabase

Client singleton at `src/lib/supabase.js`. Requires `.env` with:
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

`src/lib/appUrl.ts` exports `APP_URL`, sourced from `VITE_APP_URL` (falls back to `window.location.origin` when unset, i.e. local dev). Use it — not `window.location.origin` — for anything that leaves the browser: referral links, password-reset/signup `redirectTo`, OAuth `redirect_uri`. Raw `window.location.origin` in one of those picks up whatever domain the tab happens to be on (a stray Vercel preview URL, the legacy `honest-portal.vercel.app`) and either sends a broken link or gets rejected by Supabase Auth's redirect allowlist — this is what was silently breaking password reset before 2026-09-14. Set `VITE_APP_URL` per environment (prod → `https://withclarity.uk`, staging → the staging Vercel URL once it exists); mirrors the backend's `APP_URL` edge secret, which must match.

Key tables mirrored in `src/models/globalTypes.tsx`: `users`, `questionnaires`, `questions`, `questionnaire_assignments`, `responses`, `resources`, `platform_access_token`.

`UserRole` enum uses `"admin"` / `"client"` — note `globalTypes.tsx` defines both a string union `Role` (`"admin" | "user"`) and an enum `UserRole` (`"admin" | "client"`). The live codebase uses `"client"` (not `"user"`) for the client role.

### Database migrations — deploy discipline

**As of 2026-09-14 there are two Supabase projects** (there was only one before this — older notes below that say "one Supabase project" predate the split):
- `clarity-LIVE` (ref `mxyfdvfbdrusbjiozuzx`) — production, live users. This is what's linked locally (`supabase link` / `.temp/project-ref`) by default.
- `clarity-STAGING` (ref `epxozsqdxqicjpbxtjez`) — staging, brought to full schema/edge-function parity with prod on 2026-09-14 (`supabase db push --project-ref epxozsqdxqicjpbxtjez`, all 259 migrations applied, all edge functions deployed). No test secrets configured yet — `STRIPE_*`, `RESEND_*`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `MICROSOFT_CALENDAR_CLIENT_SECRET` are unset there on purpose (Stephen wants test-mode credentials, not prod's live ones, copied in — his call which values). The `INTERNAL_*` cron-auth secrets were freshly generated for staging, not copied from prod.
- Workflow going forward: work in `dev` → push migrations/functions to `clarity-STAGING` and run e2e there a second time → once verified, push the same migrations to `clarity-LIVE` and merge `dev` → `main`. Staging should track ahead of `main`, never behind.
- The Vercel side of staging (a `staging` branch/environment pointing `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`/`VITE_APP_URL` at `clarity-STAGING`) is **not set up yet** — Vercel CLI wasn't authenticated in the agent environment that did the Supabase half, so this still needs doing (either from an authenticated session or by Stephen directly).
- Pushing new migrations to staging first is now the safe way to test a risky batch before it ever touches prod — use it instead of relying on the timing/traffic mitigations below when a migration is genuinely uncertain.

There is `supabase db push`, which applies straight to whichever project you target (pass `--project-ref` explicitly, or rely on the local link for prod). Migrations run fine against a live DB **except** when a batch is large or stacked. On 2026-09-08 nine migrations pushed within ~5 minutes wedged PostgREST for ~1 hour (each `notify pgrst, 'reload schema'` forces a full schema-cache rebuild; `ALTER TABLE … ENABLE RLS` / `ADD CONSTRAINT` take brief exclusive locks — stack them under traffic and API requests time out). Nothing was lost, but the API was down/degraded. This risk is specific to **prod** (`clarity-LIVE`) under real traffic — staging has none, so batch size there isn't a concern.

Rules (for `clarity-LIVE`):
- **One migration workstream at a time.** Never run two agent sessions both doing `db push` to this project — 2026-09-08 was two sessions' batches compounding.
- **Keep batches small.** A few migrations per push, not ten. Squash related changes into one file where practical, with a single `notify pgrst, 'reload schema'` at the end.
- **Schedule the heavy stuff.** Mass `ENABLE ROW LEVEL SECURITY`, `ADD CONSTRAINT`, column-type changes, data backfills → run in the users' quiet hours (late evening / early morning UK), and one at a time. Prefer `CREATE INDEX CONCURRENTLY`.
- Add column / function / grant / RLS policy / trigger, and single small migrations — fine to push any time.
- No formal "maintenance mode" needed for normal migrations; the above spacing is the mitigation.
- If PostgREST wedges again (repeated `Thread killed by timeout manager`, slow schema-cache queries): Supabase dashboard → Fast Database Reboot, and pause further pushes until traffic is low.
