import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import Modal from "./Modal";

afterEach(cleanup);

describe("Modal", () => {
  it("renders the title and children in a dialog", () => {
    render(
      <Modal title="Confirm delete" onClose={vi.fn()}>
        <p>Are you sure?</p>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("heading", { name: "Confirm delete" })).toBeInTheDocument();
    expect(screen.getByText("Are you sure?")).toBeInTheDocument();
  });

  it("renders the actions slot", () => {
    render(<Modal title="t" onClose={vi.fn()} actions={<button type="button">Delete</button>} />);
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("calls onClose from the close button", async () => {
    const onClose = vi.fn();
    render(<Modal title="t" onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Close modal" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on Escape", async () => {
    const onClose = vi.fn();
    render(<Modal title="t" onClose={onClose} />);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on a backdrop click, but not on a click inside the dialog", async () => {
    const onClose = vi.fn();
    render(
      <Modal title="t" onClose={onClose}>
        <p>body</p>
      </Modal>,
    );
    // click inside — no close
    await userEvent.click(screen.getByText("body"));
    expect(onClose).not.toHaveBeenCalled();

    // mousedown + click on the overlay itself — closes (matches the component's
    // mouseDownTarget === currentTarget guard)
    const overlay = screen.getByRole("presentation");
    await userEvent.pointer([
      { target: overlay, keys: "[MouseLeft>]" },
      { target: overlay, keys: "[/MouseLeft]" },
    ]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("portals into document.body", () => {
    const { container } = render(<Modal title="t" onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
    expect(document.body.querySelector('[role="dialog"]')).toBeInTheDocument();
  });
});
