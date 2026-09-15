import { useState } from "react";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import Card from "@components/shared/Card/Card";
import { EyeIcon, EyeOffIcon } from "@components/shared/Icons/Icons";

import { useInterfacePrefs } from "@/context/InterfacePrefsContext";
import type { TrendPoint } from "../../dashboardUtils";

import styles from "./TrendChart.module.scss";

const identity = (v: number) => String(v);

// Round the axis up to a "nice" ceiling and hand back evenly-spaced round
// ticks, so a max of ~2050 reads as 0 / 750 / 1500 / 2250 rather than
// Recharts' auto 0 / 550 / 1100 / 1650 / 2200.
function niceStep(rough: number): number {
  const mag = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / mag;
  const factor = [1, 2, 2.5, 5, 10].find((f) => norm <= f) ?? 10;
  return factor * mag;
}

function niceAxis(rawMax: number, count = 4): { max: number; ticks: number[] } {
  if (rawMax <= 0) return { max: 1, ticks: [0, 1] };
  const step = niceStep(rawMax / count);
  const max = Math.ceil(rawMax / step) * step;
  const ticks: number[] = [];
  for (let t = 0; t <= max + step / 2; t += step) ticks.push(Math.round(t * 100) / 100);
  return { max, ticks };
}

type TooltipProps = {
  active?: boolean;
  label?: string;
  payload?: { value: number }[];
  valueFormatter: (v: number) => string;
};

const TrendTooltip = ({ active, label, payload, valueFormatter }: TooltipProps) => {
  if (!active || !payload?.length) return null;
  return (
    <div className={styles.tooltip}>
      <span className={styles.tooltipLabel}>{label}</span>
      <strong>{valueFormatter(payload[0].value)}</strong>
    </div>
  );
};

type MultiTooltipProps = {
  active?: boolean;
  label?: string;
  payload?: { value: number; name: string; color: string; dataKey: string }[];
  valueFormatter: (v: number) => string;
  series: TrendSeries[];
};

// Exported for direct unit testing — a real hover interaction never reaches
// this in jsdom since Recharts' ResponsiveContainer needs a real ResizeObserver
// to lay out at nonzero size (see src/test/setupTests.js's no-op polyfill).
export const MultiTooltip = ({ active, label, payload, valueFormatter, series }: MultiTooltipProps) => {
  if (!active || !payload?.length) return null;
  const formatterFor = (dataKey: string) => series.find((s) => s.key === dataKey)?.valueFormatter ?? valueFormatter;
  return (
    <div className={styles.tooltip}>
      <span className={styles.tooltipLabel}>{label}</span>
      {payload.map((p) => (
        <span key={p.dataKey} className={styles.tooltipRow}>
          <span className={styles.tooltipDot} style={{ background: p.color }} />
          {p.name}: <strong>{formatterFor(p.dataKey)(p.value)}</strong>
        </span>
      ))}
    </div>
  );
};

/** One line/bar on a multi-series TrendChart. */
export type TrendSeries = {
  /** Key on each data point holding this series' value. */
  key: string;
  name: string;
  color: string;
  /** Defaults to the chart's `type`. */
  kind?: "bar" | "line";
  /** Dashed stroke — line only (e.g. money owed / forecast). */
  dashed?: boolean;
  /** Which y-axis this series scales against — e.g. a session count next to
   *  money needs its own axis rather than being flattened near zero (or
   *  forcing money onto a 0–10 scale) by sharing one. Defaults to "left". */
  axis?: "left" | "right";
  /** Overrides the chart's `valueFormatter` for just this series' tooltip row
   *  — needed once series on different axes measure different things. */
  valueFormatter?: (v: number) => string;
};

interface TrendChartProps {
  title: string;
  /** Single-series: `{ label, value }[]`. Multi-series (with `series`): `{ label, [key]: number }[]`. */
  data: TrendPoint[] | Array<Record<string, string | number>>;
  type?: "bar" | "line";
  color?: string;
  /** Formats the value in the tooltip (e.g. money or "7.4/10"). */
  valueFormatter?: (v: number) => string;
  yDomain?: [number, number];
  /** When given, renders one bar/line per entry over shared `{ label, ... }` points. */
  series?: TrendSeries[];
  height?: number;
  /** Short label for the left y-axis (e.g. "£") — multi-series only. */
  leftAxisLabel?: string;
  /** Short label for the right y-axis (e.g. "Sessions") — multi-series only, ignored with no right-axis series. */
  rightAxisLabel?: string;
  /** Multi-series only. Adds a click-to-hide eye toggle to each legend item;
   *  axes/domains recalculate from whichever series are still visible, and
   *  an axis with nothing left on it drops out entirely (see rightSeries).
   *  Leave off for a caller that already has its own series-visibility
   *  control outside the chart. */
  toggleableLegend?: boolean;
  /** Controls the hidden-series set from outside instead of the chart's own
   *  internal (reload-losing) state — pass both together so a caller can
   *  persist the choice (e.g. to practice_settings) and restore it on load.
   *  Falls back to internal state when either is omitted. */
  hiddenKeys?: Set<string>;
  onToggleKey?: (key: string) => void;
}

// A row of colour-swatch + name for every series — the tooltip already shows
// this on hover, but "hover to find out what a colour means" isn't a legend.
// Line series get a short dash swatch instead of a dot, matching how they
// actually render on the chart.
//
// `onToggle` turns each item into a real button — a filled pill with an eye
// icon — so a busy multi-series chart can be thinned out to just the one or
// two lines someone actually wants to compare, instead of everything at
// once being the only option. Omitting `onToggle` (the Finance page, which
// already has its own external "Series shown" toggles) keeps the legend as
// a plain, non-interactive colour key.
function TrendLegend({
  series,
  hiddenKeys,
  onToggle,
}: {
  series: TrendSeries[];
  hiddenKeys?: Set<string>;
  onToggle?: (key: string) => void;
}) {
  return (
    <ul className={styles.legend}>
      {series.map((s) => {
        const swatch =
          (s.kind ?? "bar") === "line" ? (
            <span className={styles.legendSwatchLine} style={{ background: s.color, opacity: s.dashed ? 0.6 : 1 }} />
          ) : (
            <span className={styles.legendSwatchDot} style={{ background: s.color }} />
          );

        if (!onToggle) {
          return (
            <li key={s.key} className={styles.legendItem}>
              {swatch}
              {s.name}
            </li>
          );
        }

        const isHidden = hiddenKeys?.has(s.key) ?? false;
        return (
          <li key={s.key}>
            <button
              type="button"
              className={`${styles.legendItem} ${styles.legendItemButton} ${isHidden ? styles.legendItemOff : ""}`}
              onClick={() => onToggle(s.key)}
              aria-pressed={!isHidden}
            >
              {swatch}
              {s.name}
              <span className={styles.legendEye} aria-hidden="true">
                {isHidden ? <EyeOffIcon /> : <EyeIcon />}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// A small trend card: bar or line chart over a set of {label, value} points.
// Reused on the dashboard for revenue, session volume and wellbeing. Pass
// `series` to overlay several measures (income vs outgoings vs owed) on one card.
export default function TrendChart({
  title,
  data,
  type = "bar",
  color = "#4a665b",
  valueFormatter = identity,
  yDomain,
  series,
  height = 180,
  leftAxisLabel,
  rightAxisLabel,
  toggleableLegend,
  hiddenKeys: hiddenKeysProp,
  onToggleKey: onToggleKeyProp,
}: TrendChartProps) {
  const { reduceMotion } = useInterfacePrefs();
  // Bolder + a size up from the original 11px/var(--text-muted) — axis
  // ticks were reading as barely-there against the chart itself.
  const axis = { fill: "var(--text-secondary)", fontSize: 12, fontWeight: 500 };

  const [internalHiddenKeys, setInternalHiddenKeys] = useState<Set<string>>(new Set());
  const hiddenKeys = hiddenKeysProp ?? internalHiddenKeys;
  const toggleSeriesKey =
    onToggleKeyProp ??
    ((key: string) =>
      setInternalHiddenKeys((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      }));

  if (series && series.length > 0) {
    const rows = data as Array<Record<string, string | number>>;
    const valueAt = (d: Record<string, string | number>, k: string) => Number(d[k]) || 0;
    // "Any data at all" stays based on the full series list — hiding every
    // series shouldn't flip the card over to the same "No data yet." empty
    // state a genuinely empty practice sees; see allHidden below for that.
    const hasData = rows.some((d) => series.some((s) => valueAt(d, s.key) > 0));

    const visibleSeries = toggleableLegend ? series.filter((s) => !hiddenKeys.has(s.key)) : series;
    const allHidden = toggleableLegend && visibleSeries.length === 0;

    const leftSeries = visibleSeries.filter((s) => (s.axis ?? "left") === "left");
    const rightSeries = visibleSeries.filter((s) => s.axis === "right");
    const niceFor = (ss: TrendSeries[]) =>
      yDomain ? null : niceAxis(Math.max(0, ...rows.flatMap((d) => ss.map((s) => valueAt(d, s.key)))));
    const niceLeft = niceFor(leftSeries);
    const niceRight = rightSeries.length > 0 ? niceFor(rightSeries) : null;

    // Switching every series to "bar" mode (the chart-level type toggle)
    // would otherwise group same-axis bars side by side, shrinking each one
    // and defeating the point of overlaying several measures on one chart.
    // Overlapping them instead — barGap collapses their slots onto each
    // other, reduced fillOpacity plus a thin card-colour ring keeps every
    // one readable through the others — reads as "3 measures, one chart"
    // the way the line mode already does.
    const barSeriesCount = visibleSeries.filter((s) => (s.kind ?? type) === "bar").length;
    const overlapBars = barSeriesCount > 1;

    let emptyMessage: string | null = null;
    if (!hasData) emptyMessage = "No data yet.";
    else if (allHidden) emptyMessage = "Every series is hidden — tap one in the key below to show it again.";

    return (
      <Card className={styles.card}>
        <h3 className={styles.title}>{title}</h3>
        {emptyMessage ? (
          <p className={styles.empty}>{emptyMessage}</p>
        ) : (
          <div aria-hidden="true">
            <ResponsiveContainer width="100%" height={height}>
              <ComposedChart
                data={rows}
                margin={{ top: 8, right: rightSeries.length > 0 ? 0 : 8, left: 0, bottom: 0 }}
                barGap={overlapBars ? "-100%" : undefined}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} />
                <YAxis
                  yAxisId="left"
                  tick={axis}
                  axisLine={false}
                  tickLine={false}
                  width={leftAxisLabel ? 52 : 40}
                  domain={niceLeft ? [0, niceLeft.max] : yDomain}
                  ticks={niceLeft?.ticks}
                  allowDecimals={false}
                  label={
                    leftAxisLabel
                      ? { value: leftAxisLabel, angle: -90, position: "insideLeft", style: axis, dy: 20 }
                      : undefined
                  }
                />
                {rightSeries.length > 0 && (
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={axis}
                    axisLine={false}
                    tickLine={false}
                    width={rightAxisLabel ? 44 : 32}
                    domain={niceRight ? [0, niceRight.max] : undefined}
                    ticks={niceRight?.ticks}
                    allowDecimals={false}
                    label={
                      rightAxisLabel
                        ? { value: rightAxisLabel, angle: 90, position: "insideRight", style: axis, dy: -20 }
                        : undefined
                    }
                  />
                )}
                <Tooltip
                  cursor={{ fill: "var(--bg-muted)" }}
                  content={<MultiTooltip valueFormatter={valueFormatter} series={series} />}
                />
                {visibleSeries.map((s) =>
                  (s.kind ?? type) === "bar" ? (
                    <Bar
                      key={s.key}
                      yAxisId={s.axis ?? "left"}
                      dataKey={s.key}
                      name={s.name}
                      fill={s.color}
                      fillOpacity={overlapBars ? 0.7 : 1}
                      stroke={overlapBars ? "var(--bg-card)" : undefined}
                      strokeWidth={overlapBars ? 1 : 0}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={38}
                      isAnimationActive={!reduceMotion}
                    />
                  ) : (
                    <Line
                      key={s.key}
                      yAxisId={s.axis ?? "left"}
                      type="monotone"
                      dataKey={s.key}
                      name={s.name}
                      stroke={s.color}
                      strokeWidth={2.5}
                      strokeDasharray={s.dashed ? "6 4" : undefined}
                      dot={{ r: 3, fill: s.color, strokeWidth: 0 }}
                      activeDot={{ r: 5 }}
                      isAnimationActive={!reduceMotion}
                    />
                  ),
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
        {hasData && (
          <TrendLegend
            series={series}
            hiddenKeys={toggleableLegend ? hiddenKeys : undefined}
            onToggle={toggleableLegend ? toggleSeriesKey : undefined}
          />
        )}
      </Card>
    );
  }

  const points = data as TrendPoint[];
  const hasData = points.some((d) => d.value > 0);
  // Rounded y-axis (unless the caller pinned an explicit domain, e.g. the 0–10
  // wellbeing chart).
  const nice = yDomain ? null : niceAxis(Math.max(...points.map((d) => d.value), 0));

  return (
    <Card className={styles.card}>
      <h3 className={styles.title}>{title}</h3>
      {!hasData ? (
        <p className={styles.empty}>No data yet.</p>
      ) : (
        <div aria-hidden="true">
          <ResponsiveContainer width="100%" height={height}>
            {type === "bar" ? (
              <BarChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} />
                <YAxis
                  tick={axis}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                  domain={nice ? [0, nice.max] : yDomain}
                  ticks={nice?.ticks}
                  allowDecimals={false}
                />
                <Tooltip
                  cursor={{ fill: "var(--bg-muted)" }}
                  content={<TrendTooltip valueFormatter={valueFormatter} />}
                />
                <Bar
                  dataKey="value"
                  fill={color}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={38}
                  isAnimationActive={!reduceMotion}
                />
              </BarChart>
            ) : (
              <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} />
                <YAxis tick={axis} axisLine={false} tickLine={false} width={40} domain={yDomain} />
                <Tooltip content={<TrendTooltip valueFormatter={valueFormatter} />} />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={color}
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: color, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={!reduceMotion}
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
