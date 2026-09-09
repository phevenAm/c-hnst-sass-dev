import { MemoryRouter } from "react-router-dom";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import SidebarNavItem, { type SidebarNavItemClasses } from "./SidebarNavItem";

afterEach(cleanup);

const Dot = () => <svg aria-hidden />;
const cx: SidebarNavItemClasses = { link: "hostLink", icon: "hostIcon", label: "hostLabel" };

function renderItem(props: Partial<React.ComponentProps<typeof SidebarNavItem>> = {}, path = "/other") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SidebarNavItem to="/agency/sessions" label="Sessions" Icon={Dot} cx={cx} {...props} />
    </MemoryRouter>,
  );
}

describe("SidebarNavItem", () => {
  it("renders a NavLink with the host's link class and the icon + label", () => {
    renderItem();
    const link = screen.getByRole("link", { name: "Sessions" });
    expect(link).toHaveAttribute("href", "/agency/sessions");
    expect(link.className).toContain("hostLink");
    expect(link).not.toHaveAttribute("aria-current");
  });

  it("marks itself current when the route matches (drives the shared selected style)", () => {
    renderItem({}, "/agency/sessions");
    expect(screen.getByRole("link", { name: "Sessions" })).toHaveAttribute("aria-current", "page");
  });

  it("respects `end` for exact matching", () => {
    renderItem({ to: "/agency", end: true }, "/agency/sessions");
    expect(screen.getByRole("link", { name: "Sessions" })).not.toHaveAttribute("aria-current");
  });

  it("shows a title only when showTitle is set (collapsed rail)", () => {
    renderItem({ showTitle: true });
    expect(screen.getByRole("link", { name: "Sessions" })).toHaveAttribute("title", "Sessions");
  });

  it("passes an accent through as the selected-colour CSS custom properties", () => {
    renderItem({ accent: ["var(--accent-subtle)", "var(--accent-dark)"] });
    const link = screen.getByRole("link", { name: "Sessions" });
    expect(link.style.getPropertyValue("--nav-selected-bg")).toBe("var(--accent-subtle)");
    expect(link.style.getPropertyValue("--nav-selected-fg")).toBe("var(--accent-dark)");
  });
});
