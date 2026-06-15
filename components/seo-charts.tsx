"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const nf = (n: number) => new Intl.NumberFormat("nl-NL").format(n);
const ACCENT = "#1f6f5c";
const BROWN = "#b08968";

export function SeoTrendChart({
  data,
  height = 260,
}: {
  data: { label: string; clicks: number; impressions: number }[];
  height?: number;
}) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="seoImpr" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={BROWN} stopOpacity={0.25} />
              <stop offset="100%" stopColor={BROWN} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} stroke="#6b7280" minTickGap={24} />
          <YAxis yAxisId="clicks" tickFormatter={(v) => nf(Number(v))} tickLine={false} axisLine={false} fontSize={11} stroke="#6b7280" width={32} allowDecimals={false} />
          <YAxis yAxisId="impr" orientation="right" tickFormatter={(v) => nf(Number(v))} tickLine={false} axisLine={false} fontSize={11} stroke="#9ca3af" width={40} allowDecimals={false} />
          <Tooltip
            formatter={(v, name) => [nf(Number(v)), name === "clicks" ? "Kliks" : "Vertoningen"]}
            contentStyle={{ borderRadius: 8, fontSize: 12, border: "1px solid #e5e7eb" }}
          />
          <Area yAxisId="impr" type="monotone" dataKey="impressions" stroke={BROWN} strokeWidth={1.5} fill="url(#seoImpr)" />
          <Line yAxisId="clicks" type="monotone" dataKey="clicks" stroke={ACCENT} strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
