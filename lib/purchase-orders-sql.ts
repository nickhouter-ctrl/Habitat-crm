/**
 * SQL-variant van {@link poExVat} — voor aggregaties die in de database gebeuren
 * (dashboard, projectenlijst, rapportages). Houd deze exact gelijk aan de
 * TypeScript-versie in `lib/purchase-orders.ts`.
 *
 * Aparte module omdat `lib/purchase-orders.ts` ook in client-componenten wordt
 * geïmporteerd; drizzle hoort niet in die bundel.
 */
import { sql } from "drizzle-orm";
import { purchaseOrders } from "@/lib/db/schema";

/** Bestelling met catalogusregels → stukprijzen zijn inkoopprijzen (al ex. btw). */
const hasCatalogueLines = sql`jsonb_typeof(${purchaseOrders.items}) = 'array' and exists (
  select 1 from jsonb_array_elements(${purchaseOrders.items}) as line
  where nullif(line->>'productId', '') is not null
)`;

/**
 * Bedrag ex. btw van een inkooporder-rij: subtotaal → totaal − btw → totaal.
 * Zie {@link poExVat} voor waarom er in de laatste stap NIET door 1,21 gedeeld wordt.
 */
export const poExVatSql = sql`coalesce(
  nullif(${purchaseOrders.subtotal}, 0),
  case
    when coalesce(${purchaseOrders.tax}, 0) <> 0 then round(${purchaseOrders.total} - ${purchaseOrders.tax}, 2)
    else ${purchaseOrders.total}
  end,
  0
)`;

/** Rijen waarvan de btw niet bekend is — het bedrag hierboven kan dus incl. btw zijn. */
export const poVatUnknownSql = sql`(
  coalesce(nullif(${purchaseOrders.subtotal}, 0), 0) = 0
  and coalesce(${purchaseOrders.tax}, 0) = 0
  and coalesce(${purchaseOrders.total}, 0) <> 0
  and not (${hasCatalogueLines})
)`;
