import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ThreeWayToggle, { type ThreeWayOption } from "./ThreeWayToggle";

afterEach(cleanup);

const OPTIONS: readonly [ThreeWayOption<"light">, ThreeWayOption<"system">, ThreeWayOption<"dark">] = [
  { value: "light", label: "Light", icon: <span data-testid="i-light" /> },
  { value: "system", label: "Match device", icon: <span data-testid="i-system" /> },
  { value: "dark", label: "Dark", icon: <span data-testid="i-dark" /> },
];

describe("ThreeWayToggle", () => {
  it("renders one radio per option, labelled, inside a radiogroup", () => {
    render(<ThreeWayToggle ariaLabel="Appearance" options={OPTIONS} value="system" onChange={() => {}} />);
    expect(screen.getByRole("radiogroup", { name: "Appearance" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(screen.getByRole("radio", { name: "Match device" })).toBeInTheDocument();
  });

  it("marks the current value as checked and the others not", () => {
    render(<ThreeWayToggle ariaLabel="Appearance" options={OPTIONS} value="dark" onChange={() => {}} />);
    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Light" })).not.toBeChecked();
  });

  it("calls onChange with the option's value when a segment is clicked", () => {
    const onChange = vi.fn();
    render(<ThreeWayToggle ariaLabel="Appearance" options={OPTIONS} value="light" onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(onChange).toHaveBeenCalledWith("dark");
  });

  it("still selects position 0 visually when the value matches nothing", () => {
    // @ts-expect-error — deliberately passing an out-of-set value
    const { container } = render(<ThreeWayToggle ariaLabel="A" options={OPTIONS} value="nope" onChange={() => {}} />);
    expect(container.querySelector('[role="radiogroup"]')).toHaveStyle({ "--twt-index": "0" });
  });
});
