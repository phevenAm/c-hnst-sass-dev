import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import Card from "../Card/Card";

import styles from "./DonutChart.module.scss";

export type DonutSlice = { name: string; value: number; color: string };

const DonutTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { name: string; value: number; payload: DonutSlice }[];
}) => {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  return (
    <div className={styles.tooltip}>
      <span className={styles.tooltipDot} style={{ background: entry.payload.color }} />
      {entry.name}: <strong>{entry.value}</strong>
    </div>
  );
};

interface DonutChartProps {
  title: string;
  slices: DonutSlice[];
  /** Big value shown in the centre of the ring (e.g. "72%" or "£120.00"). */
  centerValue: string;
  /** Small caption under the centre value. */
  centerLabel: string;
}

// A donut chart in a card: a filled ring from `slices`, a big value in the
// hole, and a full legend below (shows every slice, including zero-value ones).
// Purely presentational — the caller supplies the slice data and centre text.
export default function DonutChart({ title, slices, centerValue, centerLabel }: DonutChartProps) {
  const data = slices.filter((s) => s.value > 0);
  const total = slices.reduce((sum, s) => sum + s.value, 0);

  return (
    <Card className={styles.card}>
      <h3 className={styles.title}>{title}</h3>
      {total === 0 ? (
        <p className={styles.empty}>No data yet.</p>
      ) : (
        <>
          <div className={styles.wrap}>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={58}
                  outerRadius={80}
                  paddingAngle={2}
                  stroke="none"
                  startAngle={90}
                  endAngle={-270}
                >
                  {data.map((s) => (
                    <Cell key={s.name} fill={s.color} />
                  ))}
                </Pie>
                <Tooltip content={<DonutTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className={styles.center}>
              <span className={styles.value}>{centerValue}</span>
              <span className={styles.label}>{centerLabel}</span>
            </div>
          </div>
          <ul className={styles.legend}>
            {slices.map((s) => (
              <li key={s.name} className={styles.legendItem}>
                <span className={styles.dot} style={{ background: s.color }} />
                <span className={styles.name}>{s.name}</span>
                <span className={styles.val}>{s.value}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
