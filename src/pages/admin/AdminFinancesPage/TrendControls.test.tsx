import { LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import dayjs from "dayjs";
import { afterEach, describe, expect, it, vi } from "vitest";

import TrendControls from "./TrendControls";
import type { TrendControlsState } from "./useTrendControls";

afterEach(cleanup);

function makeState(overrides: Partial<TrendControlsState> = {}): TrendControlsState {
  return {
    unit: "month",
    from: dayjs("2026-04-01"),
    to: dayjs("2026-09-01"),
    chartType: "bar",
    setUnit: vi.fn(),
    setFrom: vi.fn(),
    setTo: vi.fn(),
    setChartType: vi.fn(),
    ...overrides,
  };
}

const withProvider = (ui: React.ReactNode) => (
  <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="en-gb">
    {ui}
  </LocalizationProvider>
);

describe("TrendControls", () => {
  it("labels each control group", () => {
    render(withProvider(<TrendControls state={makeState()} />));
    expect(screen.getByText("Granularity")).toBeInTheDocument();
    expect(screen.getByText("Custom range")).toBeInTheDocument();
    expect(screen.getByText("Chart")).toBeInTheDocument();
  });

  it("reflects the current unit and chart type as the active tab", () => {
    render(withProvider(<TrendControls state={makeState({ unit: "week", chartType: "line" })} />));
    expect(screen.getByRole("tab", { name: "Weeks" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Line" })).toHaveAttribute("aria-selected", "true");
  });

  it("calls setUnit when a granularity tab is clicked", () => {
    const state = makeState();
    render(withProvider(<TrendControls state={state} />));
    fireEvent.click(screen.getByRole("tab", { name: "Years" }));
    expect(state.setUnit).toHaveBeenCalledWith("year");
  });

  it("calls setChartType when the bar/line tab is clicked", () => {
    const state = makeState();
    render(withProvider(<TrendControls state={state} />));
    fireEvent.click(screen.getByRole("tab", { name: "Line" }));
    expect(state.setChartType).toHaveBeenCalledWith("line");
  });

  it("hides the chart-type group when hideChartType is set", () => {
    render(withProvider(<TrendControls state={makeState()} hideChartType />));
    expect(screen.queryByText("Chart")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Line" })).not.toBeInTheDocument();
  });
});
