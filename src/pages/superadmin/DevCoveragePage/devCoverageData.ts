// Hand-maintained catalogue of what actually has test coverage, for what was
// actually verified, and where the known gaps are. Nothing here is derived
// automatically from a coverage tool — every line is something a person (or
// Claude, in a session with Stephen) checked and is willing to stand behind.
//
// Two different kinds of claim live on this page, and they are NOT the same
// strength of claim — keep them visually distinct:
//   1. SUITE_SUMMARY / ALL_TEST_FILES — mechanical counts from the source
//      tree (grep for it()/test()) and one real `npx vitest run`. This says
//      "these tests exist and were green as of this date" — nothing more.
//   2. COVERAGE — a handful of features that got an actual deep-dive: what
//      was verified beyond "the test passed" (a live probe against the real
//      DB, a screenshot actually looked at, etc.), and what's still a gap.
//
// Add a COVERAGE entry each time a feature ships with that level of scrutiny.
// Refresh SUITE_SUMMARY / ALL_TEST_FILES periodically — they'll drift as the
// suite grows; that's fine, just re-run and re-paste rather than hand-editing
// counts.

export type TestRef = {
  file: string;
  count: number;
  note?: string;
};

export type CoverageEntry = {
  id: string;
  title: string;
  summary: string;
  /** Edge functions / migrations / other server-side pieces, one line each. */
  backend?: string[];
  unit?: TestRef[];
  e2e?: TestRef[];
  /** ISO date this entry's claims were last actually checked. */
  verifiedAt: string;
  /** How it was verified, beyond "tests pass" — live probes, manual runs, etc. */
  verification?: string[];
  /** What is NOT covered, stated plainly. */
  gaps?: string[];
};

// ── Whole-suite totals ──────────────────────────────────────────────────────
// From a real `npx vitest run` (unit) and a source count of `test(` calls per
// Playwright spec (e2e — running all of them takes ~30+ min against the real
// DB, so this is a static count, not a fresh full run every time this page
// loads). Re-run and update the numbers below when they've drifted.

export const SUITE_SUMMARY = {
  unit: {
    filesPassed: 73,
    filesSkipped: 9,
    testsPassed: 720,
    testsTodo: 43,
    command: "npx vitest run",
    ranAt: "2026-09-07",
  },
  e2e: {
    files: 22,
    tests: 91,
    command: "npx playwright test",
    note: "Counted from source (test() calls per spec) — not every suite was re-run this session. Re-run and confirmed green 2026-09-09: messaging (7) — new this session, API-level against the real project (RLS, the three RPCs, the away auto-reply via the deployed edge function), self-cleaning by TAG.",
    ranAt: "2026-09-09",
  },
};

export type TestFileEntry = { kind: "unit" | "e2e"; file: string; count: number };

// One row per test file, mechanically counted. This is the "exists and is
// green as of the date above" list — not a claim that every one of these was
// individually re-verified beyond its own assertions passing.
export const ALL_TEST_FILES: TestFileEntry[] = [
  { kind: "unit", file: "src/Helpers/Helpers.test.ts", count: 37 },
  { kind: "unit", file: "src/Helpers/calendarExport.test.ts", count: 13 },
  { kind: "unit", file: "src/Helpers/csvExport.test.ts", count: 5 },
  { kind: "unit", file: "src/Helpers/outcomeMeasureScoring.test.ts", count: 13 },
  { kind: "unit", file: "src/Helpers/pdfBranding.test.ts", count: 6 },
  { kind: "unit", file: "src/Helpers/rcadsScoring.test.ts", count: 20 },
  { kind: "unit", file: "src/Helpers/referral.test.ts", count: 8 },
  { kind: "unit", file: "src/Helpers/sessionDate.test.ts", count: 14 },
  { kind: "unit", file: "src/Helpers/sessionGrouping.test.ts", count: 8 },
  { kind: "unit", file: "src/Helpers/sessionOverlap.test.ts", count: 12 },
  { kind: "unit", file: "src/components/Consent/ConsentModal.test.tsx", count: 4 },
  { kind: "unit", file: "src/components/Onboarding/OnboardingModal.test.tsx", count: 5 },
  { kind: "unit", file: "src/components/shared/Avatar/Avatar.test.tsx", count: 2 },
  { kind: "unit", file: "src/components/shared/BlockSessionCard/BlockSessionCard.test.tsx", count: 6 },
  { kind: "unit", file: "src/components/shared/BlockSessionCard/blockPaymentState.test.ts", count: 5 },
  { kind: "unit", file: "src/components/shared/Button/Button.test.tsx", count: 5 },
  { kind: "unit", file: "src/components/shared/Card/Card.test.tsx", count: 3 },
  { kind: "unit", file: "src/components/shared/EncryptionStatusPill/EncryptionStatusPill.test.tsx", count: 5 },
  { kind: "unit", file: "src/components/shared/ErrorBoundary/ErrorBoundary.test.tsx", count: 8 },
  { kind: "unit", file: "src/components/shared/Modal/Modal.test.tsx", count: 3 },
  { kind: "unit", file: "src/components/shared/Navbar/Navbar.test.tsx", count: 4 },
  { kind: "unit", file: "src/components/shared/PasswordInput/PasswordInput.test.tsx", count: 6 },
  { kind: "unit", file: "src/components/shared/PausedBanner/PausedBanner.test.tsx", count: 5 },
  { kind: "unit", file: "src/components/shared/PaymentModal/PaymentModal.test.tsx", count: 12 },
  { kind: "unit", file: "src/components/shared/ProgressChart/ProgressChart.test.tsx", count: 10 },
  { kind: "unit", file: "src/components/shared/ProtectedRoute/ProtectedRoute.test.tsx", count: 3 },
  { kind: "unit", file: "src/components/shared/RcadsResultsCard/RcadsResultsCard.test.tsx", count: 7 },
  { kind: "unit", file: "src/components/shared/SchedulerCalendar/SchedulerCalendar.test.tsx", count: 4 },
  { kind: "unit", file: "src/components/shared/SchedulerCalendar/schedulerUtils.test.ts", count: 13 },
  { kind: "unit", file: "src/components/shared/SegmentedTabs/SegmentedTabs.test.tsx", count: 3 },
  { kind: "unit", file: "src/components/shared/SessionCard/CreateSessionModal/CreateSessionModal.test.tsx", count: 13 },
  { kind: "unit", file: "src/components/shared/SessionCard/SessionCard.test.tsx", count: 8 },
  { kind: "unit", file: "src/components/shared/SessionPrepCard/SessionPrepCard.test.tsx", count: 8 },
  { kind: "unit", file: "src/components/shared/StatTile/StatTile.test.tsx", count: 4 },
  { kind: "unit", file: "src/components/shared/ThreeWayToggle/ThreeWayToggle.test.tsx", count: 4 },
  { kind: "unit", file: "src/components/shared/UpdateBanner/UpdateBanner.test.tsx", count: 7 },
  { kind: "unit", file: "src/components/shared/ViewportWarningBanner/ViewportWarningBanner.test.tsx", count: 8 },
  { kind: "unit", file: "src/context/EncryptionContext.test.tsx", count: 8 },
  { kind: "unit", file: "src/lib/noteEncryption.test.ts", count: 8 },
  { kind: "unit", file: "src/pages/admin/AdminClientsPage/AdminClientsPage.test.tsx", count: 9 },
  { kind: "unit", file: "src/pages/admin/AdminClientsPageDetailed/AdminClientsPageDetailed.test.tsx", count: 66 },
  { kind: "unit", file: "src/pages/admin/AdminDashboard/AdminDashboard.test.tsx", count: 3 },
  {
    kind: "unit",
    file: "src/pages/admin/AdminDashboard/Blocks/UpcomingSessions/upcomingSessionsUtils.test.ts",
    count: 9,
  },
  { kind: "unit", file: "src/pages/admin/AdminDashboard/dashboardUtils.test.ts", count: 15 },
  { kind: "unit", file: "src/pages/admin/AdminFinancesPage/financeOverview.test.ts", count: 13 },
  { kind: "unit", file: "src/pages/admin/AdminInvoicesPage/invoiceMath.test.ts", count: 5 },
  { kind: "unit", file: "src/pages/admin/AdminQuestionnairesPage/AdminQuestionnairesPage.test.tsx", count: 4 },
  { kind: "unit", file: "src/pages/admin/AdminResourcesPage/AdminResourcesPage.test.tsx", count: 5 },
  { kind: "unit", file: "src/pages/admin/AdminScheduler/schedulerOverviewUtils.test.ts", count: 18 },
  { kind: "unit", file: "src/pages/admin/AdminStubDetailPage/AdminStubDetailPage.test.tsx", count: 2 },
  { kind: "unit", file: "src/pages/admin/utils/AdminClientsPageUtils.test.ts", count: 4 },
  { kind: "unit", file: "src/pages/client/CheckInPage/CheckInPage.test.tsx", count: 4 },
  { kind: "unit", file: "src/pages/client/ClientDashboard/ClientDashboard.test.tsx", count: 4 },
  { kind: "unit", file: "src/pages/client/ClientSchedule/ClientSchedule.test.tsx", count: 5 },
  { kind: "unit", file: "src/pages/client/LoginPage/LoginPage.test.tsx", count: 4 },
  { kind: "unit", file: "src/pages/client/ResourcesPage/ResourcesPage.test.tsx", count: 10 },
  { kind: "unit", file: "src/pages/common/AdminSetupPage/AdminSetupPage.test.tsx", count: 16 },
  { kind: "unit", file: "src/pages/common/CounsellorSignupPage/CounsellorSignupPage.test.tsx", count: 5 },
  { kind: "unit", file: "src/pages/common/SettingsPage/DeleteUserModal/DeleteUserModal.test.tsx", count: 12 },
  { kind: "unit", file: "src/pages/common/SettingsPage/SettingsPage.test.tsx", count: 38 },
  { kind: "unit", file: "src/pages/common/SignUpPage/SignUpPage.test.tsx", count: 5 },
  { kind: "unit", file: "src/pages/superadmin/DevCoveragePage/DevCoveragePage.test.tsx", count: 4 },
  { kind: "unit", file: "src/pages/superadmin/SuperAdminPage/SuperAdminPage.test.tsx", count: 3 },
  { kind: "unit", file: "src/store/slices/__tests__/resourceFavouritesSlice.test.ts", count: 4 },
  { kind: "unit", file: "src/store/slices/__tests__/resourcesSlice.test.ts", count: 3 },
  { kind: "unit", file: "src/store/slices/__tests__/responsesSlice.test.ts", count: 10 },
  { kind: "unit", file: "src/store/slices/__tests__/sessionsSlice.test.ts", count: 11 },
  { kind: "unit", file: "src/store/slices/messagesSlice.test.ts", count: 7 },
  { kind: "unit", file: "src/store/slices/sessionsSlice.test.ts", count: 11 },
  { kind: "unit", file: "src/store/slices/tagsSlice.test.ts", count: 4 },
  { kind: "unit", file: "src/store/slices/userDirectorySlice.test.ts", count: 11 },
  { kind: "unit", file: "supabase/functions/_shared/reminderLogic.test.ts", count: 23 },
  { kind: "unit", file: "supabase/functions/notify-client-lifecycle/lifecycleEmail.test.ts", count: 13 },

  { kind: "e2e", file: "e2e/account-lifecycle/account-lifecycle.spec.ts", count: 8 },
  { kind: "e2e", file: "e2e/account-lifecycle/account-lifecycle-ui.spec.ts", count: 2 },
  { kind: "e2e", file: "e2e/auth-redirects/auth-redirects.spec.ts", count: 5 },
  { kind: "e2e", file: "e2e/auto-cancel/auto-cancel.spec.ts", count: 4 },
  { kind: "e2e", file: "e2e/axe-scan.spec.ts", count: 6 },
  { kind: "e2e", file: "e2e/change-plan/change-plan.spec.ts", count: 2 },
  { kind: "e2e", file: "e2e/checkin-flow/checkin-flow.spec.ts", count: 1 },
  { kind: "e2e", file: "e2e/client-cap/client-cap.spec.ts", count: 5 },
  { kind: "e2e", file: "e2e/client-lifecycle/client-lifecycle.spec.ts", count: 3 },
  { kind: "e2e", file: "e2e/messaging/messaging.spec.ts", count: 7 },
  { kind: "e2e", file: "e2e/offline-invite-merge/offline-invite-merge.spec.ts", count: 2 },
  { kind: "e2e", file: "e2e/reminder-notification/reminder-notification.spec.ts", count: 1 },
  { kind: "e2e", file: "e2e/reschedule-approval/reschedule-approval.spec.ts", count: 3 },
  { kind: "e2e", file: "e2e/resources-favourites/resources-favourites.spec.ts", count: 3 },
  { kind: "e2e", file: "e2e/session-extras/session-extras.spec.ts", count: 5 },
  { kind: "e2e", file: "e2e/session-payment/session-payment.spec.ts", count: 2 },
  { kind: "e2e", file: "e2e/session-realtime/session-realtime.spec.ts", count: 2 },
  { kind: "e2e", file: "e2e/settings/settings-behavior.spec.ts", count: 12 },
  { kind: "e2e", file: "e2e/settings/settings.spec.ts", count: 5 },
  { kind: "e2e", file: "e2e/stripe/stripe.spec.ts", count: 8 },
  { kind: "e2e", file: "e2e/token-signup/token-signup.spec.ts", count: 3 },
  { kind: "e2e", file: "e2e/update-banner/update-banner.spec.ts", count: 2 },
];

// ── Deep-dive entries ────────────────────────────────────────────────────────
// A much smaller list, on purpose: these are the features where verification
// went beyond "the assertions passed" — see the file-level comment above.

export const COVERAGE: CoverageEntry[] = [
  {
    id: "messaging-20260909",
    title: "Direct messaging — RLS boundary, RPCs, away auto-reply",
    summary:
      "Client ↔ their own practitioner messaging (behind VITE_FF_MESSAGING): the conversation/message tables and their RLS, the three RPCs (get_or_create_conversation, list_my_conversations, mark_conversation_read), the floating ChatWidget + unread badges (tab title / favicon / PWA), the new-message client email, and the practitioner's away / out-of-hours auto-reply.",
    backend: [
      "migration 20260908000100 — conversations + messages, RLS (read-if-party, insert-only-as-self-to-the-other-party), realtime publication",
      "migration 20260908000110 — list_my_conversations() → SECURITY DEFINER (a client has no RLS route to their admin's users row, so an INVOKER join returned nothing and the composer never rendered)",
      "migration 20260908000130 — conversations.last_notified_at + 'new_message' email type",
      "migration 20260908000140 — practice_settings.msg_autoreply_* + msg_office_hours (jsonb), conversations.autoreply_at, messages.is_auto",
      "notify-new-message edge fn — client→admin: posts an is_auto auto-reply when the practitioner is away, once per 4h; admin→client: emails the client only if away >10min and not emailed for the thread in 15min. No message body in the email.",
    ],
    unit: [
      {
        file: "src/store/slices/messagesSlice.test.ts",
        count: 7,
        note: "realtime + optimistic-send + unread bookkeeping",
      },
    ],
    e2e: [
      {
        file: "e2e/messaging/messaging.spec.ts",
        count: 7,
        note: "API-level (supabase-js sessions + dbQuery, no browser) — two practices built in the DB so isolation is asserted from a session that legitimately can't see the thread; self-cleaning by TAG",
      },
    ],
    verifiedAt: "2026-09-09",
    verification: [
      "e2e/messaging asserts, from real unprivileged sessions: a client can open their own thread and list_my_conversations returns it WITH the admin's name (the SECURITY DEFINER fix); both parties read a message and unread is tracked; a client cannot post as someone else or to the wrong recipient; mark_conversation_read clears only the caller's unread; a client cannot open a thread with an admin who isn't theirs; practice B cannot read practice A's conversation or messages; and the away auto-reply — with msg_away_until set, invoking the deployed notify-new-message posts exactly one is_auto reply across two client messages (4h cooldown) and stamps conversations.autoreply_at.",
      "Browser runs (seeded throwaway admin+client, purged): client starts a thread and both sides send/receive; the ChatWidget opens/minimises on the dashboard and a send round-trips; the tab title shows (N) and the nav badge clears on read; the AutoReplySettings modal loads + saves and a holiday-mode auto-reply lands in the client's thread via realtime, tagged 'Automatic reply'.",
      "npm run build — green; biome — clean on the touched files.",
    ],
    gaps: [
      "No browser-driven e2e spec (the messaging spec is API-level only, like e2e/agency).",
      "Messages are NOT end-to-end encrypted — deliberate (RLS + at-rest is the boundary; the UI + ToS/Privacy say so). pgcrypto/E2E not implemented.",
      "New-message email de-dup relies on users.last_seen_at freshness; not load-tested.",
    ],
  },
  {
    id: "coverage-expansion-20260907",
    title: "Coverage expansion — auth gate, token signup, resources, reschedule",
    summary:
      "Filled four e2e blind spots (nothing about them was tested before) plus untested pure-logic helpers. Every e2e spec was run live against the real Supabase project this session, confirmed green, and confirmed to leave no fixture rows behind.",
    unit: [
      {
        file: "src/Helpers/calendarExport.test.ts",
        count: 13,
        note: "new — ICS shape, CRLF, RFC-5545 75-octet folding, DTEND from duration, filename slug",
      },
      {
        file: "src/Helpers/referral.test.ts",
        count: 8,
        note: "new — ?ref= capture/normalise, no-clobber on param-less nav",
      },
      {
        file: "src/store/slices/__tests__/responsesSlice.test.ts",
        count: 10,
        note: "new — id-keyed merge on re-fetch, prepend/delete, chart selectors",
      },
      {
        file: "src/Helpers/sessionDate.test.ts",
        count: 14,
        note: "+11 — formatDate/formatTime + csvToIso strict parsing",
      },
      {
        file: "src/Helpers/Helpers.test.ts",
        count: 37,
        note: "+14 — getResponseDate, pickColor, isPdfUrl, maskedProfileValue",
      },
    ],
    e2e: [
      {
        file: "e2e/auth-redirects/auth-redirects.spec.ts",
        count: 5,
        note: "browser — wrong password, unauth deep-link, client/admin role bounces, sign-out re-gates",
      },
      {
        file: "e2e/token-signup/token-signup.spec.ts",
        count: 3,
        note: "browser + RPC — /signup links client to practice + burns token; bad token refused at form; used token refused by consume_platform_access_token",
      },
      {
        file: "e2e/resources-favourites/resources-favourites.spec.ts",
        count: 3,
        note: "browser — pinned-first order, star -> Favourites tab + survives reload, un-star removes",
      },
      {
        file: "e2e/reschedule-approval/reschedule-approval.spec.ts",
        count: 3,
        note: "API/RLS — client files request, cannot self-approve, admin approval moves the session + marks both rows",
      },
    ],
    verifiedAt: "2026-09-07",
    verification: [
      "All four e2e specs run this session against the real deployed Supabase project via the shared e2e-settings fixture: auth-redirects 5/5, token-signup 3/3, resources-favourites 3/3, reschedule-approval 3/3.",
      "token-signup drives the actual /signup form in a browser, then reads public.users / platform_access_token straight from the DB to confirm the account linked to the fixture practice and the token flipped is_used = true.",
      "Ran a DB sweep after the suite (resources like 'E2E %', tokens like 'E2E-SIGNUP-%', tokensignup users, orphan reschedule_requests) — 0 rows left behind. token-signup also carries a namespaced afterAll sweep so a SIGKILLed run self-heals.",
      "Full unit suite re-run: npx vitest run -> 720 passed / 43 todo. biome check + tsc --noEmit clean on every new/changed file.",
    ],
    gaps: [
      "reschedule-approval exercises the request INSERT + admin-approve writes and their RLS, not the MUI date-picker modal the client actually uses (same trade-off as session-payment.spec.ts).",
      "token-signup's happy path does not assert the welcome email / auto-confirm-signup side effects, only the DB end state.",
      "Resources favourites: no coverage of the admin side (pinning a resource from /admin/resources) — only the client-facing consumption of is_pinned.",
    ],
  },
  {
    id: "account-pause-export-delete",
    title: "Practice pause, full-practice export, and account deletion",
    summary:
      "Admin self-serve pause/resume (read-only lock + Stripe pause), a one-click full-practice export offered before deletion, a stepped delete-confirmation flow, and the retention copy across the T&Cs, Settings, and the promo FAQ.",
    backend: [
      "pause-practice edge fn — admin self-serve pause/resume + Stripe pause_collection, idempotent",
      "export-practice-archive edge fn — zips clients/sessions/notes + payments as .xlsx + .pdf",
      "migration 20260904000000 — a paused owner can still write their own users row (self-close carve-out)",
      "migration 20260904000001 — fixed delete_own_account's admin branch, which had never worked (see verification)",
    ],
    unit: [
      { file: "DeleteUserModal.test.tsx", count: 12 },
      { file: "PausedBanner.test.tsx", count: 5 },
      { file: "SettingsPage.test.tsx", count: 38, note: "incl. 4 for the new Pause/Resume card" },
    ],
    e2e: [
      {
        file: "e2e/account-lifecycle/account-lifecycle.spec.ts",
        count: 8,
        note: "API-level (fetch/dbQuery, no browser) — real Supabase project, self-cleaning fixture + throwaway accounts",
      },
      {
        file: "e2e/account-lifecycle/account-lifecycle-ui.spec.ts",
        count: 2,
        note: "browser-driven, video recorded — real login, real clicks, one deletes a throwaway admin start to finish",
      },
    ],
    verifiedAt: "2026-09-04",
    verification: [
      "Live probe against the deployed DB: created a fresh throwaway admin, called delete_own_account with its real JWT. Before the fix it failed — both paused and unpaused — with an audit_logs FK violation and nothing was deleted. After the fix it succeeds both ways, and public.users + auth.users rows are both confirmed gone.",
      'account-lifecycle-ui.spec.ts drives an actual browser: signs in for real, clicks Settings -> Billing -> Pause practice -> confirms in the dialog -> sees both the card copy and the app-wide PausedBanner -> resumes; separately, a fresh throwaway admin clicks Delete account -> Continue -> Export my data -> types the practice name -> Delete account, ends up back at /login, and the DB row is confirmed gone. video: "on" in playwright.config.ts records both — open the report (npx playwright show-report) to watch them.',
      "npm run build — green",
    ],
    gaps: [
      "Static legal copy (Terms/Privacy/FAQ wording) has no test coverage",
      'Video is retained locally under test-results/ / playwright-report/ from whoever\'s machine last ran the suite — nothing is uploaded anywhere, so "the video" is only as fresh as the last local run',
    ],
  },
  {
    id: "settings-e2e-hygiene",
    title: "Settings e2e reliability (settings.spec.ts + settings-behavior.spec.ts)",
    summary:
      "Four real, confirmed bugs found and fixed while trying to verify nothing was broken by other work: a stale tab-layout assertion, a permanently-blocking onboarding modal, and two tests that leaked shared-fixture state on any failure, poisoning unrelated later runs.",
    e2e: [
      { file: "e2e/settings/settings.spec.ts", count: 7, note: "all 3 real bugs fixed, verified 7/7 twice in a row" },
      {
        file: "e2e/settings/settings-behavior.spec.ts",
        count: 12,
        note: "3 of 4 known issues fixed; 1 test still intermittently times out, unresolved (see gaps)",
      },
    ],
    verifiedAt: "2026-09-04",
    verification: [
      "settings.spec.ts: OnboardingModal for demo-admin can never actually be dismissed (its profile writes are intentionally short-circuited, per 20260831000000_reset_demo_onboarding.sql) — replaced click-and-hope dismissal with a DOM-removal that survives every navigation. Re-ran the full file twice, 7/7 both times.",
      "settings-behavior.spec.ts 'Reschedule cutoff': found 3 real leftover session rows in the DB from an earlier crashed run (created ~4 min before, at the test's exact filler/near/far offsets), deleted them, added guaranteed cleanup, reran — passed.",
      "settings-behavior.spec.ts 'Client consent gate': found consent_enabled stuck true on the shared fixture practice from an earlier crash; confirmed the leak by checking DB state directly before and after; added guaranteed cleanup.",
      "settings-behavior.spec.ts consent test: screenshotted the actual live ConsentModal and found it now requires a typed name to sign before Continue enables — the test only ever checked the agreement box. Fixed by filling the name field.",
    ],
    gaps: [
      "settings-behavior.spec.ts's consent-dialog-appearance check still times out intermittently even after all three fixes above. A manual repro of the identical flow (confirmed via network-response logging: correct RPC data, 200s) shows the dialog rendering reliably, so this looks like the dev server responding slowly under many consecutive hours of heavy use this session rather than a code defect — but that is a guess, not a confirmed root cause.",
    ],
  },
  {
    id: "dev-coverage-page",
    title: "This page",
    summary: "The /dev route itself — superadmin-gated, linked from /superadmin.",
    unit: [{ file: "DevCoveragePage.test.tsx", count: 4 }],
    verifiedAt: "2026-09-04",
    verification: [
      "Flipped the e2e fixture admin to superadmin, logged in via Playwright, screenshotted /dev, reverted the flag afterwards — looked at the actual screenshot before claiming it renders.",
    ],
    gaps: ["No e2e test — the visual check above was one-off, not a regression test that runs going forward"],
  },
];
