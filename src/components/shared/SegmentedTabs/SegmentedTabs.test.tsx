import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import SegmentedTabs from "./SegmentedTabs";

afterEach(cleanup);

const TABS = [
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Past" },
  { value: "all", label: "All" },
] as const;

describe("SegmentedTabs", () => {
  it("renders a tab per entry inside a labelled tablist", () => {
    render(<SegmentedTabs tabs={TABS} value="upcoming" onChange={() => {}} ariaLabel="Scope" />);
    expect(screen.getByRole("tablist", { name: "Scope" })).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
  });

  it("marks the active tab selected and the rest not", () => {
    render(<SegmentedTabs tabs={TABS} value="past" onChange={() => {}} ariaLabel="Scope" />);
    expect(screen.getByRole("tab", { name: "Past" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Upcoming" })).toHaveAttribute("aria-selected", "false");
  });

  it("calls onChange with the tab's value when clicked", () => {
    const onChange = vi.fn();
    render(<SegmentedTabs tabs={TABS} value="upcoming" onChange={onChange} ariaLabel="Scope" />);
    fireEvent.click(screen.getByRole("tab", { name: "All" }));
    expect(onChange).toHaveBeenCalledWith("all");
  });
});
