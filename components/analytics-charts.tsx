"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const nf = (n: number) => new Intl.NumberFormat("nl-NL").format(n);
const ACCENT = "#1f6f5c";
const BROWN = "#3a2a20";

export function VisitorsAreaChart({
  data,
  height = 260,
}: {
  data: { label: string; value: number }[];
  height?: number;
}) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="gaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ACCENT} stopOpacity={0.35} />
              <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} stroke="#6b7280" minTickGap={24} />
          <YAxis tickFormatter={(v) => nf(Number(v))} tickLine={false} axisLine={false} fontSize={11} stroke="#6b7280" width={36} allowDecimals={false} />
          <Tooltip
            formatter={(v) => [nf(Number(v)), "Bezoekers"]}
            contentStyle={{ borderRadius: 8, fontSize: 12, border: "1px solid #e5e7eb" }}
          />
          <Area type="monotone" dataKey="value" stroke={ACCENT} strokeWidth={2} fill="url(#gaFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BreakdownBars({
  data,
  height = 220,
}: {
  data: { name: string; value: number }[];
  height?: number;
}) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tickFormatter={(v) => nf(Number(v))} fontSize={11} stroke="#6b7280" tickLine={false} axisLine={false} allowDecimals={false} />
          <YAxis dataKey="name" type="category" width={96} fontSize={11} stroke="#6b7280" tickLine={false} axisLine={false} />
          <Tooltip
            formatter={(v) => nf(Number(v))}
            contentStyle={{ borderRadius: 8, fontSize: 12, border: "1px solid #e5e7eb" }}
            cursor={{ fill: "rgba(0,0,0,.04)" }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={i === 0 ? ACCENT : BROWN} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
