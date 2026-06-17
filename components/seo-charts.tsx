"use client";

import { useRouter } from "next/navigation";
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
  drillBase,
}: {
  data: { label: string; clicks: number; impressions: number; date?: string }[];
  height?: number;
  /** Bijv. "/rapporten/seo?datum=" — maakt elke dag aanklikbaar voor een dagoverzicht. */
  drillBase?: string;
}) {
  const router = useRouter();
  const clickable = Boolean(drillBase) && data.some((d) => d.date);
  const showDots = data.length <= 14;

  const handleClick = (e: unknown) => {
    if (!clickable) return;
    const date = (e as { activePayload?: { payload?: { date?: string } }[] } | undefined)
      ?.activePayload?.[0]?.payload?.date;
    if (date) router.push(`${drillBase}${date}`);
  };

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <ComposedChart
          data={data}
          margin={{ top: 5, right: 8, left: 0, bottom: 0 }}
          onClick={handleClick}
          style={clickable ? { cursor: "pointer" } : undefined}
        >
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
          <Area yAxisId="impr" type="monotone" dataKey="impressions" stroke={BROWN} strokeWidth={1.5} fill="url(#seoImpr)" dot={showDots ? { r: 3, fill: BROWN } : false} />
          <Line yAxisId="clicks" type="monotone" dataKey="clicks" stroke={ACCENT} strokeWidth={2} dot={showDots ? { r: 3, fill: ACCENT } : false} activeDot={{ r: 5 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
