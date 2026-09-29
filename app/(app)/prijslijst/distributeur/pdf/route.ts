import { NextResponse } from "next/server";

import { weigerRoute } from "@/lib/auth/guards";
import { buildDistributeurItems } from "@/lib/distributeur-prijslijst-data";
import { renderDistributeurPrijslijst, type PrijslijstTaal } from "@/lib/distributeur-prijslijst-pdf";
import { uploadBrochurePdf } from "@/lib/storage";

/**
 * De prijslijst voor verkooppunten als PDF — het document dat na de beurs naar
 * winkels en showrooms gaat die Flexibel Stone willen verkopen.
 */
const TALEN: PrijslijstTaal[] = ["nl", "de", "en", "es"];

// Elke productfoto wordt opgehaald; de volledige collectie mag wat langer duren.
export const maxDuration = 300;

export async function GET(req: Request) {
  const nee = await weigerRoute("prijzen");
  if (nee) return nee;

  const url = new URL(req.url);
  const serie = url.searchParams.get("serie") || "";
  const taalParam = (url.searchParams.get("taal") ?? "nl").toLowerCase();
  const taal: PrijslijstTaal = TALEN.includes(taalParam as PrijslijstTaal) ? (taalParam as PrijslijstTaal) : "nl";

  const { items, totaal } = await buildDistributeurItems(serie || "ALL");
  if (totaal === 0) {
    return NextResponse.json({ error: "geen wandpanelen met een adviesprijs gevonden" }, { status: 404 });
  }

  const pdf = await renderDistributeurPrijslijst({
    items,
    ondertitel: serie || (taal === "es" ? "Colección completa" : taal === "en" ? "Full collection" : taal === "de" ? "Gesamte Kollektion" : "Volledige collectie"),
    taal,
  });

  const stukje = serie ? "-" + serie.toLowerCase().replace(/\s+/g, "-") : "";
  const naam = `flexibel-stone-verkooppunten-${taal}${stukje}.pdf`.replace(/[^a-z0-9.-]/gi, "-");
  // Met alle foto's erin is het bestand te groot voor een directe response;
  // via de opslag-bucket serveren en daarheen doorsturen.
  const downloadUrl = await uploadBrochurePdf(naam, new Uint8Array(pdf));
  return NextResponse.redirect(downloadUrl, 302);
}
