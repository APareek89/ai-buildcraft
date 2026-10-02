"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RTooltip,
} from "recharts";

export function SovTrendChart({ data }: { data: { date: string; sov: number }[] }) {
  const chart = data.map((d) => ({ date: d.date.slice(5), sov: Math.round(d.sov * 100) }));
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chart} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: "var(--fg-tertiary)", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: "var(--fg-tertiary)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${v}%`}
          />
          <RTooltip
            contentStyle={{
              background: "var(--bg-quaternary)",
              border: "1px solid var(--border-primary)",
              borderRadius: 8,
              color: "var(--fg-primary)",
              fontSize: 12,
            }}
            formatter={(value) => [`${Number(value)}%`, "Your SoV"]}
          />
          <Line type="monotone" dataKey="sov" stroke="var(--fg-accent)" strokeWidth={2.5} dot={{ r: 3, fill: "var(--fg-accent)" }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
