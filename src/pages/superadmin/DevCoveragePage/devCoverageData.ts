// Hand-maintained catalogue of what actually has test coverage, for what was
// actually verified, and where the known gaps are. Nothing here is derived
// automatically from a coverage tool — every line is something a person (or
// Claude, in a session with Stephen) checked and is willing to stand behind.
//
// Add an entry each time a feature ships with tests. Be honest about gaps —
// the whole point of this page is that "tests are green" is not the same
// claim as "this was verified" (see feedback_tests_green_not_verified).

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
        note: "real Supabase project, self-cleaning fixture + throwaway accounts",
      },
    ],
    verifiedAt: "2026-09-04",
    verification: [
      "Live probe against the deployed DB: created a fresh throwaway admin, called delete_own_account with its real JWT. Before the fix it failed — both paused and unpaused — with an audit_logs FK violation and nothing was deleted. After the fix it succeeds both ways, and public.users + auth.users rows are both confirmed gone.",
      "npm run build — green",
    ],
    gaps: [
      "No browser-driven click-through of the Pause/Resume button or the DeleteUserModal steps — coverage above is unit (mocked) + e2e (API-level HTTP calls), not a UI walkthrough",
      "No video recording of any Playwright run",
      "Static legal copy (Terms/Privacy/FAQ wording) has no test coverage",
    ],
  },
];
