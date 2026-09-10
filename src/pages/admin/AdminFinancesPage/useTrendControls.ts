import { useCallback, useMemo, useState } from "react";

import type { Dayjs } from "dayjs";

import { rangeForUnit, type TrendUnit } from "./financeOverview";

export type TrendChartType = "bar" | "line";

export type TrendControlsState = {
  unit: TrendUnit;
  from: Dayjs;
  to: Dayjs;
  chartType: TrendChartType;
  setUnit: (unit: TrendUnit) => void;
  setFrom: (d: Dayjs) => void;
  setTo: (d: Dayjs) => void;
  setChartType: (t: TrendChartType) => void;
};

/**
 * Owns the state behind <TrendControls> — the granularity (week/month/year),
 * the [from, to] range and the bar/line choice — for a finance trend chart.
 * Changing the unit snaps the range back to a sensible span for that unit.
 */
export function useTrendControls(defaultUnit: TrendUnit = "month"): TrendControlsState {
  const [unit, setUnitState] = useState<TrendUnit>(defaultUnit);
  const [range, setRange] = useState(() => rangeForUnit(defaultUnit));
  const [chartType, setChartType] = useState<TrendChartType>("bar");

  const setUnit = useCallback((next: TrendUnit) => {
    setUnitState(next);
    setRange(rangeForUnit(next));
  }, []);

  const setFrom = useCallback((d: Dayjs) => setRange((r) => ({ ...r, from: d })), []);
  const setTo = useCallback((d: Dayjs) => setRange((r) => ({ ...r, to: d })), []);

  return useMemo(
    () => ({ unit, from: range.from, to: range.to, chartType, setUnit, setFrom, setTo, setChartType }),
    [unit, range.from, range.to, chartType, setUnit, setFrom, setTo],
  );
}
