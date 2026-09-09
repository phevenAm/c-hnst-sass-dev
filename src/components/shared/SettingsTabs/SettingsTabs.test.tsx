import { useState } from "react";
import { MemoryRouter, useSearchParams } from "react-router-dom";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import SettingsTabs, { type SettingsTabDef } from "./SettingsTabs";

afterEach(cleanup);

type TabId = "profile" | "practice" | "billing";
const TABS: SettingsTabDef<TabId>[] = [
  { id: "profile", label: "Profile" },
  { id: "practice", label: "Practice" },
  { id: "billing", label: "Billing" },
];

function UrlProbe() {
  const [sp] = useSearchParams();
  return <div data-testid="search">{sp.toString()}</div>;
}

// Controlled harness: mirrors how the settings pages own the active-tab state.
function Harness({
  initialEntries = ["/settings"],
  syncSearchParam,
  onChangeSpy,
}: {
  initialEntries?: string[];
  syncSearchParam?: boolean;
  onChangeSpy?: (id: TabId) => void;
}) {
  const [value, setValue] = useState<TabId>("profile");
  return (
    <MemoryRouter initialEntries={initialEntries}>
      <SettingsTabs
        tabs={TABS}
        value={value}
        onChange={(id) => {
          onChangeSpy?.(id);
          setValue(id);
        }}
        ariaLabel="Settings sections"
        idBase="settings"
        syncSearchParam={syncSearchParam}
      />
      <UrlProbe />
    </MemoryRouter>
  );
}

describe("SettingsTabs", () => {
  it("renders a tablist with one tab per def and marks the active one", () => {
    render(<Harness />);

    const list = screen.getByRole("tablist", { name: "Settings sections" });
    expect(list).toHaveAttribute("id", "settings-tabs");

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Profile", "Practice", "Billing"]);

    const profile = screen.getByRole("tab", { name: "Profile" });
    expect(profile).toHaveAttribute("aria-selected", "true");
    expect(profile).toHaveAttribute("id", "settings-tab-profile");
    expect(profile).toHaveAttribute("aria-controls", "settings-panel-profile");
    expect(profile).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "Practice" })).toHaveAttribute("tabindex", "-1");
  });

  it("selecting a tab fires onChange and moves the selected + tabbable state", () => {
    const onChangeSpy = vi.fn();
    render(<Harness onChangeSpy={onChangeSpy} />);

    fireEvent.click(screen.getByRole("tab", { name: "Billing" }));

    expect(onChangeSpy).toHaveBeenCalledWith("billing");
    expect(screen.getByRole("tab", { name: "Billing" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Billing" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "Profile" })).toHaveAttribute("aria-selected", "false");
  });

  it("consumes a ?tab= deep link and strips only the tab param", async () => {
    const onChangeSpy = vi.fn();
    render(<Harness initialEntries={["/settings?tab=billing&section=subscription"]} onChangeSpy={onChangeSpy} />);

    await waitFor(() => expect(onChangeSpy).toHaveBeenCalledWith("billing"));
    expect(screen.getByRole("tab", { name: "Billing" })).toHaveAttribute("aria-selected", "true");
    // `section` is left in place for the page's SettingsCard to act on.
    expect(screen.getByTestId("search")).toHaveTextContent("section=subscription");
    expect(screen.getByTestId("search")).not.toHaveTextContent("tab=billing");
  });

  it("ignores an unknown ?tab= value and leaves the URL untouched", async () => {
    const onChangeSpy = vi.fn();
    render(<Harness initialEntries={["/settings?tab=nonsense"]} onChangeSpy={onChangeSpy} />);

    await Promise.resolve();
    expect(onChangeSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId("search")).toHaveTextContent("tab=nonsense");
  });

  it("does not touch the URL when syncSearchParam is false", async () => {
    const onChangeSpy = vi.fn();
    render(<Harness initialEntries={["/settings?tab=billing"]} syncSearchParam={false} onChangeSpy={onChangeSpy} />);

    await Promise.resolve();
    expect(onChangeSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId("search")).toHaveTextContent("tab=billing");
  });

  it("arrow keys move between tabs, Home/End jump to the ends", () => {
    const onChangeSpy = vi.fn();
    render(<Harness onChangeSpy={onChangeSpy} />);
    const list = screen.getByRole("tablist");

    fireEvent.keyDown(list, { key: "ArrowRight" });
    expect(onChangeSpy).toHaveBeenLastCalledWith("practice");

    fireEvent.keyDown(list, { key: "End" });
    expect(onChangeSpy).toHaveBeenLastCalledWith("billing");

    fireEvent.keyDown(list, { key: "Home" });
    expect(onChangeSpy).toHaveBeenLastCalledWith("profile");

    fireEvent.keyDown(list, { key: "ArrowLeft" });
    expect(onChangeSpy).toHaveBeenLastCalledWith("billing");
  });
});
