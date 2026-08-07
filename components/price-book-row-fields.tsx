"use client";

/**
 * De rekenvelden van een prijzenboek-rij: factor, snijverlies, kostopbouw
 * (uren + materiaal), marge en verkoop.
 *
 * De kostprijs is afgeleid: uren × ploegtarief + materiaal. Vul je uren of
 * materiaal in, dan rekent het kostveld zichzelf uit en staat het op slot —
 * zo blijft één ploegtarief leidend in plaats van 76 losse kostbedragen die
 * uit elkaar lopen. Laat je beide leeg, dan is de kost gewoon met de hand in
 * te vullen (stelposten als "keuken leveren" zijn niet in uren te splitsen).
 *
 * Kost of marge wijzigen rekent de verkoopprijs direct opnieuw uit
 * (kost ÷ (1 − marge), afgerond). Verkoop zelf overtypen wint, tot de
 * volgende kost- of marge-wijziging.
 * `display: contents` zodat de velden in de grid van de rij vallen.
 */
import { useRef, useState } from "react";

import { Input } from "@/components/ui";
import { parseMoney } from "@/lib/parse-money";
import { DEFAULT_PRIJZENBOEK_MARGE, UURTARIEF_ONDERAANNEMER } from "@/lib/price-book";

export function PriceBookRowFields({
  factor,
  wastePct,
  laborHours,
  materialCostEur,
  costEur,
  marginPct,
  priceEur,
}: {
  factor: string;
  wastePct: string;
  laborHours: string;
  materialCostEur: string;
  costEur: string;
  marginPct: string;
  priceEur: string;
}) {
  const urenRef = useRef<HTMLInputElement>(null);
  const materiaalRef = useRef<HTMLInputElement>(null);
  const kostRef = useRef<HTMLInputElement>(null);
  const margeRef = useRef<HTMLInputElement>(null);
  const prijsRef = useRef<HTMLInputElement>(null);
  const [afgeleid, setAfgeleid] = useState(laborHours !== "" || materialCostEur !== "");

  /** Verkoop volgt uit de kost die op dat moment in het veld staat. */
  const herberekenPrijs = () => {
    const kost = parseMoney(kostRef.current?.value ?? "");
    const marge = parseMoney(margeRef.current?.value ?? "") ?? DEFAULT_PRIJZENBOEK_MARGE;
    if (!prijsRef.current) return;
    prijsRef.current.value =
      kost != null && marge < 100 ? String(Math.round(kost / (1 - marge / 100))) : "";
  };

  /** Uren/materiaal gewijzigd → kost opnieuw opbouwen, dan de verkoop. */
  const herberekenKost = () => {
    const uren = parseMoney(urenRef.current?.value ?? "");
    const materiaal = parseMoney(materiaalRef.current?.value ?? "");
    const heeftOpbouw = uren != null || materiaal != null;
    setAfgeleid(heeftOpbouw);
    if (heeftOpbouw && kostRef.current) {
      const som = (uren ?? 0) * UURTARIEF_ONDERAANNEMER + (materiaal ?? 0);
      kostRef.current.value = String(Math.round(som * 100) / 100);
    }
    herberekenPrijs();
  };

  return (
    <div className="contents">
      <Input name="factor" defaultValue={factor} className="text-right" title="Factor: aantal = maat × factor" />
      <Input
        name="wastePct"
        defaultValue={wastePct}
        inputMode="decimal"
        className="text-right"
        placeholder="0"
        title="Snijverlies in %: wordt automatisch bij het aantal opgeteld (tegels, panelen, plankvloeren)"
      />
      <Input
        ref={urenRef}
        name="laborHours"
        defaultValue={laborHours}
        onChange={herberekenKost}
        inputMode="decimal"
        className="text-right"
        placeholder="—"
        title={`Uren ploeg per eenheid — × € ${UURTARIEF_ONDERAANNEMER}/uur`}
      />
      <Input
        ref={materiaalRef}
        name="materialCostEur"
        defaultValue={materialCostEur}
        onChange={herberekenKost}
        inputMode="decimal"
        className="text-right"
        placeholder="—"
        title="Materiaalkost per eenheid (excl. btw)"
      />
      <Input
        ref={kostRef}
        name="costEur"
        defaultValue={costEur}
        onChange={herberekenPrijs}
        placeholder="kost"
        inputMode="decimal"
        readOnly={afgeleid}
        className={`text-right ${afgeleid ? "bg-background/60 text-muted" : ""}`}
        title={
          afgeleid
            ? `Afgeleid: uren × € ${UURTARIEF_ONDERAANNEMER} + materiaal. Maak uren en materiaal leeg om zelf een kost te typen.`
            : "Onze kost per eenheid (excl. btw)"
        }
      />
      <Input
        ref={margeRef}
        name="marginPct"
        defaultValue={marginPct}
        onChange={herberekenPrijs}
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
