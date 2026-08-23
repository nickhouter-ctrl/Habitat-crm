/**
 * Betaalstatus van inkooporders overnemen uit Holded.
 *
 * Voor elke lokale inkooporder mét holded_id die hier nog onbetaald staat:
 * haal het purchase-document uit Holded en neem de betaling over —
 * status 1 = volledig betaald (paid_at + paid_eur), status 2 of
 * paymentsTotal > 0 = deelbetaling (alleen paid_eur). Zelfde conventies als
 * scripts/betaalsync-inkooporders-holded.ts (verzoek Nick 19-08):
 *  - nummer-guard (geest van 8c14574): wijkt het Holded-docNumber af van de
 *    lokale referentie, dan overslaan en melden — geen betaling van een
 *    verkeerd gekoppeld document overnemen;
 *  - valuta: bedragen via currencyChange terug naar EUR;
 *  - paid_at/paid_eur alleen VOORUIT (een deelbetaling mag groeien, maar
 *    nooit krimpen; paid_at wordt nooit teruggezet).
 *
 * Draait dagelijks mee in de invoice-status-cron en handmatig via de knop
 * "Betalingen ophalen" op /inkooporders.
 */
import "server-only";
import { and, asc, eq, isNotNull, isNull, ne } from "drizzle-orm";
import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { purchaseOrders } from "@/lib/db/schema";
import { holded, HoldedError } from "@/lib/holded/client";

export interface PurchasePaymentSyncResult {
  checked: number;
  fullyPaid: number;
  partial: number;
  unpaid: number;
  deadLinks: number;
  mismatches: number;
  /** Meldingen over overgeslagen orders (dode links, nummer-afwijkingen). */
  issues: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function syncPurchasePaymentsFromHolded(): Promise<PurchasePaymentSyncResult> {
  const rows = await db
    .select({
      id: purchaseOrders.id,
      supplier: purchaseOrders.supplier,
      reference: purchaseOrders.reference,
      total: purchaseOrders.total,
      holdedId: purchaseOrders.holdedId,
    })
    .from(purchaseOrders)
    .where(
      and(
        isNotNull(purchaseOrders.holdedId),
        isNull(purchaseOrders.paidAt),
        ne(purchaseOrders.status, "cancelled"),
      ),
    )
    .orderBy(asc(purchaseOrders.orderDate));

  const result: PurchasePaymentSyncResult = {
    checked: rows.length,
    fullyPaid: 0,
    partial: 0,
    unpaid: 0,
    deadLinks: 0,
    mismatches: 0,
    issues: [],
  };

  for (const row of rows) {
    let doc: unknown;
    try {
      doc = await holded.documents.get("purchase", row.holdedId!);
    } catch (err) {
      // Holded geeft voor verdwenen documenten soms 400 met info "not found".
      const notFound =
        err instanceof HoldedError &&
        (err.status === 404 ||
          (err.status === 400 && /not found/i.test(JSON.stringify(err.body ?? ""))));
      if (notFound) {
        result.deadLinks++;
        result.issues.push(
          `Dode link: ${row.supplier} ${row.reference ?? "(geen ref)"} — Holded-doc bestaat niet meer`,
        );
        continue;
      }
      // Netwerk-/API-fout: per order best-effort, de rest gewoon proberen.
      result.issues.push(
        `Fout bij ${row.supplier} ${row.reference ?? "(geen ref)"}: ${err instanceof Error ? err.message : String(err)}`,
      );
      continue;
    }
    const d = doc as {
      docNumber?: string;
      status?: number;
      total?: number;
      paymentsTotal?: number;
      currency?: string;
      currencyChange?: number;
    };

    // Nummer-guard: lokale referentie kwam oorspronkelijk uit ditzelfde veld.
    const ref = row.reference?.trim();
    const docNum = d.docNumber?.trim();
    if (ref && docNum && ref !== docNum) {
      result.mismatches++;
      result.issues.push(
        `Nummer wijkt af: ${row.supplier} — lokaal "${ref}" vs Holded "${docNum}", koppeling controleren`,
      );
      continue;
    }

    const isEur = (d.currency ?? "EUR") === "EUR";
    const rate = Number(d.currencyChange) || 1;
    const toEur = (v: unknown) => (isEur ? Number(v ?? 0) : r2(Number(v ?? 0) / rate));
    const betaald = toEur(d.paymentsTotal);
    const volledigBetaald = d.status === 1;

    if (!volledigBetaald && betaald <= 0) {
      result.unpaid++;
      continue;
    }

    const lokaalTotaal = Number(row.total ?? 0);
    const paidEur = betaald !== 0 ? betaald : toEur(d.total);
    // Status 1 zonder enig bedrag (leeg Holded-doc): geen bewijs van betaling.
    if (paidEur === 0) {
      result.mismatches++;
      result.issues.push(
        `Geen bedrag: ${row.supplier} ${ref ?? "(geen ref)"} — Holded zegt betaald maar zonder bedrag, doc controleren`,
      );
      continue;
    }
    // Fors boven het lokale totaal = vrijwel zeker een verkeerde koppeling.
    if (lokaalTotaal > 0 && paidEur > lokaalTotaal * 1.5) {
      result.mismatches++;
      result.issues.push(
        `Afwijkend bedrag: ${row.supplier} ${ref ?? "(geen ref)"} — lokaal € ${lokaalTotaal} maar Holded betaald € ${paidEur.toFixed(2)}, koppeling controleren`,
      );
      continue;
    }

    await db
      .update(purchaseOrders)
      .set({
        paidEur: sql`greatest(coalesce(${purchaseOrders.paidEur}, 0), ${String(r2(paidEur))}::numeric)`,
        ...(volledigBetaald ? { paidAt: new Date() } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(purchaseOrders.id, row.id), isNull(purchaseOrders.paidAt)));

    if (volledigBetaald) result.fullyPaid++;
    else result.partial++;
  }

  return result;
}
