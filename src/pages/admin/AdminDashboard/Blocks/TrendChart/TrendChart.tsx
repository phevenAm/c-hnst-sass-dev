import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import Card from "@components/shared/Card/Card";

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

interface TrendChartProps {
  title: string;
  data: TrendPoint[];
  type?: "bar" | "line";
  color?: string;
  /** Formats the value in the tooltip (e.g. money or "7.4/10"). */
  valueFormatter?: (v: number) => string;
  yDomain?: [number, number];
}

// A small trend card: bar or line chart over a set of {label, value} points.
// Reused on the dashboard for revenue, session volume and wellbeing.
export default function TrendChart({
  title,
  data,
  type = "bar",
  color = "#4a665b",
  valueFormatter = identity,
  yDomain,
}: TrendChartProps) {
  const { reduceMotion } = useInterfacePrefs();
  const hasData = data.some((d) => d.value > 0);
  const axis = { fill: "var(--text-muted)", fontSize: 11 };
  // Rounded y-axis (unless the caller pinned an explicit domain, e.g. the 0–10
  // wellbeing chart).
  const nice = yDomain ? null : niceAxis(Math.max(...data.map((d) => d.value), 0));

  return (
    <Card className={styles.card}>
      <h3 className={styles.title}>{title}</h3>
      {!hasData ? (
        <p className={styles.empty}>No data yet.</p>
      ) : (
        <div aria-hidden="true">
          <ResponsiveContainer width="100%" height={180}>
            {type === "bar" ? (
              <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
              <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
