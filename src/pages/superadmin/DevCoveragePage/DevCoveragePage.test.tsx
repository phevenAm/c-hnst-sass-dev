import { MemoryRouter } from "react-router-dom";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import DevCoveragePage from "./DevCoveragePage";

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
    expect(screen.getByRole("heading", { name: "Test coverage" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Superadmin/ })).toHaveAttribute("href", "/superadmin");
  });

  it("lists a catalogued feature with its unit and e2e test files (happy path)", () => {
    renderPage();
    expect(screen.getByText(/Practice pause, full-practice export, and account deletion/)).toBeInTheDocument();
    expect(screen.getByText("DeleteUserModal.test.tsx")).toBeInTheDocument();
    expect(screen.getByText("e2e/account-lifecycle/account-lifecycle.spec.ts")).toBeInTheDocument();
  });

  it("surfaces known gaps rather than only the good news (sad path)", () => {
    renderPage();
    expect(screen.getByText("Known gaps")).toBeInTheDocument();
    expect(screen.getByText(/No video recording of any Playwright run/)).toBeInTheDocument();
  });

  it("totals the unit and e2e test counts across every catalogued entry", () => {
    const { container } = renderPage();
    // 12 + 5 + 38 unit, 8 e2e — see devCoverageData.ts. Recompute here so this
    // regresses if the totals drift out of sync with the underlying data.
    const statValues = Array.from(container.querySelectorAll('[class*="statValue"]')).map((el) => el.textContent);
    expect(statValues).toEqual(["1", "55", "8"]);
  });
});
