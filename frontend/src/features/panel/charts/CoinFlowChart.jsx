import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useChartTheme } from "./chartTheme.js";
import { ChartTooltip } from "./ChartTooltip.jsx";
import { formatCoinsCompact } from "../../../utils/format.js";

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const TICK_COUNT = 4;

/**
 * A round top-of-scale and evenly divided ticks.
 *
 * Rounds the maximum up to 1, 2 or 5 times a power of ten, so the axis reads
 * 0 / 1K / 2K / 3K / 4K rather than the raw-data ladder Recharts derives by
 * default (950 / 1.9K / 2.9K / 3.8K).
 */
const niceScale = (max) => {
  if (!max || max <= 0) return { niceMax: TICK_COUNT, niceTicks: [0, 1, 2, 3, 4] };

  const rough = max / TICK_COUNT;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? 10 * magnitude;
  const niceMax = step * TICK_COUNT;

  return {
    niceMax,
    niceTicks: Array.from({ length: TICK_COUNT + 1 }, (_, i) => i * step),
  };
};

/**
 * Coins issued against coins redeemed over the last week.
 *
 * An area chart rather than grouped bars: this is change-over-time for two
 * continuous quantities, and the gap between the two bands is the thing worth
 * reading — bars made the reader compare pairs day by day instead.
 *
 * Overlaid, not stacked: the series are alternatives, not parts of a total,
 * so stacking would invent a meaningless sum.
 */
export const CoinFlowChart = ({ series = [], bars = [], height = 240 }) => {
  const theme = useChartTheme();

  if (!series.length) {
    return <div className="py-10 text-center text-[12.5px] text-muted">No data yet</div>;
  }

  const data = series.map((d) => ({
    ...d,
    day: DAY[new Date(d.date).getDay()],
  }));

  const { niceMax, niceTicks } = niceScale(
    Math.max(0, ...series.flatMap((d) => bars.map((b) => Number(d[b.key]) || 0)))
  );

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -6 }}>
        <defs>
          {bars.map((b, i) => (
            <linearGradient key={b.key} id={`flow-${b.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={theme.series[i]} stopOpacity={0.28} />
              <stop offset="100%" stopColor={theme.series[i]} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>

        {/* Horizontal only: vertical rules add ink without helping a reader
            compare heights. */}
        <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={{ stroke: theme.grid }}
          tick={{ fill: theme.axis, fontSize: 11 }}
          dy={4}
        />
        {/* Round numbers on the axis: Recharts' default domain produces ticks
            like 950 / 1.9K / 2.9K, which are harder to read off than an even
            ladder. `niceTicks` rounds the top of the scale up to a clean
            step and divides it evenly. */}
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fill: theme.axis, fontSize: 11 }}
          tickFormatter={formatCoinsCompact}
          domain={[0, niceMax]}
          ticks={niceTicks}
          width={52}
        />
        <Tooltip
          content={<ChartTooltip format={formatCoinsCompact} />}
          cursor={{ stroke: theme.axis, strokeDasharray: "3 3" }}
        />
        <Legend
          iconType="square"
          iconSize={9}
          wrapperStyle={{ fontSize: 11.5, color: theme.axis, paddingTop: 6 }}
        />

        {bars.map((b, i) => (
          <Area
            key={b.key}
            type="monotone"
            dataKey={b.key}
            name={b.label}
            stroke={theme.series[i]}
            strokeWidth={2}
            fill={`url(#flow-${b.key})`}
            activeDot={{ r: 4, strokeWidth: 2, stroke: theme.card }}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
};
