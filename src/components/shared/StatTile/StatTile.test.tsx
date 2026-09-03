import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import StatTile from "./StatTile";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("StatTile", () => {
  it("renders the label, value and optional sub", () => {
    render(<StatTile label="Income" value="£125.00" sub="Last 30 days" />);
    expect(screen.getByText("Income")).toBeInTheDocument();
    expect(screen.getByText("£125.00")).toBeInTheDocument();
    expect(screen.getByText("Last 30 days")).toBeInTheDocument();
  });

  it("omits the sub node when it is empty or undefined", () => {
    const { container } = render(<StatTile label="Net" value="£0.00" />);
    // label + value only — no third line
    expect(container.querySelectorAll("span")).toHaveLength(2);
  });

  it("is a plain div (not a button) with no onClick", () => {
    render(<StatTile label="Outgoings" value="£0.00" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("becomes a button and fires onClick when handler is given", () => {
    const onClick = vi.fn();
    render(<StatTile label="Outstanding" value="£60.00" onClick={onClick} />);
    const btn = screen.getByRole("button");
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
