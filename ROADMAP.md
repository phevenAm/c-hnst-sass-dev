# Clarity — Development Roadmap

Work through phases in order. Each phase should pass `npm run build` + manual test before moving to the next.
Todo IDs in brackets refer to items in the admin_todos table for the test account (smissah94@hotmail.co.uk).

**Legend:** 🐛 Bug · ✨ Feature · 🔒 Security · 🎨 UX/Polish · ⚡ Perf · ✅ Done

---

## PHASE 1 — Critical Security & Auth

### 1.1 Security fixes

- 🔒 `stripe-connect-oauth` edge function has `verify_jwt = false` — change to `true`. The function already validates `profile.role === 'admin'` so flipping JWT back on is safe.
- 🔒 Audit all edge functions for any other misuse of service-role credentials or JWT bypass.
- 🔒 `[TODO: 1de3d06d]` Do not use `verify_jwt = false` on any non-webhook, non-internal function.

### 1.2 Password reset — fully broken end-to-end

- 🐛 `[TODO: e9f769c6, 4f042c0c]` Password reset email sends but clicking the link does NOT take the user to a reset-password UI — they get dropped at the home screen. No `/reset-password` route exists with the Supabase `#access_token` token handler.
- ✨ Add `/reset-password` route that reads `#access_token` from URL hash, shows new-password form, calls `supabase.auth.updateUser({ password })`.
- 🎨 Brand the Supabase password-reset email template in the Supabase dashboard to match Clarity. Point the redirect URL to `APP_URL/reset-password`.
- ✨ Add in-app "Change password" in Settings that calls `supabase.auth.updateUser({ password })` (requires current session — different from reset flow).

### 1.3 Subscription signup — admin_id not assigned

- 🐛 `[TODO: 2ba80556]` Admins who sign up via `/subscribe` → Stripe checkout do not get `admin_id` properly set (or the flow is missing a step that creates their `practice_settings` row / sets them as admin). Trace the full flow: Stripe webhook `checkout.session.completed` (subscription mode) → `practice_settings` insert → user `role='admin'` assignment. Likely the webhook sets `practice_settings` but the auth trigger that creates the `users` row hasn't run yet, or `admin_id` FK on non-admin rows is irrelevant (admins have `admin_id = null`). The actual issue may be that after subscribing, the newly registered user doesn't have `role = 'admin'` in the `users` table.
- 🐛 `[TODO: b1a4fea8]` `/subscribe` page layout is broken — no longer centred. Quick CSS fix.
- Test the full admin registration → subscribe → access `/admin` flow end-to-end.

### 1.4 Stripe payment state not updating

- 🐛 `[TODO: f75e57e4]` Client pays via Stripe checkout → Stripe fires webhook → `sessions.paid` is set to `true` in DB but the UI (both client and admin) still shows unpaid. The `stripe-webhook` function does update `paid = true` and fires `send-payment-notification`. The bug is likely that Redux state is stale after the webhook fires. The session needs to be re-fetched or the payment status needs to be pushed via Supabase realtime subscription.
- Fix: subscribe to `sessions` table changes via Supabase realtime in the relevant Redux slice or component so that when Stripe confirms, the UI updates without a page refresh.

### 1.5 Session double-booking — modal doesn't prevent it

- 🐛 `[TODO: 8f10756a]` Creating a session from the calendar modal (CreateSessionModal) does not check for overlapping sessions. The calendar itself uses drag-drop conflict detection but the modal bypasses it.
- Fix at two levels:
  1. **Frontend**: Before inserting, query sessions where `created_by = admin` and `scheduled_at` overlaps proposed time window. Show inline error if conflict found.
  2. **Backend**: Add a DB-level exclusion constraint or check in a DB function so concurrent requests cannot create overlapping sessions. Use `tsrange` exclusion or a `BEFORE INSERT` trigger.

---

## PHASE 2 — Offline Clients & Shadow Clients

This is the largest area. Offline clients ("stubs") and real clients should share the same UX wherever possible.

### 2.1 Offline client UX parity with real clients

- 🐛 `[TODO: 83ebe124, fac84c8f, a3de3ca6]` Offline clients use a completely separate session management UI (stub detail page / AddStubSessionModal / stub_sessions table) instead of reusing SessionCard and the real sessions table. After invitation and signup, the new real client cannot see their pre-existing sessions.
- **Architecture decision**: The existing merge path (`consume_platform_access_token` imports stub_sessions as real sessions via `imported_from_stub_id`) is the right approach. The problems are:
  1. The merge may not run correctly / at the right time in the auth flow.
  2. Admins managing an offline client before merge use a different UI.
- **Plan**:
  - For the pre-merge admin view: reuse `SessionCard` and existing session management on the stub detail page. Map `stub_sessions` to a shape compatible with `SessionCard` props, or store offline client sessions in the `sessions` table from the start (with `client_id = null`, `imported_from_stub_id = stub.id`). The latter is cleaner.
  - For payment state: add `paid boolean` and `price_pence` to the stub session view/flow so admins can mark sessions paid/unpaid the same way as real clients.
  - Admin should be able to mark sessions as attended/no-show/cancelled/paid/unpaid on the stub detail page using the same controls as the real SessionCard.

### 2.2 Offline clients in dropdowns and calendar

- 🐛 `[TODO: 5b927303]` Offline clients don't show in the client select dropdown on the Schedule/session creation page. Currently, selecting a stub navigates to the stub detail page instead of opening the session creator. This should instead open CreateSessionModal with the stub as the client, creating a session in the `sessions` table with `stub_id` reference (or route as appropriate).
- 🐛 `[TODO: 7262783e]` Calendar drag-and-drop reschedule doesn't work for offline client events. Stub session events render on the calendar but dragging them has no handler. Add the same reschedule confirmation modal flow for stub sessions.
- Offline client name/codename should appear consistently in the calendar, payments table, and all dropdowns.

### 2.3 Shadow client invitation flow — broken end-to-end

- 🐛 `[TODO: d2957ba6]` Invitation email links to `/signup?token=...` which is correct, but the URL is being pointed at admin signup. Verify the `appUrl` used in `invite-stub-client` edge function resolves to the client signup page. The current signup page at `/signup` should work for clients — confirm it doesn't redirect admin-role users somewhere unexpected.
- 🐛 `[TODO: b8fba132]` After the invited stub signs up, they are sent back to `/signup` instead of `/dashboard`. Root cause: after `consume_platform_access_token()` runs and sets `linked_user_id`, the AuthContext navigation logic doesn't detect the new `role = 'client'` correctly and loops. Trace the redirect logic in `AuthContext.tsx` post-signup.
- 🐛 `[TODO: fac84c8f]` Newly created account from stub cannot see their assigned sessions. The `consume_platform_access_token()` RPC should import stub_sessions and set `admin_id` on the new user. Verify this runs correctly and that the client's session query (`sessions WHERE client_id = user.id`) returns the imported rows.
- 🐛 `[TODO: 4e2cf27b]` Signup flow for connected offline clients broken — token may not survive or email matching may be wrong. Check whether the email entered at signup must match the stub's email and enforce the correct behaviour.
- 🐛 `[TODO: a350a3ca]` Admin gets no email/notification when their stub client actually joins. The `notify-admin-stub-joined` edge function exists — verify it is called from `consume_platform_access_token()` or a DB trigger on `client_stubs.linked_user_id` update.

### 2.4 Shadow client codename & merge

- ✨ `[TODO: 8124f803]` Shadow client codename should carry across to the real client record when the stub is merged. The `merge_stub_to_user` RPC should copy `client_stubs.codename` to `users.admin_codename`.
- ✨ `[TODO: 5b927303]` Admin should be able to link/merge a stub with an existing real client from the stub detail page. The "Link to real client" split-button option already exists — ensure the `merge_stub_to_user` RPC preserves sessions, notes, codename, and payments, and that the stub no longer appears as a separate client after merge.

### 2.5 Session management for offline clients

- 🐛 `[TODO: 94929d6b]` Marking a past session as attended doesn't update the status pill in the UI — Redux state isn't being refreshed after the update. Dispatch a re-fetch or update the session in-place in the slice.
- ✨ `[TODO: 57101fb3]` Explicit session cancel option for admins — already exists on real sessions (SessionCard cancel action). Confirm it works correctly for imported stub sessions too.

### 2.6 Manual payment workflow

- ✨ `[TODO: ba1e94b1]` Clients should be able to mark a session as "Paid manually" (cash/bank transfer). Flow:
  1. Client selects "Mark as paid manually" on their session.
  2. Session enters a `payment_pending_manual` state (or a new column).
  3. Admin sees a notification/indicator to verify.
  4. Admin approves or declines.
  5. UI shows Unpaid / Pending Verification / Paid / Declined states clearly.
- Add `manual_payment_status` enum to `sessions` table or reuse `paid` + a new `payment_method` column.

### 2.7 Unpaid session cutoff

- 🐛 `[TODO: c6fa915f]` Auto-cancellation cron ignores the `payment_deadline_hours` setting in `practice_settings`. Migration `20260813000002` claims to fix this — verify it's actually deployed and working. The `auto_cancel_unpaid_sessions()` function should join `practice_settings` per admin to get the correct deadline.
- ✨ `[TODO: d41546eb, 264b4534]` The cutoff feature should be opt-in and OFF by default. Migration `20260813000006` added `auto_cancel_enabled boolean default false`. Verify this is respected. Ensure the Settings UI makes the consequence clear (session will be cancelled, client emailed).
- ✨ `[TODO: 462d37be]` Add a "cancelled due to non-payment" email template. The client should know to contact the therapist if there's a problem.

### 2.8 Client calendar availability

- ✨ `[TODO: 6aa5cfcb]` On the client booking calendar, all time slots should default to unavailable. Only slots that the admin has explicitly marked in `availability_rules` / `availability_overrides` should be selectable. Currently clients may be able to request slots outside admin availability.

---

## PHASE 3 — CSV Imports & Exports

### 3.1 Session CSV import — multiple bugs

- 🐛 `[TODO: 815ab053]` The import parser expects DD/MM/YYYY but the template implies MM/DD/YYYY (or vice versa). Standardise on DD/MM/YYYY (UK-friendly). Update parser, template, instructions, and error messages.
- 🐛 `[TODO: 815ab053]` After import, session count / attendance stats / session history don't update — only the calendar reflects new sessions. Fix state/cache invalidation after import (refetch sessions slice after successful import).
- ✨ The downloadable CSV template should include example rows with multiple sessions per client, column descriptions, and explanation of required vs. optional fields.

### 3.2 Multi-session client import

- ✨ `[TODO: b6ea0fb8, c61252ab]` Bulk import needs a robust pairing design:
  1. First file: clients with unique codes (code, name, codename, notes, profile summary).
  2. Second file: sessions referencing client codes (date, duration, status, amount, notes).
  - OR a single comprehensive file where the client code column groups multiple session rows per client.
- The import should create offline clients (stubs) + their sessions in one transaction.
- Include a "Session Overview" export table (date, session number, attendance/summary) on client PDF export.

### 3.3 PDF export improvements

- ✨ `[TODO: 5f3c9f21, 4718e5b7, 50867768]` Client PDF exports currently contain minimal information. Add:
  - Client summary (name, codename, session count, date range)
  - Session overview table (date, session #, attended/no-show, notes if appropriate)
  - Outcome measure chart where available
  - Attendance stats

---

## PHASE 4 — Emails & Onboarding

### 4.1 Resend production configuration

- 🐛 `[TODO: d21d1d46]` Resend cannot send to arbitrary email addresses until a domain is verified at resend.com/domains. Verify `abidecounselling.uk` (or the Clarity domain), update `RESEND_FROM_EMAIL` secret, test with a non-Outlook address.

### 4.2 Invitation email fixes

- 🐛 `[TODO: d2957ba6]` Invitation email link must point to client signup (`/signup?token=...`), NOT admin signup. Verify `APP_URL` in `invite-stub-client` function.
- ✨ `[TODO: d2957ba6]` Admin should have the option to include the raw token code in the email body so the client can use it if the link breaks. The UI in InviteStubModal should show the token with a "copy" option alongside the "Send email" button.

### 4.3 Session confirmation email controls

- ✨ `[TODO: a1906686]` Session confirmation/reminder emails should NOT fire automatically without admin consent. Add checkboxes to the shared session creation modal:
  - ☐ Send booking confirmation now
  - ☐ Send reminder before session
  - Default should be opt-in, not fire blindly.
- The session creation modal should be a single shared component used from all entry points (scheduler, client page, etc.).

### 4.4 Admin email notifications

- ✨ `[TODO: a97d229c]` For every email sent to a client, the admin should receive a copy or a notification so they know what was sent and when. The `email_logs` table already tracks this — surface it in the admin UI (email history section in client page or dedicated log).

### 4.5 Email customisation UX

- ✨ `[TODO: bddfc844, 15f0c736]` Variable insertion is hard — admins must type `{{variable}}` manually. Add a variable picker UI (click to insert) listing available variables including business information fields.
- ✨ `[TODO: 75336c36]` Allow admins to disable specific automated email types (e.g., turn off booking confirmations, turn off reminders) from Settings.

### 4.6 Signup wizard timing

- 🐛 `[TODO: 708eae20]` The walkthrough wizard appears before the page loads on first signup. Delay rendering until `AuthContext` has resolved `userProfile` and the route component is mounted.

### 4.7 Admin onboarding

- ✨ `[TODO: f8372bc1]` New admin accounts should see a guided onboarding flow. Required setup items: business name, payment configuration, email settings. Non-blocking (can be skipped, visible in Settings).

---

## PHASE 5 — Forms, Client Features & Check-ins

### 5.1 Forms terminology

- ✨ `[TODO: c9fcc511]` Rename "Check-ins" → "Forms" in the UI. Tab structure: Forms / Outcome Measures / Feedback / Onboarding. Keep DB names as-is (questionnaires, etc.).

### 5.2 Form improvements

- ✨ `[TODO: b944dc90]` Add multiple-choice question type (already has `type: 'multiple_choice'` and `options JSONB` in schema — implement the renderer and admin question builder).
- ✨ `[TODO: b4732120]` Add non-recurring form option (one-time assignment rather than repeating).
- ✨ `[TODO: d2e919ee]` Admin view: option to see raw question + answer pairs per submission, not just the aggregated chart.
- ✨ `[TODO: ee833fe3]` Seed CORE-10 and other appropriate standard forms as system defaults for new admin accounts (already triggered by `seed_admin_default_forms` — verify content is complete).
- ✨ Forms should be assignable to offline clients (stub_id on questionnaire_assignments already exists per migration `20260813000000`).

### 5.3 Plotting assignment

- ✨ `[TODO: ec9d1764]` Admin should be able to choose which check-in assignment is plotted on the progress chart per client. The `is_plotted` flag and `set_plotted_assignment()` RPC exist — add UI toggle.

### 5.4 Client features

- ✨ `[TODO: a167d7dd]` Client journalling — allow clients to write private journal entries. Keep separate from therapist notes. Simple table: `journal_entries(id, user_id, content, created_at)` with strict RLS (user sees only own).
- ✨ `[TODO: 81315453]` Crisis contacts — static or configurable list of emergency/support resources on client dashboard. Not a chat feature — informational only.
- ✨ `[TODO: 0f26ec01]` Resource favouriting — clients can heart/unfavourite resources. New `resource_favourites(user_id, resource_id)` table. Filter by favourites in client resources page.

### 5.5 Reports

- ✨ `[TODO: cb47b76c]` Reports page should generate a meaningful client report combining session history, attendance stats, and outcome measures. Admin-facing, not client-visible.

---

## PHASE 6 — UI, UX & Responsive

### 6.1 Scroll disappearing

- 🐛 `[TODO: f3c88d40]` Scroll randomly disappears throughout the app. Likely caused by a modal or overlay setting `overflow: hidden` on `<body>` and not restoring it on unmount, or a CSS conflict in the layout. Audit modal open/close lifecycle and check `overflow` on `html`/`body` in DevTools.

### 6.2 Mobile navigation

- 🐛 `[TODO: 017c15ae]` Sidebar on mobile is missing the Logs section (and potentially child items of other nav items). Audit mobile nav against desktop nav — ensure all items render on small screens.
- 🐛 `[TODO: 7c1e9fed]` Footer causes excessive re-renders. Use React Profiler to identify the cause (likely a context subscription or unstable prop) and wrap with `React.memo` or fix the dependency.

### 6.3 Calendar dark mode & mobile

- 🐛 `[TODO: 7ae42963]` Calendar event/input popup has a light background in dark mode. Find the MUI Popover / react-big-calendar event wrapper and apply the correct theme colour token.
- 🐛 `[TODO: d30346e2]` Session full date is truncated on mobile in the client page session list. Fix responsive truncation — use shorter date format on small screens or allow wrapping.

### 6.4 Touchscreen calendar DnD

- 🐛 `[TODO: 7e73ad3a, 9a7e8ea7]` Calendar drag-and-drop doesn't work on touch screens. react-big-calendar with `react-dnd` uses HTML5 drag events which don't fire on touch. Add `react-dnd-touch-backend` or `react-dnd-multi-backend` with pointer-event support.

### 6.5 Error & not-found pages

- ✨ `[TODO: 4bec0e91]` Create a proper 404 / unknown route page. Create a general error boundary page with "Something went wrong — please try again or report the issue" messaging and a link to the feedback widget.

### 6.6 Settings & visual hierarchy

- 🎨 `[TODO: 75ac4fe5, 2710fa9f]` Settings page visual hierarchy needs work — currently flat and hard to scan. Ensure heading levels are semantic and visually distinct. The collapsible chevron cards that were added are a good pattern — audit remaining flat sections.
- 🎨 `[TODO: c948fc4b]` "Configure client" modal shouldn't include "Export PDF" — that action belongs on the client's own page.
- 🎨 `[TODO: c948fc4b]` Delete buttons across the app are too visually prominent. Use a neutral/destructive colour pattern that confirms intent without dominating the layout.

### 6.7 Sign-in page

- 🎨 `[TODO: 01e1438b]` Sign-in form is too tall for mobile viewport, causing overflow. Cap the form height and allow internal scroll, or reduce vertical padding.

### 6.8 Todo list UX

- ✨ `[TODO: 9abdaba2]` Allow sorting todos by priority.
- ✨ `[TODO: 0d367a69]` Allow bulk-deleting completed todos via checkbox selection.
- 🐛 `[TODO: 5772217a]` Todo date input field "leaks" — investigate whether the date picker doesn't close correctly or leaves an overlay.
- 🎨 `[TODO: cd023206]` Todo FAB button is oversized on mobile. Reduce size and border-radius.

### 6.9 Loading states

- 🎨 `[TODO: 8c1c00e0]` Use a consistent loading indicator across the app. Either "Loading…" text, the Clarity logo, or a minimal spinner. Remove inconsistent per-component loaders in favour of one pattern.

### 6.10 Reload button

- ✨ `[TODO: 22c2d953]` Add a reload/force-refresh button in the top bar for admin and client (especially useful as a PWA). On mobile, this replaces the browser reload gesture that is often hidden.

### 6.11 Settings photo update

- 🐛 `[TODO: 6f227cdc]` Profile photo upload in Settings is broken. Trace the upload → Supabase Storage → avatar_url update flow. The `delete-user-avatar` edge function and avatar storage bucket exist — check the upload path.

### 6.12 Image compression

- 🐛 `[TODO: ef827447]` The image compression edge function does nothing useful. Either fix it to actually resize/compress images before storing (using a Deno image library like `imagescript`), or accept that Supabase Storage transformations handle this and remove the non-functional code.

### 6.13 Notification badges & sidebar

- 🎨 `[TODO: bed56de8]` Add notification badges to sidebar nav items (e.g., unread notifications, pending reschedule requests). Sidebar dropdowns for grouped nav items on mobile.

---

## PHASE 7 — Architecture, Performance & Quality

### 7.1 Code splitting

- ⚡ `[TODO: c5aa4475]` App is getting slow. Add route-level lazy loading (`React.lazy` + `Suspense`) for all page components. Audit bundle size with `npx vite-bundle-visualizer`. Priority targets: admin pages, calendar, PDF export.

### 7.2 Shared components audit

- ⚡ `[TODO: dcdce17c]` Session creation modal should be a single shared component used from every entry point (scheduler, client page, stub detail page). Remove parallel implementations.
- ⚡ Audit duplicated loading states, error states, and split-button patterns — extract to shared components.

### 7.3 Activity logging

- 🐛 `[TODO: dc9ffd57]` Activity log doesn't track many actions. Audit what is logged and add logging for: session create/cancel/reschedule, client create/delete/link, payment record, form assignment, note create/edit.

### 7.4 Storybook

- ✨ `[TODO: 54d06491]` Add Storybook for key shared components (SessionCard, SortableTable, SplitButton, StubRow, etc.). Host on portfolio or Chromatic.

### 7.5 SortableTable column configuration

- ✨ `[TODO: dcdce17c]` SortableTable should accept a columns config prop so consumers can show/hide columns without forking the component. Currently column layout is hard-coded per usage.

### 7.6 PWA force update

- ✨ `[TODO: 37d83ccd]` Reintroduce a force-update / reload button visible only in the mobile/PWA view (hide on desktop). PWA service workers can cache stale builds.

### 7.7 Versioning

- ✨ `[TODO: 5a7b869f]` Investigate automatic version bumping per PR (e.g., via `semantic-release` or a simple `package.json` version commit hook). The `system_config` table can store the deployed version for display in the UI.

### 7.8 verify_jwt audit

- 🔒 Audit all edge functions that have `verify_jwt = false` and are not: (a) Stripe webhooks, (b) internal-only trigger functions using the `x-internal-secret` header, or (c) public unauthenticated endpoints (unsubscribe). Fix any that shouldn't be open.

### 7.9 Supervision calendar

- 🐛 `[TODO: 3a45855e]` Supervision page form is poor and doesn't pull from the calendar. Fix: admin_private_events with `is_supervision = true` should be visible on the supervision page. The CPD log and supervision should be separate concerns.
- ✨ `[TODO: 5fe6b725]` Separate the supervision log from the CPD log UI.

---

## PHASE 8 — Branding, Product & Business

### 8.1 Rebrand to Clarity

- ✨ `[TODO: 1d69c6eb, dcac2ebe]` Change app name to "Clarity" everywhere:
  - `_shared/email.ts` app name string
  - Supabase auth email templates
  - `public/manifest.json` app name
  - `index.html` title
  - Any remaining "Abide", "WithMe", or "Sessionly" references

### 8.2 White-label feature flag

- ✨ `[TODO: 033dbd41]` Create a build-time or runtime config that allows the app name, logo, and accent colour to be overridden for a white-label deployment (e.g., Rosie's "withMe"). Store in `system_config` or an env var. Do not scatter `APP_NAME` references — use a single config object.

### 8.3 CPD table

- ✨ `[TODO: f8145cbb]` Review CPD table headings against the schema columns that now exist (`session_number`, `contract_code`, `mode`, `venue`, `issues_raised`, `supervisor_name`). Render these in the CPD table UI.

### 8.4 DNS

- ✨ `[TODO: ea4e1d40]` Move DNS management for `abidecounselling.uk` to `app.netlify.com/teams/smissah/dns/abidecounselling.uk`.

### 8.5 Competitor research (non-coding)

- Research: Compare Sessionly (sessionly.uk/pricing) and Bloom feature sets. Identify 2-3 genuinely useful features worth adding. Do not copy wholesale.
- Research: Assess school counsellors as a secondary audience and what product changes it would require.

---

## QA TODO ITEMS — Status Tracking

Items from the test account (smissah94@hotmail.co.uk) admin_todos table.
Update todo text to `[fixed] -- Original title` in the DB after each fix is verified.

| Todo ID | Text | Phase | Status |
|---------|------|-------|--------|
| e9f769c6 | Password reset email doesn't reset password | 1.2 | Fixed 2026-08-17 |
| 4f042c0c | reset password email not branded & link broken | 1.2 | Partial — redirectTo fixed; Supabase email template branding still TODO |
| 2ba80556 | registering account via sub doesn't give admin_id | 1.3 | Fixed 2026-08-17 (upsert) |
| b1a4fea8 | /subscribe page not centred anymore | 1.3 | Fixed 2026-08-17 |
| 8f10756a | CREATING SESSION FROM MODAL STILL ALLOWS DOUBLE BOOKING | 1.5 | Fixed 2026-08-17 (DB trigger) |
| 1de3d06d | dont use verify_jwt = false | 1.1 | Fixed 2026-08-17 |
| f75e57e4 | client pays with Stripe but UI still shows unpaid | 1.4 | Fixed 2026-08-17 (realtime) |
| 94929d6b | Marking session as attended doesn't change the pill for PAST sessions | 2.5 | Open |
| d2957ba6 | stub invite takes you to admin signup; token lost | 4.2 | Open |
| b8fba132 | after inviting shadow client, they get sent back to signup | 2.3 | Open |
| 83ebe124 | offline client not assigned to admin; no pre-existing sessions | 2.1/2.3 | Open |
| a350a3ca | admin gets no email when shadow client joins | 2.3 | Open |
| fac84c8f | newly created account from offline can't see assigned sessions | 2.3 | Open |
| f75e57e4 | offline client UX same as online (paid, attended, etc.) | 2.1 | Open |
| c6fa915f | auto-cancellation should use Unpaid session cutoff setting | 2.7 | Fixed 2026-08-17 (migration 20260817000001) |
| d41546eb | allow therapist to configure session cutoff | 2.7 | Fixed 2026-08-17 (auto_cancel_enabled respected) |
| 017c15ae | Sidebar menu missing Logs on mobile | 6.2 | Open |
| 7e73ad3a | drag and drop doesn't work on touchscreens | 6.4 | Open |
| 1f7662d0 | offline client notes not encrypted; other PII not encrypted | Phase 1/2 | Open |
| 7262783e | Calendar drag and drop for offline clients not working | 2.2 | Open |
| 5b927303 | offline clients not in schedule dropdown | 2.2 | Open |
| 28986dbf | hiding codenames doesn't update names in UI | Future | Open |
| 7c1e9fed | footer excessive rerenders | 6.2 | Open |
| f3c88d40 | scroll randomly disappears | 6.1 | Open |
| 7ae42963 | calendar input light background in dark mode | 6.3 | Open |
| 708eae20 | wizard shows before page loads on first signup | 4.6 | Open |
| 815ab053 | session CSV import wrong date format; stats don't update | 3.1 | Open |
| 4f042c0c | reset password email not branded | 1.2 | Open |
| 6f227cdc | settings photo update broken | 6.11 | Open |
| 4bec0e91 | need 404 / error page | 6.5 | Open |
| 01e1438b | sign-in page too tall for viewport | 6.7 | Open |
| d30346e2 | session date can't be seen on mobile on client page | 6.3 | Open |
| 9abdaba2 | allow sorting todos by priority | 6.8 | Open |
| 0d367a69 | bulk delete completed todos | 6.8 | Open |
| 5772217a | todo date input field leaks | 6.8 | Open |
| dc9ffd57 | activity log doesn't track much | 7.3 | Fixed 2026-08-17 (DB triggers on 9 tables, migration 20260817000002) |
| 3a45855e | supervision calendar form broken | 7.9 | Open |
| ef827447 | image compression edge function does nothing | 6.12 | Open |
| c5aa4475 | app getting slow; consider code splitting | 7.1 | Open |
| 1d69c6eb | change app name to Clarity | 8.1 | Fixed 2026-08-17 (index.html, manifest, Footer, email templates) |
| 22c2d953 | add reload button in top bar | 6.10 | Open |
| 8c1c00e0 | use different/consistent loading spinner | 6.9 | Open |
| ba1e94b1 | manual payment: client marks paid, admin verifies | 2.6 | Open |
| b6ea0fb8 | CSV import: multiple sessions per client with pairing | 3.2 | Open |
| 4e2cf27b | signup flow for connected offline clients broken | 2.3 | Open |
| cd023206 | todo button oversized on mobile | 6.8 | Open |
| 5a7b869f | version numbers should update per PR | 7.7 | Open |
| 8124f803 | shadow client codename should pass to real client | 2.4 | Fixed 2026-08-17 (consume_platform_access_token + merge_stub_to_user, migration 20260817000001) |
| 264b4534 | cutoff cancellation should be optional / opt-in | 2.7 | Fixed 2026-08-17 (auto_cancel_enabled respected, migration 20260817000001) |
| a1906686 | email confirmations should not be automatic | 4.3 | Open |
| ea4e1d40 | move DNS to correct Netlify location | 8.4 | Open |
| 5f3c9f21 | PDF export lacks useful info | 3.3 | Open |
| c9fcc511 | rename check-ins to forms | 5.1 | Open |
| b944dc90 | multiple choice questions for check-ins | 5.2 | Open |
| ec9d1764 | no way to mark which check-in to plot per client | 5.3 | Open |
| 54d06491 | add Storybook | 7.4 | Open |
| dcdce17c | SortableTable column configuration | 7.5 | Open |
| bed56de8 | sidebar notification badges | 6.13 | Open |
| a167d7dd | client journalling | 5.4 | DB done 2026-08-17 (journal_entries table, migration 20260817000003) — UI still needed |
| 81315453 | crisis contacts for clients | 5.4 | Open — static display, no DB needed |
| 0f26ec01 | client resource favouriting | 5.4 | DB done 2026-08-17 (resource_favourites table, migration 20260817000003) — UI still needed |

---

## PREVIOUSLY COMPLETED ✅

| Item | Notes |
|------|-------|
| Email infrastructure (Resend + edge functions) | Done |
| Check-ins rework (tag-based chart) | Done |
| Scheduler (sessions, reminders) | Done |
| Shadow clients v2 (stubs, stub_sessions) | Done |
| Session cancel/restore | Done |
| Session payment pills | Done |
| Note encryption (AES-256-GCM 2-layer) | Done |
| SortableTable component | Done |
| Settings collapsible cards | Done |
| Sidebar mobile auto-close | Done |
| Walkthrough wizard (basic) | Done |
| Client consent gate | Done |
| Form results feature | Done |
| CPD log | Done |
| Superadmin + multi-plan | Migrations written; Stephen to run |
| Payments page (SortableTable) | Migration 20260810000002 to apply |
| Reschedule requests prominent | Done |
| Drag confirmation modal | Done |
| Calendar double-booking (drag) | Done |
| Session creation from scheduler | Done |
| Shadow client payments showing | Done |
| Cancelled session calendar readability | Done |
| iCal/.ics export | Done |
| Email for check-in wrong URL | Fixed 2026-08-16 |
| Phase 1 — security, password reset, subscription, payment realtime, double-booking | Fixed 2026-08-17 |
| Phase 2 (DB) — codename carry-across, auto-cancel opt-in, merge_stub_to_user completeness | Fixed 2026-08-17 |
| Phase 7.3 — audit logging triggers on 9 tables | Fixed 2026-08-17 |
| Phase 5.4 DB — journal_entries + resource_favourites tables | Fixed 2026-08-17 |
| Phase 8.1 — Rebrand to Clarity (HTML, manifest, Footer, all email templates) | Fixed 2026-08-17 |
