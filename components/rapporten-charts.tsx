"use client";

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

import { COMPANY } from "@/lib/company";

const fmtEUR = (n: number) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

const BROWN = COMPANY.brown ?? "#3a2a20";
const ACCENT = COMPANY.accent ?? "#1f6f5c";

export function MonthlyAmountChart({
  data,
  color = ACCENT,
  height = 240,
}: {
  data: { month: string; value: number }[];
  color?: string;
  height?: number;
}) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} stroke="#6b7280" />
          <YAxis tickFormatter={(v) => fmtEUR(Number(v))} tickLine={false} axisLine={false} fontSize={11} stroke="#6b7280" width={70} />
          <Tooltip
            formatter={(v) => fmtEUR(Number(v))}
            contentStyle={{ borderRadius: 8, fontSize: 12, border: "1px solid #e5e7eb" }}
            cursor={{ fill: "rgba(0,0,0,.04)" }}
          />
          <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HorizontalBarChart({
  data,
  height = 280,
}: {
  data: { name: string; value: number }[];
  height?: number;
}) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tickFormatter={(v) => fmtEUR(Number(v))} fontSize={11} stroke="#6b7280" tickLine={false} axisLine={false} />
          <YAxis dataKey="name" type="category" width={160} fontSize={11} stroke="#6b7280" tickLine={false} axisLine={false} />
          <Tooltip
            formatter={(v) => fmtEUR(Number(v))}
            contentStyle={{ borderRadius: 8, fontSize: 12, border: "1px solid #e5e7eb" }}
            cursor={{ fill: "rgba(0,0,0,.04)" }}
          />
          <Bar dataKey="value" fill={BROWN} radius={[0, 4, 4, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={i === 0 ? ACCENT : BROWN} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
