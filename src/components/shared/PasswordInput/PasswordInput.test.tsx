import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import PasswordInput from "./PasswordInput";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PasswordInput", () => {
  it("renders a masked input with a 'Show password' toggle by default", () => {
    const { container } = render(<PasswordInput id="pw" defaultValue="secret" />);
    const input = container.querySelector("input")!;
    expect(input).toHaveAttribute("type", "password");
    const toggle = screen.getByRole("button", { name: "Show password" });
    expect(toggle).toHaveAttribute("type", "button");
    expect(toggle).toHaveAttribute("aria-pressed", "false");
  });

  it("reveals and re-hides the value when the toggle is clicked", () => {
    const { container } = render(<PasswordInput id="pw" defaultValue="secret" />);
    const input = container.querySelector("input")!;

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(input).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Show password" })).toBeInTheDocument();
  });

  it("forwards native input props (id, className, placeholder) to the input", () => {
    const { container } = render(
      <PasswordInput id="new-pw" className="field-input" placeholder="••••••••" autoComplete="new-password" />,
    );
    const input = container.querySelector("input")!;
    expect(input).toHaveAttribute("id", "new-pw");
    expect(input).toHaveClass("field-input");
    expect(input).toHaveAttribute("placeholder", "••••••••");
    expect(input).toHaveAttribute("autocomplete", "new-password");
  });

  it("is controllable — fires onChange with typed input", () => {
    const onChange = vi.fn();
    const { container } = render(<PasswordInput value="" onChange={onChange} />);
    fireEvent.change(container.querySelector("input")!, { target: { value: "hunter2" } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("does not submit the surrounding form when the toggle is clicked", () => {
    const onSubmit = vi.fn((e) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <PasswordInput id="pw" />
      </form>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("keeps caller styles and adds room for the toggle", () => {
    const { container } = render(<PasswordInput style={{ color: "rebeccapurple" }} />);
    const input = container.querySelector("input")!;
    expect(input.style.color).toBe("rebeccapurple");
    expect(input.style.paddingRight).toBe("2.75rem");
  });
});
