import styles from "./SeriesToggleChips.module.scss";

export type ToggleableSeries = { key: string; name: string; color: string };

interface Props {
  /** Small caption above the chip row — defaults to what the Finance page uses. */
  label?: string;
  series: ToggleableSeries[];
  hidden: Set<string>;
  onToggle: (key: string) => void;
}

// A dot-swatch + name pill per series, click to hide/show. Originally the
// Finance Overview chart's own "Series shown" control; pulled out so the
// Dashboard's Practice Trends widget could use the exact same look and
// interaction instead of a second, differently-styled toggle (an in-chart
// legend with eye icons) that made the two pages feel inconsistent even
// though both did the same job.
export default function SeriesToggleChips({ label = "Series shown", series, hidden, onToggle }: Props) {
  return (
    <div className={styles.controlGroup}>
      <span className={styles.controlLabel}>{label}</span>
      <div className={styles.seriesToggle}>
        {series.map((s) => {
          const on = !hidden.has(s.key);
          return (
            <button
              key={s.key}
              type="button"
              className={`${styles.seriesChip} ${on ? "" : styles.seriesChipOff}`}
              aria-pressed={on}
              onClick={() => onToggle(s.key)}
            >
              <span className={styles.seriesDot} style={{ background: s.color }} />
              {s.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
