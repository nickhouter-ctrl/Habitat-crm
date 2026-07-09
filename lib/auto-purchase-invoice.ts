/**
 * Automatische aanmaak van inkoopfacturen uit binnenkomende mail-bijlagen.
 *
 * Wordt aangeroepen vanuit de cron-poller. Beslist of een mail-bijlage
 * voldoende vertrouwen biedt om er direct een `purchase_orders` record uit
 * te maken (status='received'), of dat 'm doorzetten naar manual review.
 *
 * Push naar Holded gebeurt NIET automatisch — dat doet de gebruiker via de
 * "Sync naar Holded"-knop op /inkooporders.
 */
import { eq } from "drizzle-orm";

import { extractInvoiceFieldsWithAI } from "@/lib/ai-invoice-extract";
import { db } from "@/lib/db";
import { rateToEur } from "@/lib/fx";
import { activities, emailInbox, mailAttachments, projects, properties, purchaseOrders } from "@/lib/db/schema";
import { buildInvoicePdfAttachment, isExcelAttachment } from "@/lib/excel-to-pdf";
import { copyMailAttachmentToPoBucket, downloadMailAttachmentBuffer } from "@/lib/storage";

const FINANCIAL_CATEGORIES = new Set([
  "supplier-invoice",
  "freight-invoice",
  "agent-fee-china",
  "agent-fee-spain",
  "opex",
]);

/**
 * Proforma's / offertes zijn NOOIT een te-betalen post: bij Allpack-orders is
 * hún factuur leidend (handling + goederen), de leverancier-proforma sturen ze
 * alleen mee ter controle. Zulke bijlages mogen dus geen inkoopfactuur worden,
 * ook niet als er per ongeluk een bedrag uit te lezen valt.
 */
function isProformaOrQuote(filename: string): boolean {
  return /\bproforma\b|\bquotation\b|\bquote\b|^PI[\s._-]|\bPI\s+for\b/i.test(filename);
}

export interface AutoInvoiceResult {
  created: number;
  needsReview: number;
  errors: string[];
}

/**
 * Bouw een nette referentie "Fabrieksnaam Factuurnummer" uit het mail-onderwerp.
 *
 * Agent-facturen (Allpack) hebben onderwerpen als:
 *   "PI +CI for PJ0050481-22044646 ,Factory:GEORGELIGHTING&ELECTRICITY"
 * → wordt "Georgelighting PJ0050481-22044646".
 *
 * Valt terug op de bestandsnaam als het onderwerp geen herkenbaar patroon
 * heeft, zodat leveranciers met een net factuurnummer in de bestandsnaam
 * (SHN, Hollandse Meesters, ...) ongewijzigd blijven. Handling-cost-facturen
 * krijgen een suffix zodat ze los van de goederenfactuur herkenbaar blijven.
 */
export function buildPurchaseReference(subject: string | null, filename: string): string {
  const subj = (subject ?? "").trim();
  // Factuurnummer: na "for " het eerste code-achtige token (bevat een cijfer).
  const numMatch = subj.match(/\bfor\s+([A-Za-z0-9][\w./-]*\d[\w./-]*)/i);
  // Fabriek: na "Factory:" tot komma/regeleinde.
  const facMatch = subj.match(/Factory\s*[:：]\s*([^,\n]+)/i);

  let base: string;
  if (numMatch) {
    const invoiceNo = numMatch[1].replace(/[.,;]+$/, "");
    const factory = facMatch ? cleanFactoryName(facMatch[1]) : "";
    base = factory ? `${factory} ${invoiceNo}` : invoiceNo;
  } else {
    // Nummer moet met een cijfer beginnen — voorkomt dat "factuur…" de
    // "FAC"-prefix triggert en "tuur" oplevert.
    const refMatch = filename.match(/(?:FAC[_-]?|Factura[_\s]*|Invoice[_\s]*)(\d[\w-]*)/i);
    base = refMatch?.[1] ?? filename.replace(/\.[a-z]+$/i, "");
  }

  // Handling-cost-factuur apart herkenbaar maken (zelfde order, eigen regel).
  if (/handling/i.test(filename)) base += " (handlingcost)";
  return base.trim();
}

/** Maak een fabrieksnaam leesbaar: drop "&…"-staart en Co./Ltd, en title-case. */
function cleanFactoryName(raw: string): string {
  let s = raw.split("&")[0].trim();
  s = s.replace(/[,\s]*\b(Co\.?,?\s*Ltd\.?|Limited|Inc\.?|Company|LLC)\b/gi, "").trim();
  s = s.replace(/\s{2,}/g, " ").replace(/[.,\s]+$/, "");
  return s.replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

export async function tryAutoCreatePurchaseInvoice(emailId: string): Promise<AutoInvoiceResult> {
  const result: AutoInvoiceResult = { created: 0, needsReview: 0, errors: [] };

  const mail = await db.query.emailInbox.findFirst({ where: eq(emailInbox.id, emailId) });
  if (!mail) return result;
  if (mail.linkedPurchaseOrderId) return result; // al gelinkt

  // Alleen mails aan het Purchase-postvak (purchase@habitat-one.com) worden
  // automatisch in de inkoop gezet. Mails aan hi@ blijven puur in de inbox/het
  // archief — die zet je desgewenst handmatig in inkoop.
  const toPurchase = /purchase@habitat-one\.com/i.test(
    `${mail.toEmail ?? ""} ${mail.ccEmail ?? ""}`,
  );
  if (!toPurchase) return result;

  const atts = await db
    .select()
    .from(mailAttachments)
    .where(eq(mailAttachments.emailId, emailId));

  // AI-fallback: financiële, niet-proforma factuur-bijlages die de regels niet
  // konden duiden (geen leverancier óf geen bedrag) — bv. facturen die Creadores
  // alleen dóórstuurt — laten we Claude uitlezen. De échte leverancier + bedrag
  // staan dan in de PDF/Excel zelf. Draait dus alleen voor wat de regels missen.
  const aiMeta = new Map<
    string,
    {
      invoiceNumber: string | null;
      currency: string | null;
      total: number | null;
      subtotal: number | null;
      isLabor: boolean | null;
      hours: number | null;
      projectHint: string | null;
    }
  >();
  for (const a of atts) {
    if (!FINANCIAL_CATEGORIES.has(a.category)) continue;
    if (isProformaOrQuote(a.filename)) continue;
    const isDoc =
      a.contentType === "application/pdf" ||
      /\.pdf$/i.test(a.filename) ||
      isExcelAttachment(a.filename, a.contentType);
    if (!isDoc) continue;
    const needsSupplier = a.supplierTag == null;
    const needsAmount = a.amountEur == null || Number(a.amountEur) <= 0;
    // We draaien de AI óók als leverancier/bedrag al bekend zijn, puur om de
    // VALUTA betrouwbaar te detecteren — anders zou een USD-factuur als EUR
    // worden opgeslagen.

    try {
      const ai = await extractInvoiceFieldsWithAI({
        storagePath: a.storagePath,
        filename: a.filename,
        contentType: a.contentType ?? "",
      });
      if (!ai) continue;
      const patch: { supplierTag?: string; amountEur?: string } = {};
      if (needsSupplier && ai.supplier) {
        a.supplierTag = ai.supplier;
        patch.supplierTag = ai.supplier;
      }
      if (needsAmount && ai.total != null && ai.total > 0) {
        a.amountEur = String(ai.total);
        patch.amountEur = String(ai.total);
      }
      aiMeta.set(a.id, {
        invoiceNumber: ai.invoiceNumber,
        currency: ai.currency,
        total: ai.total,
        subtotal: ai.subtotal,
        isLabor: ai.isLabor,
        hours: ai.hours,
        projectHint: ai.projectHint,
      });
      if (Object.keys(patch).length > 0) {
        await db.update(mailAttachments).set(patch).where(eq(mailAttachments.id, a.id));
      }
    } catch (e) {
      console.warn("AI-factuuruitlezing mislukt:", e instanceof Error ? e.message : e);
    }
  }

  // Vind kandidaten: financiële bijlages met bedrag + supplier.
  // Proforma's/offertes uitgesloten — die zijn ter controle (Allpack's eigen
  // factuur is leidend), nooit een aparte te-betalen post.
  const candidates = atts.filter(
    (a) =>
      FINANCIAL_CATEGORIES.has(a.category) &&
      a.amountEur != null &&
      Number(a.amountEur) > 0 &&
      a.supplierTag != null &&
      !isProformaOrQuote(a.filename),
  );

  // Heeft de mail financiële bijlagen maar onvoldoende data? → needs review
  const hasFinancial = atts.some((a) => FINANCIAL_CATEGORIES.has(a.category));
  if (hasFinancial && candidates.length === 0) {
    result.needsReview = 1;
    return result;
  }

  // Projecten preloaden (incl. gekoppeld pand + werf-alias) om de AI-projecthint
  // te matchen — óók op adres/pand/werf, niet alleen de projectnaam.
  const allProjects = await db
    .select({
      id: projects.id,
      name: projects.name,
      code: projects.code,
      siteAlias: projects.siteAlias,
      propTitle: properties.title,
      propRef: properties.reference,
      propLoc: properties.location,
    })
    .from(projects)
    .leftJoin(properties, eq(projects.propertyId, properties.id));
  const matchProject = (hint: string | null): string | null => {
    if (!hint) return null;
    const h = hint.toLowerCase().trim();
    if (h.length < 3) return null;
    const m = allProjects.find((p) => {
      const needles = [p.name, p.code, p.siteAlias, p.propTitle, p.propRef, p.propLoc]
        .flatMap((v) => (v ? v.split(/[,;/]/) : []))
        .map((v) => v.trim().toLowerCase())
        .filter((v) => v.length >= 3);
      return needles.some((n) => h.includes(n) || n.includes(h));
    });
    return m?.id ?? null;
  };

  for (const a of candidates) {
    try {
      const ai = aiMeta.get(a.id);
      // Bij AI-uitgelezen facturen een nette referentie "Leverancier factuurnr".
      const reference = ai?.invoiceNumber
        ? `${a.supplierTag} ${ai.invoiceNumber}`.replace(/\s+/g, " ").trim()
        : buildPurchaseReference(mail.subject, a.filename);

      // Valuta-agent: alles wordt in EUR opgeslagen. Detecteert de AI een vreemde
      // valuta, dan rekenen we het AI-uitgelezen bedrag (in factuurvaluta) om naar
      // EUR — zo wordt een USD-factuur nooit meer als EUR opgeslagen.
      const detectedCur = (ai?.currency || "EUR").toUpperCase();
      let total = Number(a.amountEur);
      let subtotal = ai?.subtotal ?? null; // base imponible (ex. BTW), voor arbeidskosten
      let originalNote = "";
      if (detectedCur !== "EUR" && ai?.total != null && ai.total > 0) {
        const rate = await rateToEur(detectedCur);
        total = Math.round(ai.total * rate * 100) / 100;
        if (subtotal != null) subtotal = Math.round(subtotal * rate * 100) / 100;
        originalNote = ` · origineel ${detectedCur} ${ai.total.toFixed(2)} (koers ${rate})`;
      }
      const currency = "EUR";

      // Dedupe: skip ALS er al een PO bestaat met deze reference (ongeacht
      // supplier-spelling). Bij conflict liever de bestaande PO linken aan
      // de mail, dan dubbele records aanmaken.
      const existing = await db.query.purchaseOrders.findFirst({
        where: eq(purchaseOrders.reference, reference),
      });
      if (existing) {
        // Link mail aan de bestaande PO i.p.v. nieuwe aanmaken
        await db
          .update(emailInbox)
          .set({ linkedPurchaseOrderId: existing.id, status: "linked", updatedAt: new Date() })
          .where(eq(emailInbox.id, emailId));
        continue;
      }

      // Kopieer bron-bestand naar PO-bucket
      const copied = await copyMailAttachmentToPoBucket({
        mailStoragePath: a.storagePath,
        filename: a.filename,
      });

      const poAttachments = copied
        ? [{ name: copied.name, path: copied.path, size: copied.size, uploadedAt: new Date().toISOString() }]
        : [];

      // Excel-factuur → ook een leesbare PDF genereren en bijvoegen.
      if (isExcelAttachment(a.filename, a.contentType)) {
        try {
          const xbuf = await downloadMailAttachmentBuffer(a.storagePath);
          const pdfAtt = xbuf ? await buildInvoicePdfAttachment(xbuf, a.filename) : null;
          if (pdfAtt) poAttachments.push(pdfAtt);
        } catch (e) {
          console.error("Excel→PDF (auto) mislukt:", e instanceof Error ? e.message : e);
        }
      }

      const [po] = await db
        .insert(purchaseOrders)
        .values({
          supplier: a.supplierTag!,
          reference,
          status: "received",
          currency,
          orderDate: (a.receivedAt ?? mail.receivedAt ?? new Date()).toISOString().slice(0, 10),
          receivedAt: a.receivedAt ?? mail.receivedAt ?? new Date(),
          total: String(total.toFixed(2)),
          subtotal: subtotal != null ? String(subtotal.toFixed(2)) : null,
          items: [
            {
              name: mail.subject ?? `Factuur ${reference}`,
              units: 1,
              unitPrice: total,
              note: `Bron: ${a.filename}${originalNote}`,
            },
          ],
          attachments: poAttachments,
          notes: `Auto-aangemaakt uit mail "${mail.subject ?? ""}" (${mail.fromEmail ?? ""}). Bijlage: ${a.filename}${originalNote}`,
          stockAppliedAt: new Date(), // GEEN voorraadmutatie
          // AI-suggestie: welk project + of het uren of materiaal lijkt, zodat je
          // het met één klik kunt bevestigen op de inkooporder-pagina.
          suggestedProjectId: matchProject(ai?.projectHint ?? null),
          suggestedKind: ai?.isLabor === true ? "labor" : ai?.isLabor === false ? "material" : null,
          suggestedHours: ai?.hours != null ? String(ai.hours) : null,
        })
        .returning({ id: purchaseOrders.id });

      // Link mail aan deze PO als nog niet gelinkt
      if (!mail.linkedPurchaseOrderId) {
        await db
          .update(emailInbox)
          .set({ linkedPurchaseOrderId: po.id, status: "linked", updatedAt: new Date() })
          .where(eq(emailInbox.id, emailId));
      }

      await db.insert(activities).values({
        type: "note",
        subject: `Auto-aangemaakte inkoopfactuur: ${a.supplierTag} ${reference}`,
        body: `Bedrag: €${total.toFixed(2)}\nBron: ${a.filename}\nNog niet naar Holded gesynced.`,
      });

      result.created++;
    } catch (e) {
      result.errors.push(`${a.filename}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return result;
}
