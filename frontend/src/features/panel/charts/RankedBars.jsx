import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useChartTheme } from "./chartTheme.js";
import { ChartTooltip } from "./ChartTooltip.jsx";

/**
 * Horizontal ranked bars — for "top N by magnitude", where the category names
 * are words. Horizontal because vertical bars force long hotel names to
 * rotate, and a rotated label is a label nobody reads.
 *
 * One series, so no legend: the card title names the measure.
 */
const MAX_LABEL = 14;

/** One line, ellipsised — a name wrapped over three lines is unreadable at 11px. */
const truncate = (value) => {
  const text = String(value ?? "");
  return text.length > MAX_LABEL ? `${text.slice(0, MAX_LABEL - 1).trimEnd()}…` : text;
};

export const RankedBars = ({ data = [], nameKey = "name", valueKey = "value", format, label }) => {
  const theme = useChartTheme();

  if (!data.length) return null;

  const height = Math.max(140, data.length * 40);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" horizontal={false} />
        <XAxis
          type="number"
          tickLine={false}
          axisLine={false}
          tick={{ fill: theme.axis, fontSize: 11 }}
          tickFormatter={format}
        />
        <YAxis
          type="category"
          dataKey={nameKey}
          tickLine={false}
          axisLine={false}
          // width must clear the longest truncated label, or Recharts wraps
          // the text onto a second line instead of overflowing.
          tick={{ fill: theme.axis, fontSize: 11.5, width: 110 }}
          tickFormatter={truncate}
          width={116}
          interval={0}
        />
        {/* The tooltip carries the full name, so truncating the axis label
            loses nothing. */}
        <Tooltip
          content={<ChartTooltip format={format} />}
          cursor={{ fill: theme.accSoft, opacity: 0.5 }}
        />
        <Bar dataKey={valueKey} name={label} radius={[0, 4, 4, 0]} barSize={16}>
          {/* Same hue for every bar: rank is already encoded by position and
              length, so varying colour here would imply a second dimension
              that does not exist. */}
          {data.map((entry) => (
            <Cell key={entry[nameKey]} fill={theme.series[0]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};
