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
  button: "button",
  link: "link",
  toggle: "toggle",
  icon: "icon",
  label: "label",
  chevron: "chevron",
  chevronOpen: "chevronOpen",
  children: "children",
  childrenOpen: "childrenOpen",
  childLink: "childLink",
  childActive: "childActive",
};

const items = [{ to: "/agency/clients?view=waiting", label: "Waiting list", Icon: Dot }];

function renderGroup(props: Partial<React.ComponentProps<typeof SidebarNavGroup>> = {}) {
  return render(
    <MemoryRouter>
      <SidebarNavGroup
        label="Clients"
        Icon={Dot}
        items={items}
        to="/agency/clients?view=active"
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
  it("renders the parent link and its children, and toggles the accordion via the chevron", () => {
    renderGroup();
    expect(screen.getByRole("link", { name: "Clients" })).toHaveAttribute("href", "/agency/clients?view=active");

    const toggle = screen.getByRole("button", { name: "Expand Clients" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    // collapsed → child not tabbable
    expect(screen.getByRole("link", { name: "Waiting list" })).toHaveAttribute("tabindex", "-1");

    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Collapse Clients" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Waiting list" })).not.toHaveAttribute("tabindex", "-1");
  });

  it("stays open when forceOpen is set (a child route is active)", () => {
    renderGroup({ forceOpen: true, parentActive: false });
    expect(screen.getByRole("button", { name: "Collapse Clients" })).toHaveAttribute("aria-expanded", "true");
  });

  it("marks the active child current, which drives the shared selected style", () => {
    renderGroup({ forceOpen: true, isItemActive: (to) => to === "/agency/clients?view=waiting" });
    expect(screen.getByRole("link", { name: "Waiting list" })).toHaveAttribute("aria-current", "page");
  });

  it("hover opens the collapsed flyout (hoverIntent + flyoutMode) and an outside click closes it", () => {
    const { container } = renderGroup({ flyoutMode: true, hoverIntent: true });
    const group = container.querySelector(".group") as HTMLElement;
    const child = screen.getByRole("link", { name: "Waiting list" });

    // closed → child not tabbable, chevron collapsed
    expect(child).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("button", { name: "Expand Clients" })).toBeInTheDocument();

    fireEvent.mouseEnter(group);
    expect(child).not.toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("button", { name: "Collapse Clients" })).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(child).toHaveAttribute("tabindex", "-1");
  });

  it("renders a single toggle button (no separate chevron) when it has no `to`", () => {
    renderGroup({ to: undefined });
    expect(screen.queryByRole("link", { name: "Clients" })).toBeNull();
    const btn = screen.getByRole("button", { name: /Clients/ });
    expect(btn.className).toContain("button");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
  });
});
