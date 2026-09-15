import type { ReactNode } from "react";

import { LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { cleanup, render, screen } from "@testing-library/react";
import dayjs from "dayjs";
import { afterEach, describe, expect, it, vi } from "vitest";

import DateInput from "./DateInput";

import styles from "./DateInput.module.scss";

afterEach(cleanup);

// DateInput's pickers need a LocalizationProvider ancestor — App.tsx supplies
// one for real usage, so tests stand one up too.
const withProvider = (ui: ReactNode) => (
  <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="en-gb">
    {ui}
  </LocalizationProvider>
);

// MUI X's sectioned field has no plain textbox role (it's a `role="group"` of
// per-unit spinbuttons — see DateInput.tsx's comment on `slotProps.field`),
// so these query the field's group and its hidden native input directly
// rather than by role/name.
const group = (container: HTMLElement) => container.querySelector('[role="group"]');
const hiddenValue = (container: HTMLElement) => container.querySelector('input[aria-hidden="true"]');

describe("DateInput", () => {
  it("shows the given label", () => {
    render(withProvider(<DateInput mode="date" value={null} onChange={vi.fn()} label="Start date" />));
    expect(screen.getByText("Start date")).toBeInTheDocument();
  });

  it("renders no label element when none is given", () => {
    render(withProvider(<DateInput mode="date" value={null} onChange={vi.fn()} ariaLabel="Start date" />));
    expect(screen.queryByText("Start date")).not.toBeInTheDocument();
  });

  it("formats the value per mode by default", () => {
    const value = dayjs("2026-03-05T14:30:00Z");
    const { container } = render(withProvider(<DateInput mode="date" value={value} onChange={vi.fn()} />));
    expect(hiddenValue(container)).toHaveValue("05 Mar 2026");
  });

  it("honours a custom format", () => {
    const value = dayjs("2026-03-05T14:30:00Z");
    const { container } = render(
      withProvider(
        <DateInput mode="date" value={value} onChange={vi.fn()} views={["year", "month"]} format="MMM YYYY" />,
      ),
    );
    expect(hiddenValue(container)).toHaveValue("Mar 2026");
  });

  it("keeps the field read-only so typing can't bypass the calendar", () => {
    const { container } = render(withProvider(<DateInput mode="date" value={null} onChange={vi.fn()} />));
    expect(group(container)).toHaveClass("Mui-readOnly");
  });

  it("disables the field when asked", () => {
    const { container } = render(withProvider(<DateInput mode="date" value={null} onChange={vi.fn()} disabled />));
    expect(group(container)).toHaveClass("Mui-disabled");
  });

  it("renders a time field for mode=time", () => {
    const value = dayjs("2026-03-05T14:30:00Z");
    const { container } = render(withProvider(<DateInput mode="time" value={value} onChange={vi.fn()} />));
    expect(hiddenValue(container)).toHaveValue("14:30");
  });

  it("renders a datetime field for mode=datetime", () => {
    const value = dayjs("2026-03-05T14:30:00Z");
    const { container } = render(withProvider(<DateInput mode="datetime" value={value} onChange={vi.fn()} />));
    expect(hiddenValue(container)).toHaveValue("05 Mar 2026, 14:30");
  });

  it("is not dense by default", () => {
    const { container } = render(withProvider(<DateInput mode="date" value={null} onChange={vi.fn()} />));
    expect(container.querySelector(`.${styles.wrapper}`)).not.toHaveClass(styles.dense);
  });

  it("applies the dense class when asked, for control bars that sit it next to shorter pill toggles", () => {
    const { container } = render(withProvider(<DateInput mode="date" value={null} onChange={vi.fn()} dense />));
    expect(container.querySelector(`.${styles.wrapper}`)).toHaveClass(styles.dense);
  });

  it("merges a caller className alongside its own wrapper class", () => {
    const { container } = render(
      withProvider(<DateInput mode="date" value={null} onChange={vi.fn()} className="extra" />),
    );
    const wrapper = container.querySelector(`.${styles.wrapper}`);
    expect(wrapper).toHaveClass("extra");
  });
});
