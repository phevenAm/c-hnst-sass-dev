import { MemoryRouter } from "react-router-dom";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import DevCoveragePage from "./DevCoveragePage";
import { ALL_TEST_FILES, SUITE_SUMMARY } from "./devCoverageData";

const unitFileCount = ALL_TEST_FILES.filter((f) => f.kind === "unit").length;
const e2eFileCount = ALL_TEST_FILES.filter((f) => f.kind === "e2e").length;

afterEach(cleanup);

function renderPage() {
  return render(
    <MemoryRouter>
      <DevCoveragePage />
    </MemoryRouter>,
  );
}

describe("DevCoveragePage", () => {
  it("renders a heading and links back to the superadmin console (happy path)", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Test coverage", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Superadmin/ })).toHaveAttribute("href", "/superadmin");
  });

  it("shows the whole-suite totals, not just the deep-dive entries (happy path)", () => {
    const { container } = renderPage();
    const statValues = Array.from(container.querySelectorAll('[class*="statValue"]')).map((el) => el.textContent);
    // unit passing, unit files, e2e tests, e2e files, deep-dive count. File
    // counts come from ALL_TEST_FILES (the same source as the inventory
    // table below), not a separately hand-typed number, so the two can't drift.
    expect(statValues).toEqual([
      String(SUITE_SUMMARY.unit.testsPassed),
      String(unitFileCount),
      String(SUITE_SUMMARY.e2e.tests),
      String(e2eFileCount),
      "3",
    ]);
  });

  it("lists a catalogued feature with its unit and e2e test files (happy path)", () => {
    renderPage();
    expect(screen.getByText(/Practice pause, full-practice export, and account deletion/)).toBeInTheDocument();
    expect(screen.getByText("DeleteUserModal.test.tsx")).toBeInTheDocument();
    // Appears both in the deep-dive card's own table and in the full mechanical inventory.
    expect(screen.getAllByText("e2e/account-lifecycle/account-lifecycle.spec.ts").length).toBeGreaterThanOrEqual(2);
  });

  it("surfaces known gaps rather than only the good news (sad path)", () => {
    renderPage();
    expect(screen.getAllByText("Known gaps").length).toBeGreaterThan(0);
    expect(screen.getByText(/Static legal copy/)).toBeInTheDocument();
  });

  // Regression: the top stat once read SUITE_SUMMARY.unit.filesPassed (60,
  // excludes skipped files) while the inventory heading below it read
  // ALL_TEST_FILES.length (69) — same page, two different numbers for
  // "unit test files". Caught by actually looking at a screenshot, not by a
  // test — this locks it so it can't quietly drift back apart.
  it("shows the same file count in the stat panel and the inventory heading", () => {
    renderPage();
    expect(screen.getByText(`Unit — ${unitFileCount} files`)).toBeInTheDocument();
    expect(screen.getByText(`E2E — ${e2eFileCount} files`)).toBeInTheDocument();
  });

  it("lists every unit and e2e test file in the full inventory, not just the deep-dive ones", () => {
    renderPage();
    // A file that only shows up in the mechanical inventory, not in a
    // hand-written deep-dive card — e.g. a plain scoring-logic test file.
    expect(screen.getByText("src/Helpers/rcadsScoring.test.ts")).toBeInTheDocument();
    expect(screen.getByText("e2e/axe-scan.spec.ts")).toBeInTheDocument();
    // Sanity: the inventory really does hold as many rows as the data file.
    expect(ALL_TEST_FILES.length).toBeGreaterThan(50);
  });
});
