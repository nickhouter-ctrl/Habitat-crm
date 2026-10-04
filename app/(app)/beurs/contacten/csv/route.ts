import { weigerRoute } from "@/lib/auth/guards";
import { ROLLEN } from "@/lib/beurs";
import { haalBeursGesprekken } from "@/lib/beurs-data";
import { isLocale } from "@/lib/i18n";
import { huidigeTaal } from "@/lib/i18n/server";
import {
  type BeursRichting,
  type BeursSortering,
  beursCsv,
  beursCsvNaam,
  filterBeursContacten,
  sorteerBeursContacten,
  verdichtTotContacten,
} from "@/lib/beurs-lijst";

/**
 * De beurslijst als bestand, met precies de filters en de volgorde die op het
 * scherm staan. Nodig omdat de opvolging na de beurs deels buiten het CRM
 * gebeurt (een mailronde per soort bezoeker), en niemand die namen nog een keer
 * wil overtypen.
 *
 * Achter dezelfde module als de rest van de beurs: hier staan klantgegevens in.
 */
export async function GET(req: Request) {
  const weiger = await weigerRoute("aanvragen");
  if (weiger) return weiger;

  const sp = new URL(req.url).searchParams;
  const lang = sp.get("lang");
  const locale = isLocale(lang) ? lang : await huidigeTaal();
  const rolParam = sp.get("rol") ?? "";
  const rol = ROLLEN.some((r) => r.key === rolParam) ? rolParam : "";
  const invoerParam = sp.get("invoer") ?? "";
  const invoer = (invoerParam === "zelf" || invoerParam === "wij" ? invoerParam : "") as "" | "zelf" | "wij";
  const sortParam = sp.get("sort") ?? "";
  const sort = (["naam", "bedrijf", "soort", "wanneer"].includes(sortParam) ? sortParam : "wanneer") as BeursSortering;
  const dir = (sp.get("dir") === "asc" ? "asc" : "desc") as BeursRichting;

  const rijen = sorteerBeursContacten(
    filterBeursContacten(verdichtTotContacten(await haalBeursGesprekken()), {
      q: sp.get("q") ?? "",
      rol,
      invoer,
    }),
    sort,
    dir,
  );

  return new Response(beursCsv(rijen, locale), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${beursCsvNaam()}"`,
      "cache-control": "private, no-store",
    },
  });
}
