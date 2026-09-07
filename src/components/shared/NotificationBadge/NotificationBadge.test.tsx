import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import NotificationBadge from "./NotificationBadge";

describe("NotificationBadge", () => {
  it("renders a number as a circular badge for short content", () => {
    render(<NotificationBadge number={2} />);

    const badge = screen.getByRole("status", { name: "2 notifications" });
    expect(badge).toHaveTextContent("2");
    expect(badge.className).toMatch(/circle/);
    expect(badge.className).not.toMatch(/pill/);
  });

  it("renders longer text as a pill", () => {
    render(<NotificationBadge text="New" color="#123456" />);

    const badge = screen.getByRole("status", { name: "New notifications" });
    expect(badge).toHaveTextContent("New");
    expect(badge.className).toMatch(/pill/);
    expect(badge).toHaveStyle({ backgroundColor: "rgb(18, 52, 86)" });
  });

  it("prefers text when both text and number are supplied", () => {
    render(<NotificationBadge number={4} text="!" />);

    expect(screen.getByRole("status", { name: "! notifications" })).toHaveTextContent("!");
  });

  it("renders nothing when no content is supplied", () => {
    const { container } = render(<NotificationBadge />);

    expect(container).toBeEmptyDOMElement();
  });
});
