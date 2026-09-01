import { cleanup, render, screen } from "@testing-library/react";
import dayjs from "dayjs";
import { afterEach, describe, expect, it } from "vitest";

import { HeaderCell } from "./SchedulerCalendar";

afterEach(cleanup);

describe("HeaderCell", () => {
  it("renders the weekday name over the date number", () => {
    const date = new Date("2026-04-20T00:00:00"); // a Monday
    render(<HeaderCell date={date} label="ignored" />);

    expect(screen.getByText("Mon")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
  });

  it("marks today's date with the isToday pill class, and only today", () => {
    render(
      <>
        <HeaderCell date={new Date()} label="x" />
        <HeaderCell date={dayjs().add(1, "day").toDate()} label="x" />
      </>,
    );

    const todayNum = screen.getByText(dayjs().format("D"));
    expect(todayNum.className).toMatch(/isToday/);

    const tomorrowNum = screen.getByText(dayjs().add(1, "day").format("D"));
    expect(tomorrowNum.className).not.toMatch(/isToday/);
  });

  it("falls back to RBC's preformatted label when no date is given", () => {
    render(<HeaderCell label="Wed 22" />);
    expect(screen.getByText("Wed 22")).toBeInTheDocument();
    expect(screen.queryByText("22")).not.toBeInTheDocument();
  });

  it("uses a role-free span so it doesn't trip the columnheader/row axe rule", () => {
    const { container } = render(<HeaderCell date={new Date("2026-04-20T00:00:00")} label="x" />);
    expect(container.querySelector("[role]")).toBeNull();
    expect(container.firstElementChild?.tagName).toBe("SPAN");
  });
});
