import { formatCoinsCompact } from "../../utils/format.js";

const DAY = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * Grouped bar chart for the daily series. Deliberately hand-rolled — the shape
 * is simple and a charting library would be the heaviest dependency in the app.
 */
export const BarSeries = ({ series = [], bars = [] }) => {
  if (!series.length) return <div className="text-center py-10 text-muted text-[12.5px]">No data yet</div>;

  const max = Math.max(1, ...series.flatMap((d) => bars.map((b) => d[b.key] || 0)));

  return (
    <div>
      <div className="flex items-end gap-2.5 h-[170px]">
        {series.map((d) => (
          <div key={d.date} className="flex-1 flex flex-col h-full min-w-0">
            <div className="flex-1 flex items-end justify-center gap-[3px] bg-chip rounded-token-sm p-1 overflow-hidden">
              {bars.map((b, i) => {
                const value = d[b.key] || 0;
                return (
                  <span
                    key={b.key}
                    className={`flex-1 min-h-[2px] rounded-t transition-[height] duration-300 ease-out ${
                      i === 1 ? "bg-[var(--acc2)]" : "bg-accent"
                    }`}
                    style={{ height: `${(value / max) * 100}%` }}
                    title={`${b.label}: ${formatCoinsCompact(value)}`}
                  />
                );
              })}
            </div>
            <span className="text-center text-[10.5px] text-muted mt-2">{DAY[new Date(d.date).getDay()]}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-4 mt-3 text-[11.5px] text-muted [&>span]:flex [&>span]:items-center [&>span]:gap-1.5">
        {bars.map((b, i) => (
          <span key={b.key}>
            <i
              className={`w-[9px] h-[9px] rounded-[3px] block ${
                i === 1 ? "bg-[var(--acc2)]" : "bg-accent"
              }`}
            />
            {b.label}
          </span>
        ))}
      </div>
    </div>
  );
};
