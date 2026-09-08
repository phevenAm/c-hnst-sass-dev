import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { afterEach, describe, expect, it, vi } from "vitest";

import Card from "./Card";

afterEach(cleanup);

describe("Card", () => {
  it("renders its children", () => {
    render(
      <Card>
        <p>inside the card</p>
      </Card>,
    );
    expect(screen.getByText("inside the card")).toBeInTheDocument();
  });

  it("is a plain container (no button role) without onClick", () => {
    render(<Card>plain</Card>);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("becomes a keyboard-operable button when onClick is given", async () => {
    const onClick = vi.fn();
    render(<Card onClick={onClick}>clickable</Card>);
    const card = screen.getByRole("button", { name: "clickable" });
    expect(card).toHaveAttribute("tabindex", "0");

    await userEvent.click(card);
    expect(onClick).toHaveBeenCalledTimes(1);

    card.focus();
    await userEvent.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("merges a passed className with its own", () => {
    const { container } = render(<Card className="extra">x</Card>);
    expect((container.firstChild as HTMLElement).className).toMatch(/extra/);
  });

  it("has no accessibility issues", async () => {
    const { container } = render(
      <Card>
        <img src="photo.jpg" alt="i am alt text" />
      </Card>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
