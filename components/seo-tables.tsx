"use client";

import { useState } from "react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  TBody,
  Table,
  Td,
  Th,
  THead,
  Tr,
} from "@/components/ui";
import type { ScRow } from "@/lib/searchconsole";
import { cn } from "@/lib/utils";

const nf = (n: number) => Math.round(n).toLocaleString("nl-NL");
const pf = (n: number) => `${(n * 100).toFixed(1)}%`;

const COUNTRY: Record<string, string> = {
  nld: "Nederland", esp: "Spanje", deu: "Duitsland", bel: "België", gbr: "VK",
  usa: "VS", fra: "Frankrijk", ita: "Italië", che: "Zwitserland", aut: "Oostenrijk",
  swe: "Zweden", nor: "Noorwegen", dnk: "Denemarken", prt: "Portugal", pol: "Polen",
};
const cname = (c: string) => COUNTRY[(c || "").toLowerCase()] ?? (c ? c.toUpperCase() : "(onbekend)");

type SortKey = "key" | "clicks" | "impressions" | "ctr" | "position";

export function SortableSeoTable({
  title,
  keyLabel,
  rows,
  strip,
  country,
}: {
  title: string;
  keyLabel: string;
  rows: ScRow[];
  strip?: boolean;
  country?: boolean;
}) {
  // Standaard gesorteerd op kliks (aflopend); positie default oplopend (lager = beter).
  const [sort, setSort] = useState<SortKey>("clicks");
  const [asc, setAsc] = useState(false);

  const labelOf = (r: ScRow) => {
    const key = r.keys?.[0] ?? "";
    if (country) return cname(key);
    if (strip) return key.replace("https://www.habitat-one.com", "") || "/";
    return key;
  };

  const sorted = [...rows].sort((a, b) => {
    let cmp: number;
    if (sort === "key") cmp = labelOf(a).localeCompare(labelOf(b));
    else cmp = (a[sort] ?? 0) - (b[sort] ?? 0);
    return asc ? cmp : -cmp;
  });

  const toggle = (k: SortKey) => {
    if (sort === k) {
      setAsc((v) => !v);
    } else {
      setSort(k);
      // Positie: lager = beter, dus oplopend als startrichting; rest aflopend.
      setAsc(k === "key" || k === "position");
    }
  };

  const arrow = (k: SortKey) => (sort === k ? (asc ? " ↑" : " ↓") : "");

  const headBtn = (k: SortKey, children: React.ReactNode, right?: boolean) => (
    <Th className={right ? "text-right" : undefined}>
      <button
        type="button"
        onClick={() => toggle(k)}
        className={cn(
          "inline-flex items-center gap-0.5 transition-colors hover:text-foreground",
          sort === k ? "font-semibold text-foreground" : "",
          right && "flex-row-reverse",
        )}
      >
        {children}
        <span className="tabular-nums text-accent">{arrow(k)}</span>
      </button>
    </Th>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-2 text-sm text-muted">Nog geen data in deze periode.</p>
        ) : (
          <div className="max-h-[28rem] overflow-auto">
            <Table>
              <THead>
                <Tr>
                  {headBtn("key", keyLabel)}
                  {headBtn("clicks", "Kliks", true)}
                  {headBtn("impressions", "Vert.", true)}
                  {headBtn("ctr", "CTR", true)}
                  {headBtn("position", "Positie", true)}
                </Tr>
              </THead>
              <TBody>
                {sorted.map((r, i) => {
                  const key = r.keys?.[0] ?? "";
                  return (
                    <Tr key={`${key}-${i}`}>
                      <Td className="max-w-[18rem] truncate" title={labelOf(r)}>{labelOf(r)}</Td>
                      <Td className="text-right tabular-nums">{nf(r.clicks)}</Td>
                      <Td className="text-right tabular-nums">{nf(r.impressions)}</Td>
                      <Td className="text-right tabular-nums">{pf(r.ctr)}</Td>
                      <Td className="text-right tabular-nums">{r.position.toFixed(1)}</Td>
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
