/**
 * Dagtaken: de automatische "wat moet er gebeuren"-signalen, als één bron
 * voor zowel het dashboard als de persoonlijke startpagina. Verhuisd uit
 * app/(app)/page.tsx zodat beide pagina's gegarandeerd hetzelfde tonen.
 *
 * Elke Dagtaak is een volledige NL-zin; `aantal` staat er los bij zodat de
 * weergave het getal vet kan zetten (<strong>{aantal}</strong> {tekst}).
 */
import "server-only";
import { and, count, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { OFFERTE_TE_FACTUREREN } from "@/lib/quote-status";
import { documents, purchaseInvoiceReviews, purchaseOrders, quoteRequests, timeEntries } from "@/lib/db/schema";
import { normalizeDocItems } from "@/lib/documents";
import { PO_OPEN_STATUSES } from "@/lib/purchase-orders";
import { formatEUR } from "@/lib/utils";

export type DagtaakTone = "accent" | "warning" | "danger" | "success";
export type DagtaakPrioriteit = "hoog" | "middel" | "laag";

export interface Dagtaak {
  key: string;
  emoji: string;
  /** Zin ZONDER het voorloopgetal — de weergave zet `aantal` er vet voor. */
  tekst: string;
  href: string;
  tone: DagtaakTone;
  prioriteit: DagtaakPrioriteit;
  aantal: number;
}

const PRIO_VOLGORDE: Record<DagtaakPrioriteit, number> = { hoog: 0, middel: 1, laag: 2 };

/** Vaste werkvolgorde binnen gelijke prioriteit: eerst keuren/controleren
 *  (daar wacht iemand op), dan klantwerk, dan opruimwerk. */
const RANG: Record<string, number> = {
  "vervallen-facturen": 0,
  "inkoopfacturen-keuren": 1,
  "portaal-uren": 2,
  "open-aanvragen": 3,
  "offertes-factureren": 4,
  "voorraad-afboeken": 5,
  "proformas": 6,
  "po-deze-week": 7,
};

export async function verzamelDagtaken(): Promise<Dagtaak[]> {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const openExpr = sql`${documents.status} not in ('paid', 'void', 'draft')`;

  const [[uren], [accepted], [aanvragen], [vervallen], voorraadRows, [proformaAgg], [reviews], openPos] =
    await Promise.all([
      // Portaal-uren die op controle wachten.
      db
        .select({
          n: count(),
          hours: sql<number>`coalesce(sum(${timeEntries.hours}), 0)::float8`,
          projects: sql<number>`count(distinct ${timeEntries.projectId})`,
        })
        .from(timeEntries)
        .where(and(isNotNull(timeEntries.selfLoggedAt), isNull(timeEntries.approvedAt))),
      // Geaccepteerde offertes die klaarstaan om gefactureerd te worden — de
      // offertes waar de factuur al uit gemaakt is horen er niet meer bij.
      db.select({ n: sql<number>`count(*)::int` }).from(documents).where(OFFERTE_TE_FACTUREREN),
      // Open offerte-aanvragen via de website.
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(quoteRequests)
        .where(eq(quoteRequests.status, "pending")),
      // Vervallen verkoopfacturen (openstaand bedrag = totaal − betaald).
      db
        .select({
          n: sql<number>`count(case when ${openExpr} and ${documents.dueDate} < ${today} then 1 end)::int`,
          v: sql<string>`coalesce(sum(case when ${openExpr} and ${documents.dueDate} < ${today} then ${documents.totalEur} - ${documents.paidEur} else 0 end), 0)`,
        })
        .from(documents)
        .where(and(eq(documents.kind, "invoice"), sql`${documents.status} not in ('draft', 'void')`)),
      // Verstuurde/betaalde facturen met productregels waarvan de voorraad nog
      // niet is afgeboekt — productregels checken we in JS (jsonb-veilig).
      db
        .select({ id: documents.id, items: documents.items })
        .from(documents)
        .where(
          and(
            eq(documents.kind, "invoice"),
            inArray(documents.status, ["sent", "paid", "partially_paid", "overdue"]),
            isNull(documents.stockAppliedAt),
          ),
        ),
      // Proforma's die op goedkeuring wachten.
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(purchaseOrders)
        .where(eq(purchaseOrders.status, "draft")),
      // Inkoopfacturen die op goedkeuring wachten (nog niet in purchase_orders).
      db
        .select({
          n: sql<number>`count(*)::int`,
          afkeuren: sql<number>`count(*) filter (where verdict = 'reject')::int`,
          onleesbaar: sql<number>`count(*) filter (where verdict = 'unreadable')::int`,
          oudsteDagen: sql<number>`coalesce(max(extract(day from now() - created_at)), 0)::int`,
        })
        .from(purchaseInvoiceReviews)
        .where(eq(purchaseInvoiceReviews.status, "pending")),
      // Open inkooporders — voor "komt deze week binnen".
      db
        .select({ expectedDate: purchaseOrders.expectedDate })
        .from(purchaseOrders)
        .where(inArray(purchaseOrders.status, PO_OPEN_STATUSES)),
    ]);

  const voorraadN = voorraadRows.filter((d) =>
    normalizeDocItems(d.items).some((it) => it.productId && it.units),
  ).length;
  const poSoon = openPos.filter((po) => {
    if (!po.expectedDate) return false;
    const diff = (new Date(po.expectedDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return diff <= 7 && diff >= -1;
  }).length;

  const ev = (n: number, enkel: string, meer: string) => (n === 1 ? enkel : meer);
  const taken: Dagtaak[] = [];

  if ((vervallen?.n ?? 0) > 0) {
    taken.push({
      key: "vervallen-facturen",
      emoji: "⏰",
      tekst: `vervallen factu${ev(vervallen.n, "ur", "ren")} (${formatEUR(vervallen.v)}) — verstuur herinnering.`,
      href: "/invoices",
      tone: "danger",
      prioriteit: "hoog",
      aantal: vervallen.n,
    });
  }
  if ((reviews?.n ?? 0) > 0) {
    const oud = (reviews.oudsteDagen ?? 0) >= 7;
    taken.push({
      key: "inkoopfacturen-keuren",
      emoji: "🧾",
      tekst:
        `inkoopfactu${ev(reviews.n, "ur", "ren")} wacht${ev(reviews.n, "", "en")} op goedkeuring` +
        ((reviews.afkeuren ?? 0) > 0 ? ` · ${reviews.afkeuren} incompleet` : "") +
        ((reviews.onleesbaar ?? 0) > 0 ? ` · ${reviews.onleesbaar} niet gelezen` : "") +
        (oud ? ` · oudste wacht ${reviews.oudsteDagen} dagen` : "") +
        ".",
      href: "/inkooporders/te-verwerken",
      tone: oud ? "danger" : "warning",
      prioriteit: oud ? "hoog" : "middel",
      aantal: reviews.n,
    });
  }
  if ((uren?.n ?? 0) > 0) {
    taken.push({
      key: "portaal-uren",
      emoji: "⏱",
      tekst: `portaal-urenregel${ev(uren.n, "", "s")} (${Number(uren.hours).toLocaleString("nl-NL")} uur, ${uren.projects} project${Number(uren.projects) === 1 ? "" : "en"}) te controleren.`,
      href: "/projects",
      tone: "warning",
      prioriteit: "middel",
      aantal: uren.n,
    });
  }
  if ((accepted?.n ?? 0) > 0) {
    taken.push({
      key: "offertes-factureren",
      emoji: "✅",
      tekst: `geaccepteerde offerte${ev(accepted.n, "", "s")} — klaar om te factureren.`,
      href: "/quotes",
      tone: "success",
      prioriteit: "middel",
      aantal: accepted.n,
    });
  }
  if ((aanvragen?.n ?? 0) > 0) {
    taken.push({
      key: "open-aanvragen",
      emoji: "📩",
      tekst: `open offerte-aanvra${ev(aanvragen.n, "ag", "gen")} via de website.`,
      href: "/aanvragen?status=pending",
      tone: "accent",
      prioriteit: "middel",
      aantal: aanvragen.n,
    });
  }
  if (voorraadN > 0) {
    taken.push({
      key: "voorraad-afboeken",
      emoji: "📦",
      tekst: `verstuurde/betaalde factu${ev(voorraadN, "ur", "ren")} met productregels — voorraad nog niet afgeboekt.`,
      href: "/invoices",
      tone: "warning",
      prioriteit: "middel",
      aantal: voorraadN,
    });
  }
  if ((proformaAgg?.n ?? 0) > 0) {
    taken.push({
      key: "proformas",
      emoji: "🗂️",
      tekst: `proforma${ev(proformaAgg.n, "", "'s")} wacht${ev(proformaAgg.n, "", "en")} op goedkeuring.`,
      href: "/inkooporders",
      tone: "accent",
      prioriteit: "laag",
      aantal: proformaAgg.n,
    });
  }
  if (poSoon > 0) {
    taken.push({
      key: "po-deze-week",
      emoji: "📦",
      tekst: `inkooporder${ev(poSoon, "", "s")} kom${ev(poSoon, "t", "en")} deze week binnen.`,
      href: "/inkooporders",
      tone: "accent",
      prioriteit: "laag",
      aantal: poSoon,
    });
  }

  return taken.sort(
    (a, b) =>
      PRIO_VOLGORDE[a.prioriteit] - PRIO_VOLGORDE[b.prioriteit] ||
      (RANG[a.key] ?? 99) - (RANG[b.key] ?? 99),
  );
}
