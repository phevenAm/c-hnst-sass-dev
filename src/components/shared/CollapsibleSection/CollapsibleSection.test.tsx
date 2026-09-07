import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import CollapsibleSection from "./CollapsibleSection";

describe("CollapsibleSection", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("reopens when forceOpen becomes true", () => {
    const { rerender } = render(
      <CollapsibleSection title="Needs attention" storageKey="test:attention">
        <p>Urgent item</p>
      </CollapsibleSection>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Needs attention" }));
    expect(screen.queryByText("Urgent item")).not.toBeInTheDocument();

    rerender(
      <CollapsibleSection title="Needs attention" storageKey="test:attention" forceOpen>
        <p>Urgent item</p>
      </CollapsibleSection>,
    );

    expect(screen.getByText("Urgent item")).toBeInTheDocument();
  });

  it("respects a saved collapsed state without forceOpen", () => {
    window.localStorage.setItem("test:ordinary", "0");

    render(
      <CollapsibleSection title="Ordinary section" storageKey="test:ordinary">
        <p>Details</p>
      </CollapsibleSection>,
    );

    expect(screen.queryByText("Details")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ordinary section" })).toHaveAttribute("aria-expanded", "false");
  });
});
