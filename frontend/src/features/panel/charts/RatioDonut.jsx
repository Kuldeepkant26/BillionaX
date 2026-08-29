import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useChartTheme } from "./chartTheme.js";
import { ChartTooltip } from "./ChartTooltip.jsx";

/**
 * A part-of-whole donut with the headline percentage in the middle.
 *
 * Two slices only. A donut stops being readable past a handful of slices, so
 * this deliberately takes a value and its total rather than an open-ended
 * series — anything richer belongs in a bar chart.
 */
export const RatioDonut = ({
  value = 0,
  total = 0,
  valueLabel,
  totalLabel,
  format = (n) => n,
  height = 190,
}) => {
  const theme = useChartTheme();
  const safeTotal = Math.max(0, total);
  const safeValue = Math.max(0, Math.min(value, safeTotal));
  const remainder = Math.max(0, safeTotal - safeValue);
  const pct = safeTotal > 0 ? (safeValue / safeTotal) * 100 : 0;

  const data = [
    { name: valueLabel, value: safeValue },
    { name: totalLabel, value: remainder },
  ];

  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="relative" style={{ width: height, height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              innerRadius="68%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
              // A surface-coloured gap keeps the two arcs from bleeding
              // together where they meet.
              paddingAngle={safeValue > 0 && remainder > 0 ? 2 : 0}
              stroke="none"
              isAnimationActive={false}
            >
              <Cell fill={theme.series[0]} />
              <Cell fill={theme.accSoft} />
            </Pie>
            <Tooltip content={<ChartTooltip format={format} />} />
          </PieChart>
        </ResponsiveContainer>

        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <b className="font-display text-[24px] font-semibold tracking-[-0.5px]">
            {Math.round(pct)}%
          </b>
        </div>
      </div>

      {/* Legend + direct values: identity is never colour alone. */}
      <div className="flex min-w-0 flex-col gap-3">
        <span>
          <span className="flex items-center gap-1.5">
            <i
              className="block h-[9px] w-[9px] rounded-[3px]"
              style={{ background: theme.series[0] }}
            />
            <u className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-muted no-underline">
              {valueLabel}
            </u>
          </span>
          <b className="mt-0.5 block font-display text-xl font-semibold">{format(safeValue)}</b>
        </span>
        <span>
          <span className="flex items-center gap-1.5">
            <i
              className="block h-[9px] w-[9px] rounded-[3px] border border-hairline"
              style={{ background: theme.accSoft }}
            />
            <u className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-muted no-underline">
              {totalLabel}
            </u>
          </span>
          <b className="mt-0.5 block font-display text-xl font-semibold">{format(safeTotal)}</b>
        </span>
      </div>
    </div>
  );
};
