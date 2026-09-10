import DateInput from "@components/shared/DateInput/DateInput";
import SegmentedTabs, { type SegmentedTab } from "@components/shared/SegmentedTabs/SegmentedTabs";

import type { TrendUnit } from "./financeOverview";
import type { TrendChartType, TrendControlsState } from "./useTrendControls";

import styles from "./TrendControls.module.scss";

const UNIT_TABS: SegmentedTab<TrendUnit>[] = [
  { value: "week", label: "Weeks" },
  { value: "month", label: "Months" },
  { value: "year", label: "Years" },
];

const TYPE_TABS: SegmentedTab<TrendChartType>[] = [
  { value: "bar", label: "Bars" },
  { value: "line", label: "Line" },
];

type Props = {
  state: TrendControlsState;
  /** Hide the bar/line switch (e.g. when the caller only ever shows one). */
  hideChartType?: boolean;
};

/**
 * The control row above a finance trend chart: granularity, a from–month /
 * to–month range and (optionally) a bar-vs-line switch. State lives in
 * `useTrendControls`.
 */
export default function TrendControls({ state, hideChartType }: Props) {
  const { unit, from, to, chartType, setUnit, setFrom, setTo, setChartType } = state;

  return (
    <div className={styles.row}>
      <SegmentedTabs tabs={UNIT_TABS} value={unit} onChange={setUnit} ariaLabel="Chart granularity" />

      <div className={styles.range}>
        <DateInput
          mode="date"
          views={["year", "month"]}
          openTo="month"
          format="MMM YYYY"
          value={from}
          onChange={(d) => d && setFrom(d)}
          ariaLabel="Range start month"
        />
        <span className={styles.dash}>–</span>
        <DateInput
          mode="date"
          views={["year", "month"]}
          openTo="month"
          format="MMM YYYY"
          value={to}
          onChange={(d) => d && setTo(d)}
          ariaLabel="Range end month"
        />
      </div>

      {!hideChartType && (
        <SegmentedTabs tabs={TYPE_TABS} value={chartType} onChange={setChartType} ariaLabel="Chart style" />
      )}
    </div>
  );
}
