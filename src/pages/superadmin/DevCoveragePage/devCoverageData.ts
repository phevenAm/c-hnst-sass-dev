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
    filesPassed: 60,
    filesSkipped: 9,
    testsPassed: 599,
    testsTodo: 43,
    command: "npx vitest run",
    ranAt: "2026-09-04",
  },
  e2e: {
    files: 17,
    tests: 70,
    command: "npx playwright test",
    note: "Counted from source (test() calls per spec) — not every suite was re-run this session. Suites actually re-run and confirmed green today: account-lifecycle (8, API-level) and account-lifecycle-ui (2, browser-driven with video).",
    ranAt: "2026-09-04",
  },
};

export type TestFileEntry = { kind: "unit" | "e2e"; file: string; count: number };

// One row per test file, mechanically counted. This is the "exists and is
// green as of the date above" list — not a claim that every one of these was
// individually re-verified beyond its own assertions passing.
export const ALL_TEST_FILES: TestFileEntry[] = [
  { kind: "unit", file: "src/Helpers/Helpers.test.ts", count: 23 },
  { kind: "unit", file: "src/Helpers/csvExport.test.ts", count: 5 },
  { kind: "unit", file: "src/Helpers/outcomeMeasureScoring.test.ts", count: 13 },
  { kind: "unit", file: "src/Helpers/pdfBranding.test.ts", count: 6 },
  { kind: "unit", file: "src/Helpers/rcadsScoring.test.ts", count: 20 },
  { kind: "unit", file: "src/Helpers/sessionDate.test.ts", count: 3 },
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
  { kind: "unit", file: "src/store/slices/__tests__/sessionsSlice.test.ts", count: 11 },
  { kind: "unit", file: "src/store/slices/sessionsSlice.test.ts", count: 11 },
  { kind: "unit", file: "src/store/slices/tagsSlice.test.ts", count: 4 },
  { kind: "unit", file: "src/store/slices/userDirectorySlice.test.ts", count: 11 },
  { kind: "unit", file: "supabase/functions/_shared/reminderLogic.test.ts", count: 23 },
  { kind: "unit", file: "supabase/functions/notify-client-lifecycle/lifecycleEmail.test.ts", count: 13 },

  { kind: "e2e", file: "e2e/account-lifecycle/account-lifecycle.spec.ts", count: 8 },
  { kind: "e2e", file: "e2e/account-lifecycle/account-lifecycle-ui.spec.ts", count: 2 },
  { kind: "e2e", file: "e2e/auto-cancel/auto-cancel.spec.ts", count: 4 },
  { kind: "e2e", file: "e2e/axe-scan.spec.ts", count: 6 },
  { kind: "e2e", file: "e2e/change-plan/change-plan.spec.ts", count: 2 },
  { kind: "e2e", file: "e2e/checkin-flow/checkin-flow.spec.ts", count: 1 },
  { kind: "e2e", file: "e2e/client-cap/client-cap.spec.ts", count: 5 },
  { kind: "e2e", file: "e2e/client-lifecycle/client-lifecycle.spec.ts", count: 3 },
  { kind: "e2e", file: "e2e/offline-invite-merge/offline-invite-merge.spec.ts", count: 2 },
  { kind: "e2e", file: "e2e/reminder-notification/reminder-notification.spec.ts", count: 1 },
  { kind: "e2e", file: "e2e/session-extras/session-extras.spec.ts", count: 5 },
  { kind: "e2e", file: "e2e/session-payment/session-payment.spec.ts", count: 2 },
  { kind: "e2e", file: "e2e/session-realtime/session-realtime.spec.ts", count: 2 },
  { kind: "e2e", file: "e2e/settings/settings-behavior.spec.ts", count: 12 },
  { kind: "e2e", file: "e2e/settings/settings.spec.ts", count: 5 },
  { kind: "e2e", file: "e2e/stripe/stripe.spec.ts", count: 8 },
  { kind: "e2e", file: "e2e/update-banner/update-banner.spec.ts", count: 2 },
];

// ── Deep-dive entries ────────────────────────────────────────────────────────
// A much smaller list, on purpose: these are the features where verification
// went beyond "the assertions passed" — see the file-level comment above.

export const COVERAGE: CoverageEntry[] = [
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
