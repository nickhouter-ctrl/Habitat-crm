"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { requireWriteUser } from "@/lib/auth/guards";

import { auth } from "@/auth";
import { extractInvoiceFieldsWithAI } from "@/lib/ai-invoice-extract";
import { extractAttachmentAmount } from "@/lib/amount-extract";
import { db } from "@/lib/db";
import { activities, emailInbox, mailAttachments, purchaseOrders, quoteRequests } from "@/lib/db/schema";
import { pushPurchaseOrderToHolded } from "@/lib/holded/sync";
import { runImapPoll, type ImapPollResult } from "@/lib/imap-poll";
import { copyMailAttachmentToPoBucket } from "@/lib/storage";

async function requireUser() {
  // Centrale guard: ingelogd én geen alleen-lezen (viewer) account.
  return requireWriteUser();
}

/** Link de mail aan een purchase order. Optioneel zet PO direct op "in_transit". */
export async function linkMailToPurchaseOrder(args: {
  emailId: string;
  purchaseOrderId: string;
  setInTransit?: boolean;
}) {
  const user = await requireUser();
  await db
    .update(emailInbox)
    .set({ linkedPurchaseOrderId: args.purchaseOrderId, status: "linked", updatedAt: new Date() })
    .where(eq(emailInbox.id, args.emailId));

  if (args.setInTransit) {
    await db
      .update(purchaseOrders)
      .set({ status: "in_transit", updatedAt: new Date() })
      .where(eq(purchaseOrders.id, args.purchaseOrderId));
  }

  const mail = await db.query.emailInbox.findFirst({ where: eq(emailInbox.id, args.emailId) });
  const po = await db.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, args.purchaseOrderId) });
  await db.insert(activities).values({
    type: "note",
    subject: `Mail gelinkt aan PO ${po?.supplier ?? ""} ${po?.reference ?? ""}`.trim(),
    body: `Van: ${mail?.fromEmail ?? "?"}\nOnderwerp: ${mail?.subject ?? "?"}${args.setInTransit ? "\n\nPO-status: onderweg" : ""}`,
    authorId: user.id,
  });

  revalidatePath("/inbox");
  revalidatePath(`/inbox/${args.emailId}`);
  revalidatePath(`/inkooporders/${args.purchaseOrderId}`);
}

/** Link de mail aan een offerte-aanvraag (customer ticket). */
export async function linkMailToQuoteRequest(args: { emailId: string; quoteRequestId: string }) {
  const user = await requireUser();
  await db
    .update(emailInbox)
    .set({ linkedQuoteRequestId: args.quoteRequestId, status: "linked", updatedAt: new Date() })
    .where(eq(emailInbox.id, args.emailId));

  const mail = await db.query.emailInbox.findFirst({ where: eq(emailInbox.id, args.emailId) });
  await db.insert(activities).values({
    type: "note",
    subject: `Mail gelinkt aan offerte-aanvraag`,
    body: `Van: ${mail?.fromEmail ?? "?"}\nOnderwerp: ${mail?.subject ?? "?"}`,
    authorId: user.id,
  });

  revalidatePath("/inbox");
  revalidatePath(`/inbox/${args.emailId}`);
  revalidatePath(`/aanvragen/${args.quoteRequestId}`);
}

/** Markeer als gearchiveerd. */
export async function archiveMail(emailId: string) {
  await requireUser();
  await db
    .update(emailInbox)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(emailInbox.id, emailId));
  revalidatePath("/inbox");
  revalidatePath(`/inbox/${emailId}`);
}

/** Terug naar "new". */
export async function reopenMail(emailId: string) {
  await requireUser();
  await db
    .update(emailInbox)
    .set({
      status: "new",
      linkedPurchaseOrderId: null,
      linkedQuoteRequestId: null,
      updatedAt: new Date(),
    })
    .where(eq(emailInbox.id, emailId));
  revalidatePath("/inbox");
  revalidatePath(`/inbox/${emailId}`);
}

/** Update notities. */
export async function saveMailNotes(emailId: string, notes: string) {
  await requireUser();
  await db
    .update(emailInbox)
    .set({ notes, updatedAt: new Date() })
    .where(eq(emailInbox.id, emailId));
  revalidatePath(`/inbox/${emailId}`);
}

/**
 * Maak een inkoopfactuur uit een mail-bijlage en push 'm naar Holded.
 * - Probeert bedrag te extraheren via amount-extract (PDF/Excel)
 * - Maakt nieuwe purchase_orders row met status='received' (factuur ontvangen)
 * - Linkt de mail aan deze PO
 * - Best-effort push naar Holded — laat lokale PO bestaan als push faalt
 */
/** Leid een nette leveranciersnaam af uit een e-mailadres ("…@prosperplast.pl" → "Prosperplast"). */
function supplierNameFromEmail(email: string | null | undefined): string | null {
  const domain = email?.split("@")[1]?.trim();
  if (!domain) return email?.trim() || null;
  const main = domain.split(".").slice(-2, -1)[0] ?? domain.split(".")[0];
  if (!main) return email?.trim() || null;
  return main.charAt(0).toUpperCase() + main.slice(1);
}

export async function createPurchaseInvoiceFromMail(args: {
  emailId: string;
  attachmentId: string;
  /** True = proforma: concept-inkooporder dat op goedkeuring wacht; niet naar Holded. */
  asProforma?: boolean;
  /** Override: supplier / reference / amount als de extractie iets verkeerd haalt */
  override?: { supplier?: string; reference?: string; total?: number };
}): Promise<{ purchaseOrderId: string; holdedId: string | null; total: number; holdedError?: string }> {
  const user = await requireUser();

  const mail = await db.query.emailInbox.findFirst({ where: eq(emailInbox.id, args.emailId) });
  if (!mail) throw new Error("Mail niet gevonden");

  const att = await db.query.mailAttachments.findFirst({ where: eq(mailAttachments.id, args.attachmentId) });
  if (!att) throw new Error("Bijlage niet gevonden");

  // 1. Probeer bedrag uit PDF/Excel te halen
  let total = args.override?.total ?? 0;
  if (total <= 0) {
    const extracted = att.amountEur ? Number(att.amountEur) : await extractAttachmentAmount({
      storagePath: att.storagePath,
      filename: att.filename,
      contentType: att.contentType ?? "",
    });
    if (extracted && extracted > 0) total = extracted;
  }

  // AI-fallback wanneer de regels het bedrag of de leverancier niet vonden — bv.
  // facturen die Creadores alleen dóórstuurt: de échte leverancier staat in de
  // PDF/Excel, niet in de mail. Draait alleen als er nog data ontbreekt.
  const ruleSupplier = args.override?.supplier?.trim() || att.supplierTag?.trim();
  let aiSupplier: string | null = null;
  let aiInvoiceNumber: string | null = null;
  let aiCurrency: string | null = null;
  if (!args.override?.supplier && (total <= 0 || !ruleSupplier)) {
    const ai = await extractInvoiceFieldsWithAI({
      storagePath: att.storagePath,
      filename: att.filename,
      contentType: att.contentType ?? "",
    });
    if (ai) {
      if (total <= 0 && ai.total != null && ai.total > 0) total = ai.total;
      aiSupplier = ai.supplier;
      aiInvoiceNumber = ai.invoiceNumber;
      aiCurrency = ai.currency;
    }
  }

  // Let op: `||` i.p.v. `??` — een lege string ("") moet óók doorvallen,
  // anders krijg je een lege leverancier als de mail geen afzendernaam heeft.
  // AI-leverancier gaat vóór de mail-afzender (die is bij doorgestuurde
  // facturen de doorstuurder, niet de echte leverancier).
  const supplier =
    args.override?.supplier?.trim() ||
    att.supplierTag?.trim() ||
    aiSupplier?.trim() ||
    mail.fromName?.trim() ||
    supplierNameFromEmail(mail.fromEmail) ||
    "Onbekende leverancier";

  // Probeer factuurnummer uit filename te halen — anders AI-factuurnummer, anders filename
  const refMatch = att.filename.match(/(?:FAC[_-]?|Factura[_\s]*|Invoice[_\s]*)([\w\d-]+)/i);
  const reference =
    args.override?.reference ??
    (aiInvoiceNumber
      ? `${supplier} ${aiInvoiceNumber}`.replace(/\s+/g, " ").trim()
      : (refMatch?.[1] ?? att.filename.replace(/\.[a-z]+$/i, "")));

  // Dedup: bestaat er al een inkooporder met dit factuurnummer? Dezelfde factuur
  // komt soms via beide mailboxen (hi@ + purchase@) binnen — dan koppelen we de
  // mail aan de bestaande inkooporder i.p.v. een dubbele aan te maken.
  const existingPo = await db.query.purchaseOrders.findFirst({
    where: eq(purchaseOrders.reference, reference),
  });
  if (existingPo) {
    await db
      .update(emailInbox)
      .set({ linkedPurchaseOrderId: existingPo.id, status: "linked", updatedAt: new Date() })
      .where(eq(emailInbox.id, args.emailId));
    await db.insert(activities).values({
      type: "note",
      subject: `Mail gekoppeld aan bestaande inkoopfactuur: ${existingPo.supplier} ${reference}`,
      body: "Dubbele inkoopfactuur voorkomen — deze mail wijst naar de al bestaande inkooporder.",
      authorId: user.id,
    });
    revalidatePath("/");
    revalidatePath("/inbox");
    revalidatePath(`/inbox/${args.emailId}`);
    revalidatePath("/inkooporders");
    return {
      purchaseOrderId: existingPo.id,
      holdedId: existingPo.holdedId ?? null,
      total: Number(existingPo.total ?? 0),
    };
  }

  // 2a. Kopieer het bron-bestand naar de PO-bucket zodat het ook aan de PO hangt
  const copied = await copyMailAttachmentToPoBucket({
    mailStoragePath: att.storagePath,
    filename: att.filename,
  });

  // 2b. Insert lokaal. Inkoopfactuur → 'received'; proforma → 'draft' (wacht op
  //     goedkeuring). Vervaldatum standaard 30 dagen na ontvangst.
  const isProforma = !!args.asProforma;
  const baseDate = att.receivedAt ?? mail.receivedAt ?? new Date();
  const orderDate = baseDate.toISOString().slice(0, 10);
  const dueDate = isProforma
    ? null
    : new Date(baseDate.getTime() + 30 * 864e5).toISOString().slice(0, 10);
  const [po] = await db
    .insert(purchaseOrders)
    .values({
      supplier,
      reference,
      status: isProforma ? "draft" : "received",
      currency: aiCurrency || "EUR",
      orderDate,
      dueDate,
      receivedAt: isProforma ? null : baseDate,
      total: String(total.toFixed(2)),
      items: [
        {
          name: mail.subject ?? `Factuur ${reference}`,
          units: 1,
          unitPrice: total,
          note: `Bron: ${att.filename}`,
        },
      ],
      attachments: copied
        ? [{ name: copied.name, path: copied.path, size: copied.size, uploadedAt: new Date().toISOString() }]
        : [],
      notes: `Aangemaakt uit mail ${mail.subject ?? ""} (${mail.fromEmail ?? ""}). Bijlage: ${att.filename}`,
      stockAppliedAt: new Date(), // markeer dat we GEEN voorraad bijwerken
    })
    .returning({ id: purchaseOrders.id });

  // 3. Link mail → PO
  await db
    .update(emailInbox)
    .set({ linkedPurchaseOrderId: po.id, status: "linked", updatedAt: new Date() })
    .where(eq(emailInbox.id, args.emailId));

  // 4. Activity log
  await db.insert(activities).values({
    type: "note",
    subject: `${isProforma ? "Proforma" : "Inkoopfactuur"} toegevoegd: ${supplier} ${reference}`,
    body: `Bedrag: €${total.toFixed(2)}\nBron: ${att.filename}\nMail: ${mail.subject ?? ""}`,
    authorId: user.id,
  });

  // 5. Best-effort push naar Holded — alleen echte facturen, geen proforma's.
  let holdedId: string | null = null;
  let holdedError: string | undefined;
  if (!isProforma) {
    try {
      holdedId = await pushPurchaseOrderToHolded(po.id);
    } catch (e) {
      holdedError = e instanceof Error ? e.message : String(e);
      console.error("[createPurchaseInvoiceFromMail] Holded push failed:", holdedError);
    }
  }

  revalidatePath("/");
  revalidatePath("/inbox");
  revalidatePath(`/inbox/${args.emailId}`);
  revalidatePath("/inkooporders");
  revalidatePath(`/inkooporders/${po.id}`);

  return { purchaseOrderId: po.id, holdedId, total, holdedError };
}

/** Handmatig mails ophalen — handig om niet op de kwartier-cron te wachten. */
export async function fetchMails(): Promise<ImapPollResult> {
  await requireUser();
  const result = await runImapPoll();
  revalidatePath("/inbox");
  return result;
}
