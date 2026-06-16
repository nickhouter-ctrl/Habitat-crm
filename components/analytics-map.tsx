"use client";

import { useMemo, useState } from "react";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { Feature, Geometry } from "geojson";
import topo from "@/lib/geo/countries-110m.json";

// GA4-landnamen → namen in de wereldkaart-data (world-atlas).
const ALIAS: Record<string, string> = {
  "United States": "United States of America",
  Czechia: "Czechia",
  "Bosnia & Herzegovina": "Bosnia and Herz.",
  "Dominican Republic": "Dominican Rep.",
  "South Korea": "South Korea",
  "Côte d'Ivoire": "Côte d'Ivoire",
};

type Row = { label: string; value: number };

export function WorldMap({ data }: { data: Row[] }) {
  const [hover, setHover] = useState<{ name: string; value: number; x: number; y: number } | null>(null);

  const { shapes, max } = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fc = feature(topo as any, (topo as any).objects.countries) as unknown as {
      features: Feature<Geometry, { name: string }>[];
    };
    const projection = geoNaturalEarth1().fitSize([800, 380], { type: "FeatureCollection", features: fc.features } as never);
    const path = geoPath(projection);
    const lookup = new Map<string, number>();
    for (const r of data) lookup.set(ALIAS[r.label] ?? r.label, r.value);
    const max = Math.max(1, ...data.map((d) => d.value));
    const shapes = fc.features.map((f) => ({
      d: path(f) ?? "",
      name: f.properties.name,
      value: lookup.get(f.properties.name) ?? 0,
    }));
    return { shapes, max };
  }, [data]);

  const color = (v: number) => {
    if (v <= 0) return "#ece7df";
    const t = Math.sqrt(v / max); // sqrt geeft meer contrast bij lage waarden
    const c1 = [233, 223, 208];
    const c2 = [182, 85, 45];
    const m = c1.map((a, i) => Math.round(a + (c2[i] - a) * t));
    return `rgb(${m[0]},${m[1]},${m[2]})`;
  };

  return (
    <div className="relative">
      <svg viewBox="0 0 800 380" className="h-auto w-full">
        {shapes.map((s, i) => (
          <path
            key={i}
            d={s.d}
            fill={color(s.value)}
            stroke="#fff"
            strokeWidth={0.4}
            onMouseEnter={(e) => s.value > 0 && setHover({ name: s.name, value: s.value, x: e.clientX, y: e.clientY })}
            onMouseMove={(e) => setHover((h) => (h ? { ...h, x: e.clientX, y: e.clientY } : h))}
            onMouseLeave={() => setHover(null)}
            style={{ cursor: s.value > 0 ? "pointer" : "default" }}
          />
        ))}
      </svg>
      {hover && (
        <div
          className="pointer-events-none fixed z-50 rounded-md bg-gray-900 px-2 py-1 text-xs font-medium text-white shadow-lg"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          {hover.name}: {hover.value.toLocaleString("nl-NL")}
        </div>
      )}
    </div>
  );
}
