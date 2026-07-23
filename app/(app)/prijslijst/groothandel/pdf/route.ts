import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { buildWholesaleItems } from "@/lib/wholesale-brochure-data";
import { renderWholesaleBrochure, type BrochureLocale } from "@/lib/wholesale-brochure-pdf";

const LOCALES: BrochureLocale[] = ["nl", "de", "en", "es"];

// Elke productfoto wordt opgehaald; de volledige collectie (300+ foto's) mag
// wat langer duren dan de standaard-timeout.
export const maxDuration = 60;

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const url = new URL(req.url);
  const category = url.searchParams.get("category") || "";
  const langParam = (url.searchParams.get("lang") ?? "nl").toLowerCase();
  const locale: BrochureLocale = LOCALES.includes(langParam as BrochureLocale)
    ? (langParam as BrochureLocale)
    : "nl";

  const { items, meta, total } = await buildWholesaleItems(category || "ALL");
  if (total === 0) {
    return NextResponse.json({ error: "geen wandpanelen gevonden" }, { status: 404 });
  }

  const pdf = await renderWholesaleBrochure({ items, meta, locale });
  const serie = category ? "-" + category.toLowerCase().replace(/\s+/g, "-") : "";
  const filename = `flexibel-stone-groothandel-${locale}${serie}.pdf`.replace(/[^a-z0-9.-]/gi, "-");
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
