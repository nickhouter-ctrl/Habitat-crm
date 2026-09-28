/**
 * De beurslijst: iedereen die we op de stand gesproken hebben, op één plek.
 *
 * Het vastleggen gebeurt per gesprek (een aanvraag), maar opvolgen doe je per
 * persoon — en dezelfde architect staat op dag drie zomaar een tweede keer voor
 * je. Daarom worden de gesprekken hier tot personen verdicht, en zijn sorteren
 * en filteren losse, pure functies: dat is de hele logica van het scherm en zo
 * is hij zonder database te testen.
 */
import { BEURS, rolOmschrijving } from "@/lib/beurs";

export interface BeursGesprek {
  aanvraagId: string;
  contactId: string | null;
  naam: string;
  email: string;
  telefoon: string | null;
  bedrijf: string | null;
  bericht: string | null;
  taal: string | null;
  tags: string[] | null;
  wanneer: Date | null;
}

export interface BeursContact extends BeursGesprek {
  /** Rol uit de tags van het contact ("rol:architect"), of null. */
  rol: string | null;
  /** Bij "anders": wat het dan wél is. */
  rolAnders: string | null;
  /** Heeft de bezoeker het zelf ingevuld via de QR-code? */
  zelfIngevuld: boolean;
  /** Wat de bezoeker wil — de eerste regel is de standregel en valt weg. */
  wens: string;
  /** Hoe vaak we deze persoon op de beurs gesproken hebben. */
  gesprekken: number;
  /** Het eerste moment; `wanneer` is het laatste. */
  eersteKeer: Date | null;
}

export type BeursSortering = "wanneer" | "naam" | "bedrijf" | "soort";
export type BeursRichting = "asc" | "desc";

/** Rol uit de tags van het contact ("rol:architect"). */
export function rolUitTags(tags: string[] | null): string | null {
  const t = (tags ?? []).find((x) => x.startsWith("rol:"));
  return t ? t.slice(4) : null;
}

/** Wat "anders" precies was ("rol-anders:fotograaf"). */
export function rolAndersUitTags(tags: string[] | null): string | null {
  const t = (tags ?? []).find((x) => x.startsWith("rol-anders:"));
  return t ? t.slice("rol-anders:".length) : null;
}

/** De eerste regel van het bericht is de standregel; daaronder staat de wens. */
export function wensUitBericht(bericht: string | null): string {
  return (bericht ?? "").split("\n").slice(1).join("\n").trim();
}

/**
 * Gesprekken → personen. Twee keer dezelfde persoon wordt één regel, met het
 * laatste gesprek bovenaan en de wensen eronder samengevoegd: bij het opvolgen
 * wil je alles zien wat er gezegd is, niet alleen de laatste zin.
 */
export function verdichtTotContacten(gesprekken: BeursGesprek[]): BeursContact[] {
  const perPersoon = new Map<string, BeursContact>();
  // Nieuwste eerst, zodat de eerste die we zien de actuele gegevens heeft.
  const gesorteerd = [...gesprekken].sort((a, b) => tijd(b.wanneer) - tijd(a.wanneer));

  for (const g of gesorteerd) {
    const sleutel = g.contactId ?? g.email.trim().toLowerCase();
    const wens = wensUitBericht(g.bericht);
    const bestaand = perPersoon.get(sleutel);
    if (!bestaand) {
      perPersoon.set(sleutel, {
        ...g,
        rol: rolUitTags(g.tags),
        rolAnders: rolAndersUitTags(g.tags),
        zelfIngevuld: (g.tags ?? []).includes("beurs:qr"),
        wens,
        gesprekken: 1,
        eersteKeer: g.wanneer,
      });
      continue;
    }
    bestaand.gesprekken += 1;
    bestaand.eersteKeer = g.wanneer ?? bestaand.eersteKeer;
    // Ontbrekende gegevens uit een eerder gesprek alsnog overnemen.
    bestaand.telefoon ??= g.telefoon;
    bestaand.bedrijf ??= g.bedrijf;
    if (wens && !bestaand.wens.includes(wens)) {
      bestaand.wens = [bestaand.wens, wens].filter(Boolean).join("\n");
    }
  }
  return [...perPersoon.values()];
}

const tijd = (d: Date | null) => (d ? d.getTime() : 0);

export function filterBeursContacten(
  rijen: BeursContact[],
  opties: { rol?: string; q?: string; invoer?: "zelf" | "wij" | "" },
): BeursContact[] {
  const q = opties.q?.trim().toLowerCase() ?? "";
  return rijen.filter((r) => {
    if (opties.rol && (r.rol ?? "anders") !== opties.rol) return false;
    if (opties.invoer === "zelf" && !r.zelfIngevuld) return false;
    if (opties.invoer === "wij" && r.zelfIngevuld) return false;
    if (!q) return true;
    return [r.naam, r.email, r.bedrijf ?? "", r.telefoon ?? "", r.wens]
      .join(" ")
      .toLowerCase()
      .includes(q);
  });
}

export function sorteerBeursContacten(
  rijen: BeursContact[],
  sort: BeursSortering,
  richting: BeursRichting,
): BeursContact[] {
  const keer = richting === "asc" ? 1 : -1;
  const tekst = (a: string, b: string) => a.localeCompare(b, "nl", { sensitivity: "base" });
  return [...rijen].sort((a, b) => {
    switch (sort) {
      case "naam":
        return keer * tekst(a.naam, b.naam);
      case "bedrijf":
        // Zonder bedrijf achteraan, in beide richtingen — een leeg veld is geen
        // naam die vooraan hoort te staan.
        if (!a.bedrijf && !b.bedrijf) return tekst(a.naam, b.naam);
        if (!a.bedrijf) return 1;
        if (!b.bedrijf) return -1;
        return keer * tekst(a.bedrijf, b.bedrijf);
      case "soort":
        return keer * tekst(rolOmschrijving(a.rol ?? "anders", a.rolAnders), rolOmschrijving(b.rol ?? "anders", b.rolAnders));
      default:
        return keer * (tijd(a.wanneer) - tijd(b.wanneer));
    }
  });
}

/** Regels voor het CSV-bestand — dezelfde kolommen als op het scherm. */
export function beursCsv(rijen: BeursContact[]): string {
  const kop = ["Naam", "Bedrijf", "Soort", "E-mail", "Telefoon", "Taal", "Waar het over ging", "Zelf ingevuld", "Gesprekken", "Wanneer"];
  const veld = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const datum = (d: Date | null) =>
    d ? d.toLocaleString("nl-NL", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  const regels = rijen.map((r) =>
    [
      r.naam,
      r.bedrijf ?? "",
      rolOmschrijving(r.rol ?? "anders", r.rolAnders),
      r.email,
      r.telefoon ?? "",
      r.taal ?? "",
      r.wens.replace(/\n/g, " · "),
      r.zelfIngevuld ? "ja" : "nee",
      String(r.gesprekken),
      datum(r.wanneer),
    ]
      .map(veld)
      .join(";"),
  );
  // Puntkomma + BOM: zo opent Excel in het Spaans en het Nederlands meteen goed.
  return `﻿${kop.map(veld).join(";")}\n${regels.join("\n")}\n`;
}

/** Bestandsnaam van de download — met de beurs erin, want die wisselt. */
export function beursCsvNaam(): string {
  const slug = BEURS.naam.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return `beurscontacten-${slug}.csv`;
}
