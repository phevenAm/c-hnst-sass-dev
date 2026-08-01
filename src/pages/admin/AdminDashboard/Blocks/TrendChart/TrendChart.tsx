import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import Card from "@components/shared/Card/Card";

import type { TrendPoint } from "../../dashboardUtils";

import styles from "./TrendChart.module.scss";

const identity = (v: number) => String(v);

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
  color = "#2d7264",
  valueFormatter = identity,
  yDomain,
}: TrendChartProps) {
  const hasData = data.some((d) => d.value > 0);
  const axis = { fill: "var(--text-muted)", fontSize: 11 };

  return (
    <Card className={styles.card}>
      <h3 className={styles.title}>{title}</h3>
      {!hasData ? (
        <p className={styles.empty}>No data yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          {type === "bar" ? (
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} />
              <YAxis tick={axis} axisLine={false} tickLine={false} width={40} domain={yDomain} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: "var(--bg-muted)" }}
                content={<TrendTooltip valueFormatter={valueFormatter} />}
              />
              <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} maxBarSize={38} />
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
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      )}
    </Card>
  );
}
