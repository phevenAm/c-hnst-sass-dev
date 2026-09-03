# Overnight triage — `smissah94@hotmail.co.uk` High (P1) todos

Session of 2026-09-03. You said "triage-first": verify each P1 against the live DB +
current code, fix only what's clearly in the Supabase/edge lane and low-risk, write
the rest up. 33 open P1 items. Nothing was pushed or deployed — see "Blocked" below.

**Blocked from shipping tonight:**
- `supabase db push` is **not clean**: remote has migration `20260902010009`, local has an
  uncommitted `20260902010010_agency_teams_channel.sql` (renamed to dodge a collision).
  There are also uncommitted edits to `stripe-webhook`, `notify-session-booked/cancelled`,
  `_shared/agencyTeams.ts` — someone's mid-flight on agency Teams. I didn't touch any of that.
- So the migration + edge-fn fix below are **staged as local files only**. Resolve the
  `010009/010010` drift, then `supabase db push` and `supabase functions deploy send-session-reminders`.

---

## A. Actioned this session

### A1 — Double-booking guard keyed on the wrong person  ✅ fix written + verified
Todos: **`8f10756a`** ("CREATING SESSION FROM MODAL STILL ALLOWS DOUBLE BOOKING"), and the
P2 dup `aa1d8244` ("still possible to double book… bug around offline clients").

**Root cause.** `practice_slot_has_conflict()` (migration `20260830000000`) filters real
sessions by `s.created_by = p_admin_id`, and `check_session_overlap()` bails out entirely
when `new.created_by IS NULL`. `created_by` is just whoever clicked "create". So the guard
is skipped or mis-scoped when:
- the client books/reschedules their own session (`created_by` = client uid),
- the row has `created_by IS NULL` — **confirmed on prod**: 4 such sessions (client `11bb4dd1`, "Doggy bag"),
- an agency sub-admin books for a manager's client.

Verified on the live DB (read-only): for a real session, `practice_slot_has_conflict(client_id, …)`
returns **false** where `practice_slot_has_conflict(practice_admin, …)` returns **true** — i.e.
a client booking over an existing session isn't detected.

**Fix.** `supabase/migrations/20260903000000_double_booking_practice_key.sql` (new, **not pushed**):
- new internal `_practice_slot_has_conflict_all()` — `SECURITY DEFINER`, not granted to anyone,
  resolves the practice from `client_id → users.admin_id` (falls back to `created_by`), compares
  against every live booking for that practice.
- `check_session_overlap()` / `check_stub_session_overlap()` → `SECURITY DEFINER`, use the new
  predicate. Real-session trigger now resolves the practice instead of bailing on null `created_by`.
- `get_practice_busy_slots()` (client reschedule picker) → same practice-key correction so the
  "busy" list matches what the trigger enforces.
- The public granted `practice_slot_has_conflict()` RPC is **left as-is** on purpose — making it
  `SECURITY DEFINER` would turn it into a cross-practice free/busy oracle for any authed user.

**Tests.** `supabase/tests/double_booking_practice_key.test.sql` (new) — runs the migration and 6
insert attempts in a rolled-back txn. Ran green against **prod** data tonight:
`PASS A` client-booked overlap blocked · `PASS B` null-`created_by` overlap blocked ·
`PASS C` non-overlapping allowed · `PASS D` back-to-back allowed · `PASS E` cancelled row not guarded ·
`PASS F` stub-vs-real overlap blocked.
Run it yourself: `psql "$DATABASE_URL" -f supabase/tests/double_booking_practice_key.test.sql`.

Not touched: the FE mirror `src/Helpers/sessionOverlap.ts` and the `.rpc("practice_slot_has_conflict")`
pre-check in `CreateSessionModal.tsx` — both still fine for the admin-create path; the trigger is
the real guarantee. Your call whether to also widen the FE pre-check.

### A2 — "Auto-cancel unpaid sessions" toggle does nothing on the daily run  ✅ fix written + unit-tested
Todos: **`548a6fbc`** ("Setting didn't work"), **`c6fa915f`** ("auto cancellation should be
controlled by 'Unpaid session cutoff' in settings"); related P2 `264b4534`.

**Root cause.** There are two auto-cancel paths:
- DB `auto_cancel_unpaid_sessions()` (cron job 1, hourly) — **correctly** gates on
  `practice_settings.auto_cancel_enabled`.
- `send-session-reminders` edge function (cron job 3 → `trigger_client_session_reminders()`, daily 08:00)
  has its **own** auto-cancel block that only checks `payment_deadline_hours` and never reads
  `auto_cancel_enabled`. `auto_cancel_enabled` defaults to **false**, so by default the edge run
  cancels sessions the practice never opted into cancelling.

**Fix (local only, NOT deployed):**
- `supabase/functions/_shared/reminderLogic.ts` — new pure `shouldAutoCancelUnpaidSession()`
  (+ `DEFAULT_PAYMENT_DEADLINE_HOURS`), gated on `autoCancelEnabled === true`.
- `supabase/functions/send-session-reminders/index.ts` — selects `auto_cancel_enabled`, feeds it
  through `settingsMap`, replaces the inline deadline math with the new predicate.
- `supabase/functions/_shared/reminderLogic.test.ts` — +7 unit tests. `npx vitest run
  supabase/functions/_shared/reminderLogic.test.ts` → **22 passed**. `biome check` clean.

Deploy with `supabase functions deploy send-session-reminders` once the migration drift is sorted.
The `payment_deadline_hours` cutoff itself already works; whether Settings labels it "Unpaid
session cutoff" is a FE wording check for you (`SettingsPage.tsx` ~line 1937).

---

## B. Stale — already fixed in current code; verify in-app then close

| Todo | Note |
|---|---|
| **`fca1aba9`** block booking sends N emails + price not divided (newest P1, 29 Aug) | `CreateSessionModal.tsx` already splits the block price across rows (`priceForIndex`, ~L208-216) and calls `notify-block-booked` **once** when `blockId && ids.length > 1` (~L287). `notify-block-booked/index.ts` sends a single email with the block total. |
| **`1ee2ccbe`** one email for a block, not one per session | Same as above — `notify-block-booked` exists and is wired. |
| **`4bec0e91`** need an error / "try again or report" page | `src/pages/common/NotFoundPage/` exists; `ErrorBoundary.tsx` exists. Completed twin `08305a37` in your list. |
| **`7178316a`** create offline clients + CSV import | `client_stubs` + CSV import shipped long ago (see memory `feature_session_notes_stubs`, `feature_shadow_clients_v2`). |
| **`d21d1d46`** RESEND: verify a domain before invites reach arbitrary addresses | Not code. You migrated to `withclarity.uk` (commit `dc9f51a`). Confirm the domain is verified in Resend and `RESEND_FROM_EMAIL` is set in Supabase edge secrets — this is the likely common cause of several "email didn't arrive" todos below. |

Prefixed `[testing only] ` and left open (per your instruction): `fca1aba9`, `1ee2ccbe`,
`8f10756a`, `c6fa915f`, `548a6fbc`.

---

## C. Real bugs — root-caused, but FE lane or need your decision

| Todo | Finding / where |
|---|---|
| **`2ba80556`** "registering via sub doesn't give you admin_id" | **Confirmed live:** client `rosieprince96@hotmail.co.uk` has `users.admin_id = NULL` but `admin_codename = 'zxcv'` — `consume_platform_access_token` ran the stub-merge branch but skipped the `admin_id` update because the stub's `platform_access_token.admin_id` was null. Also 2 orphan `public.users` client rows with no `auth.users` row. Root cause is a **stub/token created without `admin_id`** — needs a guard at stub-creation + a one-row backfill. I did **not** patch the live signup path blind. Cascades into `83ebe124`, `fac84c8f`, `4e2cf27b` (admin can't see the client, forms won't assign — all downstream of null `admin_id` + RLS). |
| **`7426e25f`** approve cancellation → client dashboard/session page still shows it | Needs a trace of `request-cancel-session` approval → does it set `sessions.status='cancelled'`, and does the **client** have a realtime subscription on `sessions`? Memory `project_overnight_bugfix_20260820` notes "client had no realtime sync" for several tables. Likely a client-side realtime gap (FE). |
| **`f4c9949b` / `f75e57e4`** admin marks paid/unpaid, client UI never updates; Stripe confirms but still shows unpaid | Same class — client realtime/refetch gap on `sessions` payment fields, plus possibly the webhook path. FE + a webhook check. Memory `project_stripe_e2e_setup` flags the session-payment webhook still needs a 2nd destination for connected accounts. |
| **`a350a3ca`** no admin email when a shadow client joins | Code **is** wired (`AuthContext.tsx:387` fires `notify-admin-stub-joined` when a linked stub exists). Fire-and-forget, no error surfaced. If it's genuinely not arriving it's the RESEND domain/secret (`d21d1d46`) or the stub lacked `linked_user_id`. |
| **`b8fba132` / `d2957ba6`** stub invite lands on admin signup / token lost after join / bounced to signup not dashboard | `invite-stub-client` builds `${APP_URL}/signup?token=…` correctly. Whether `/signup` reads `?token=` and shows the client (not admin) flow, and routes to `/dashboard` post-merge, is `SignUpPage` — **FE**. e2e `e2e/offline-invite-merge/` exists; extend it. |
| **`e9f769c6`** password reset email doesn't reset password | Shipped repeatedly per memory, so likely a Supabase **Auth redirect URL** stale after the `withclarity.uk` domain move (see memory `project_domain_change_checklist`). Check Auth → URL Configuration + the email template's `{{ .ConfirmationURL }}` target. Dashboard task, not code. |
| **`017c15ae`** sidebar missing "logs" on mobile | FE, `Sidebar` / nav config. |
| **`b1a4fea8`** `/subscribe` page not centred | FE CSS. |
| **`7e73ad3a`** drag-and-drop not working on touchscreens (dup P2 `9a7e8ea7`) | FE — RBC drag backend / pointer events. Known hard problem. |

---

## D. Large feature requests filed as "High" — not bugs, need scoping

- **`f58f771a`** — block-session payment UX: your own note says "this should be a new component
  altogether" (carousel of sessions, "pay for block" action, past sessions move out, etc). FE build.
- **`119608db`** — "no way for a client to pay a whole block in one go". `PaymentModal.tsx` already
  has block refs — may be partly done; needs a look. FE.
- **`ba1e94b1`** — manual-payment "mark as paid manually" split button → admin verifies in bank.
  `notify-client-payment-claimed` edge fn + `payments` flow largely exist (memory
  `feature_payments_page`, `feature_cancellation_requests`). Verify how much is left. Mostly FE.
- **`b6ea0fb8`** — CSV import: multiple sessions per client, per-client files, code-paired 2nd upload. FE + import spec.
- **`1f7662d0` / `28f42464` / `f5d332f8` / `3bce2947`(P2)** — encrypt all client PII (names, emails,
  passwords, form responses) / "supaadmin shouldn't see everything". Architectural — weeks, not a
  night. Note: auth emails/passwords live in `auth.users` (GoTrue), you can't app-encrypt those.
  Worth a dedicated design doc; ties into your GDPR launch-blockers memory.
- **`ad1d9789`** — "remove website packages from subscription". FE (`SubscribePage`) + Stripe price
  objects. Overlaps memory `feature_usage_based_pricing` (prices not yet recut in Stripe).

---

## E. Config / ops (not code)

- **`d21d1d46`** RESEND domain verification (see B).
- **`e9f769c6`** Auth redirect URLs after domain move (see C).
- **`5c3fbd61`** "test subscription / signup flow" — e2e `e2e/stripe/` + `e2e/change-plan/` exist; run them.
- **`1de3d06d`** "don't use `verify_jwt = false`" — 5 functions use it: `stripe-webhook`,
  `handle-unsubscribe`, `request-demo`, `notify-auto-cancelled`, `sync-{google,microsoft}-calendar-event`.
  Most **must** stay `false` (Stripe/webhook/email-link/public callers carry no Supabase JWT) — they
  authenticate by signature / secret header / token instead. This isn't a blanket bug; each needs a
  per-function "is its own auth sufficient?" check. `stripe-webhook` verifies the Stripe signature —
  fine. Worth a short audit, not a blind flip (flipping would break payments).

## F. Non-actionable

- **`c94cf499`** "Follow up with Sarah on CBT worksheet" — personal task, deadline 22 Jul, stale.
- **`10cdc422`** "forms > onboard is what should be used for client consent?" — question, not a bug.
  Answer: yes. Consent = plain text + PDF in Settings → Practice (the `practice_documents` approach
  was reverted, memory `feature_onboarding_documents`).

---

## Suggested order when you're back

1. Resolve the `010009 / 010010` migration drift, then `supabase db push` (ships **A1**) and
   `supabase functions deploy send-session-reminders` (ships **A2**).
2. `2ba80556` null `admin_id` — guard stub/token creation + backfill the one live row. (I can do this.)
3. Client realtime gaps: `7426e25f`, `f4c9949b`, `f75e57e4` — one FE pass on `sessions` subscriptions.
4. Dashboard/Resend config: `d21d1d46`, `e9f769c6` (unblocks `a350a3ca` and the email complaints).
5. Close the stale B-list after a 2-minute click-through.
