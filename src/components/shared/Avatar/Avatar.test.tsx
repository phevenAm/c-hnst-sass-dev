import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import Avatar from "./Avatar";

afterEach(cleanup);

describe("Avatar", () => {
  it("renders the image when imageSrc is provided", () => {
    render(<Avatar name="Ada Lovelace" imageSrc="https://example.com/a.jpg" />);
    const img = screen.getByRole("img", { hidden: true });
    expect(img).toHaveAttribute("src", "https://example.com/a.jpg");
    expect(screen.queryByText("AL")).not.toBeInTheDocument();
  });

  it("renders fallback initials when no imageSrc", () => {
    render(<Avatar name="Ada Lovelace" />);
    expect(screen.getByText("AL")).toBeInTheDocument();
    expect(screen.queryByRole("img", { hidden: true })).not.toBeInTheDocument();
  });

  it("falls back to initials if the image fails to load", () => {
    render(<Avatar name="Grace Hopper" imageSrc="https://example.com/broken.jpg" />);
    fireEvent.error(screen.getByRole("img", { hidden: true }));
    expect(screen.getByText("GH")).toBeInTheDocument();
  });

  it("sizes the element from the size prop", () => {
    const { container } = render(<Avatar name="X" size={64} />);
    expect(container.firstChild).toHaveStyle({ width: "64px", height: "64px" });
  });
});
