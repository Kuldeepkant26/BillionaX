/**
 * Shared tooltip body for every panel chart.
 *
 * Values wear text tokens, never the series colour — the swatch beside each
 * row carries identity, so the number stays legible at any contrast.
 */
export const ChartTooltip = ({ active, payload, label, format = (v) => v }) => {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-token-sm border border-hairline bg-card px-3 py-2 shadow-[var(--shadow)]">
      {label && (
        <b className="mb-1.5 block text-[11px] font-semibold text-ink">{label}</b>
      )}
      <div className="flex flex-col gap-1">
        {payload.map((entry) => (
          <span key={entry.dataKey} className="flex items-center gap-2 text-[11.5px]">
            <i
              className="block h-2 w-2 flex-none rounded-[3px]"
              style={{ background: entry.color }}
            />
            <span className="text-muted">{entry.name}</span>
            <b className="ml-auto pl-3 font-semibold tabular-nums text-ink">
              {format(entry.value)}
            </b>
          </span>
        ))}
      </div>
    </div>
  );
};
