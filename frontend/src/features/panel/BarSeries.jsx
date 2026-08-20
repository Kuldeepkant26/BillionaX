import { formatCoinsCompact } from "../../utils/format.js";
import styles from "./BarSeries.module.css";

const DAY = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * Grouped bar chart for the daily series. Deliberately hand-rolled — the shape
 * is simple and a charting library would be the heaviest dependency in the app.
 */
export const BarSeries = ({ series = [], bars = [] }) => {
  if (!series.length) return <div className={styles.empty}>No data yet</div>;

  const max = Math.max(1, ...series.flatMap((d) => bars.map((b) => d[b.key] || 0)));

  return (
    <div>
      <div className={styles.chart}>
        {series.map((d) => (
          <div key={d.date} className={styles.col}>
            <div className={styles.stack}>
              {bars.map((b, i) => {
                const value = d[b.key] || 0;
                return (
                  <span
                    key={b.key}
                    className={`${styles.bar} ${i === 1 ? styles.alt : ""}`}
                    style={{ height: `${(value / max) * 100}%` }}
                    title={`${b.label}: ${formatCoinsCompact(value)}`}
                  />
                );
              })}
            </div>
            <span className={styles.label}>{DAY[new Date(d.date).getDay()]}</span>
          </div>
        ))}
      </div>

      <div className={styles.legend}>
        {bars.map((b, i) => (
          <span key={b.key}>
            <i className={i === 1 ? styles.altDot : styles.dot} />
            {b.label}
          </span>
        ))}
      </div>
    </div>
  );
};
