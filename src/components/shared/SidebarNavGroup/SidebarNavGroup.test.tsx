import { MemoryRouter } from "react-router-dom";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import SidebarNavGroup, { type SidebarNavGroupClasses } from "./SidebarNavGroup";

afterEach(cleanup);

const Dot = () => <svg aria-hidden />;
const cx: SidebarNavGroupClasses = {
  group: "group",
  row: "row",
  rowActive: "rowActive",
  icon: "icon",
  label: "label",
  chevron: "chevron",
  chevronOpen: "chevronOpen",
  children: "children",
  childrenOpen: "childrenOpen",
  childLink: "childLink",
  childActive: "childActive",
};

const items = [
  { to: "/agency/clients?view=active", label: "All clients", Icon: Dot },
  { to: "/agency/clients?view=waiting", label: "Waiting list", Icon: Dot },
];

function renderGroup(props: Partial<React.ComponentProps<typeof SidebarNavGroup>> = {}) {
  return render(
    <MemoryRouter>
      <SidebarNavGroup
        label="Clients"
        Icon={Dot}
        items={items}
        parentActive={false}
        isItemActive={() => false}
        flyoutMode={false}
        hoverIntent={false}
        cx={cx}
        {...props}
      />
    </MemoryRouter>,
  );
}

describe("SidebarNavGroup", () => {
  it("is a single toggle button (no parent link, no separate chevron button)", () => {
    renderGroup();
    expect(screen.queryByRole("link", { name: "Clients" })).toBeNull();
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].className).toContain("row");
  });

  it("toggles the accordion when the row is clicked", () => {
    renderGroup();
    const row = screen.getByRole("button", { name: /Clients/ });
    expect(row).toHaveAttribute("aria-expanded", "false");
    // collapsed → children not tabbable
    expect(screen.getByRole("link", { name: "Waiting list" })).toHaveAttribute("tabindex", "-1");

    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Waiting list" })).not.toHaveAttribute("tabindex", "-1");

    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-expanded", "false");
  });

  it("defaults to open when a child route is active, and the user can still close it", () => {
    renderGroup({ isItemActive: (to) => to === "/agency/clients?view=waiting" });
    const row = screen.getByRole("button", { name: /Clients/ });
    expect(row).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Waiting list" })).toHaveAttribute("aria-current", "page");

    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-expanded", "false");
  });

  it("stays open when forceOpen is set even with no active child", () => {
    renderGroup({ forceOpen: true });
    expect(screen.getByRole("button", { name: /Clients/ })).toHaveAttribute("aria-expanded", "true");
  });

  it("does not fill the parent row when a child carries the active state (expanded)", () => {
    renderGroup({ isItemActive: (to) => to === "/agency/clients?view=waiting" });
    // shared selected style is the SidebarNavItem `selected` class hash — the
    // row keeps only the host classes when a visible child owns the highlight
    expect(screen.getByRole("button", { name: /Clients/ }).className).not.toMatch(/selected/i);
    expect(screen.getByRole("link", { name: "Waiting list" }).className).toMatch(/selected/i);
  });

  it("fills the parent row on a collapsed rail, where the active child is out of sight", () => {
    renderGroup({ flyoutMode: true, isItemActive: (to) => to === "/agency/clients?view=waiting" });
    expect(screen.getByRole("button", { name: /Clients/ }).className).toMatch(/selected/i);
  });

  describe("collapsed rail flyout", () => {
    it("opens on click and an outside click closes it", () => {
      renderGroup({ flyoutMode: true });
      const row = screen.getByRole("button", { name: /Clients/ });
      const child = screen.getByRole("link", { name: "Waiting list" });

      expect(child).toHaveAttribute("tabindex", "-1");
      fireEvent.click(row);
      expect(child).not.toHaveAttribute("tabindex", "-1");

      fireEvent.mouseDown(document.body);
      expect(child).toHaveAttribute("tabindex", "-1");
    });

    it("opens on hover / focus intent when hoverIntent is set", () => {
      const { container } = renderGroup({ flyoutMode: true, hoverIntent: true });
      const group = container.querySelector(".group") as HTMLElement;
      const child = screen.getByRole("link", { name: "Waiting list" });

      expect(child).toHaveAttribute("tabindex", "-1");
      fireEvent.mouseEnter(group);
      expect(child).not.toHaveAttribute("tabindex", "-1");
    });
  });
});
