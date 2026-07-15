"use server";

import { and, eq, inArray, isNotNull, isNull, notInArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";

import { pushDocumentToHolded, refreshInvoicePaymentFromHolded } from "./sync";

/**
 * "Sync Holded": de VEILIGE tweerichting-synchronisatie.
 *  1. CRM → Holded: facturen/creditnota's die nog niet in Holded staan en al
 *     uitgegeven zijn (niet-concept) worden gepusht. Idempotent — bestaat het
 *     nummer al in Holded, dan koppelt 'ie i.p.v. een dubbele aan te maken.
 *  2. Holded → CRM: voor gekoppelde, nog-openstaande facturen wordt alleen de
 *     BETAALSTAND opgehaald (read-only). We pullen bewust GEEN documenten/projecten
 *     terug — dat veroorzaakte eerder dubbele facturen/projecten.
 */
export async function syncHoldedNow(): Promise<{ ok: boolean; message: string }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Niet ingelogd." };
  }
  if (!process.env.HOLDED_API_KEY) {
    return { ok: false, message: "HOLDED_API_KEY is niet ingesteld (.env.local)." };
  }

  // 1. Nog niet-gekoppelde, uitgegeven facturen/creditnota's naar Holded pushen.
  const toPush = await db
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        inArray(documents.kind, ["invoice", "creditnote"]),
        notInArray(documents.status, ["draft", "void"]),
        isNull(documents.holdedId),
        // Externe facturen (zusterbedrijven) zijn geen Habitat-omzet — nooit pushen.
        eq(documents.isExternal, false),
      ),
    );
  let pushed = 0;
  let pushFailed = 0;
  for (const d of toPush) {
    try {
      await pushDocumentToHolded(d.id);
      pushed++;
    } catch {
      pushFailed++;
    }
  }

  // 2. Betaalstand bijwerken voor gekoppelde, nog-openstaande facturen (read-only).
  const linkedOpen = await db
    .select({ holdedId: documents.holdedId })
    .from(documents)
    .where(
      and(
        eq(documents.kind, "invoice"),
        isNotNull(documents.holdedId),
        notInArray(documents.status, ["paid", "void", "draft"]),
      ),
    );
  let paymentsUpdated = 0;
  for (const d of linkedOpen) {
    if (!d.holdedId) continue;
    try {
      const s = await refreshInvoicePaymentFromHolded(d.holdedId);
      if (s === "paid" || s === "partially_paid") paymentsUpdated++;
    } catch {
      /* per-factuur best-effort */
    }
  }

  revalidatePath("/invoices");
  revalidatePath("/");

  const parts: string[] = [`${pushed} naar Holded gepusht`];
  if (pushFailed) parts.push(`${pushFailed} mislukt`);
  if (paymentsUpdated) parts.push(`${paymentsUpdated} betaling(en) bijgewerkt`);
  return {
    ok: pushFailed === 0,
    message: pushed || paymentsUpdated || pushFailed ? parts.join(" · ") : "Alles was al in sync.",
  };
}
