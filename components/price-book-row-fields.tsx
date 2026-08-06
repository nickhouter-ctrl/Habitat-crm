"use client";

/**
 * De rekenvelden van een prijzenboek-rij: factor, kost, marge en verkoop.
 *
 * Kost of marge aanpassen rekent de verkoopprijs direct opnieuw uit
 * (kost ÷ (1 − marge), afgerond) — je ziet meteen wat je gaat vragen.
 * Verkoop zelf overtypen wint, tot de volgende kost- of marge-wijziging.
 * `display: contents` zodat de vier velden in de grid van de rij vallen.
 */
import { useRef } from "react";

import { Input } from "@/components/ui";
import { parseMoney } from "@/lib/parse-money";
import { DEFAULT_PRIJZENBOEK_MARGE } from "@/lib/price-book";

export function PriceBookRowFields({
  factor,
  costEur,
  marginPct,
  priceEur,
}: {
  factor: string;
  costEur: string;
  marginPct: string;
  priceEur: string;
}) {
  const kostRef = useRef<HTMLInputElement>(null);
  const margeRef = useRef<HTMLInputElement>(null);
  const prijsRef = useRef<HTMLInputElement>(null);

  const herbereken = () => {
    const kost = parseMoney(kostRef.current?.value ?? "");
    const marge = parseMoney(margeRef.current?.value ?? "") ?? DEFAULT_PRIJZENBOEK_MARGE;
    if (!prijsRef.current) return;
    prijsRef.current.value =
      kost != null && marge < 100 ? String(Math.round(kost / (1 - marge / 100))) : "";
  };

  return (
    <div className="contents">
      <Input name="factor" defaultValue={factor} className="text-right" title="Factor: aantal = maat × factor" />
      <Input
        ref={kostRef}
        name="costEur"
        defaultValue={costEur}
        onChange={herbereken}
        placeholder="kost"
        inputMode="decimal"
        className="text-right"
        title="Onze kost per eenheid (excl. btw)"
      />
      <Input
        ref={margeRef}
        name="marginPct"
        defaultValue={marginPct}
        onChange={herbereken}
        inputMode="decimal"
        className="text-right"
        title="Marge, % van de verkoopprijs"
      />
      <Input
        ref={prijsRef}
        name="priceEur"
        defaultValue={priceEur}
        placeholder="auto"
        inputMode="decimal"
        className="text-right font-semibold"
        title="Verkoop per eenheid (excl. btw) — rekent mee met kost en marge, overtypen mag"
      />
    </div>
  );
}
