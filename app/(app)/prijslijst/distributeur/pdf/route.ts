import { NextResponse } from "next/server";

import { weigerRoute } from "@/lib/auth/guards";
import { buildDistributeurItems } from "@/lib/distributeur-prijslijst-data";
import { renderDistributeurPrijslijst, type PrijslijstTaal } from "@/lib/distributeur-prijslijst-pdf";
import { uploadBrochurePdf } from "@/lib/storage";
import { prijsOpties, prijsVoorstelInvoer } from "@/lib/distributeur-invoer";
import { randomUUID } from "node:crypto";

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
  const parsed = prijsVoorstelInvoer.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return NextResponse.json({error:"Ongeldige prijsinstellingen."},{status:400});
  const { serie } = parsed.data;
  const opties = prijsOpties(parsed.data);
  const taalParam = (url.searchParams.get("taal") ?? "nl").toLowerCase();
  const taal: PrijslijstTaal = TALEN.includes(taalParam as PrijslijstTaal) ? (taalParam as PrijslijstTaal) : "nl";

  const { items, totaal } = await buildDistributeurItems(serie || "ALL", opties);
  if (totaal === 0) {
    return NextResponse.json({ error: "geen wandpanelen met een adviesprijs gevonden" }, { status: 404 });
  }

  const pdf = await renderDistributeurPrijslijst({
    items,
    ondertitel: serie || (taal === "es" ? "Colección completa" : taal === "en" ? "Full collection" : taal === "de" ? "Gesamte Kollektion" : "Volledige collectie"),
    taal,
    opties,
  });

  const stukje = serie ? "-" + serie.toLowerCase().replace(/\s+/g, "-") : "";
  const naam = `flexible-stone-verkooppunten-${taal}-${parsed.data.staffel}${stukje}.pdf`.replace(/[^a-z0-9.-]/gi, "-");
  // Kleine voorstellen direct openen/opslaan, zonder een opslagmutatie.
  if (pdf.byteLength < 4_000_000) return new Response(new Uint8Array(pdf), {headers:{
    "Content-Type":"application/pdf", "Cache-Control":"private, no-store",
    "Content-Disposition":`${url.searchParams.get("download")==="1"?"attachment":"inline"}; filename="${naam}"`,
  }});
  // Met alle foto's erin is het bestand te groot voor een directe response;
  // via de opslag-bucket serveren en daarheen doorsturen.
  const downloadUrl = await uploadBrochurePdf(`${randomUUID()}-${naam}`, new Uint8Array(pdf));
  return NextResponse.redirect(downloadUrl, 302);
}
