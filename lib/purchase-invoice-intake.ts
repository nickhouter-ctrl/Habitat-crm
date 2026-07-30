/**
 * De goedkeuringspoort voor binnenkomende inkoopfacturen.
 *
 * Kernregel: `purchase_orders` IS de administratie. Wat nog niet is goedgekeurd
 * staat daar niet in — het staat in `purchase_invoice_reviews` en telt dus
 * nergens mee (niet in projectkosten, niet op het dashboard, niet naar Holded).
 *
 * Dit bestand is de enige plek die uit een mail-bijlage een inkooporder maakt.
 * Vóór de poort deden drie routes dat elk net iets anders, met drie verschillende
 * referentie-opbouw en dus lekkende dubbelcontrole.
 *
 * Bewust géén `server-only`: de scripts in scripts/ moeten deze functies kunnen
 * aanroepen om de poort te testen zonder de hele app te starten.
 */
import { and, desc, eq, isNotNull, ne, sql } from "drizzle-orm";

import { readInvoiceWithAI, type AiInvoiceFields } from "@/lib/ai-invoice-extract";
import { db } from "@/lib/db";
import {
  activities,
  emailInbox,
  mailAttachments,
  projectCosts,
  projects,
  properties,
  purchaseInvoiceReviews,
  purchaseOrders,
  timeEntries,
  workers,
  type PurchaseInvoiceReview,
} from "@/lib/db/schema";
import { buildInvoicePdfAttachment, isExcelAttachment } from "@/lib/excel-to-pdf";
import { rateToEur } from "@/lib/fx";
import { evaluateInvoice, type Check, type InvoiceVerdict } from "@/lib/invoice-checks";
import { matchProject, type ProjectNeedle } from "@/lib/project-match";
import { poExVatAssumingSpanishVat } from "@/lib/purchase-orders";
import { sendEmail } from "@/lib/email";
import { recordSentEmail } from "@/lib/sent-email";
import { copyMailAttachmentToPoBucket, downloadMailAttachmentBuffer } from "@/lib/storage";

/** Bijlagecategorieën die een te-betalen post kúnnen zijn. */
export const FINANCIAL_CATEGORIES = [
  "supplier-invoice",
  "freight-invoice",
  "agent-fee-china",
  "agent-fee-spain",
  "opex",
  "contractor",
] as const;

/** Proforma's/offertes zijn nooit een te-betalen post. */
export function isProformaOrQuote(filename: string): boolean {
  return /\bproforma\b|\bquotation\b|\bquote\b|^PI[\s._-]|\bPI\s+for\b/i.test(filename);
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

/* ─────────────────────────── voorstel opbouwen ─────────────────────────── */

export type ProposalLine = {
  projectId: string | null;
  projectHint: string | null;
  description: string | null;
  hours: number | null;
  amount: number | null;
};

export type InvoiceProposal = {
  emailId: string;
  attachmentId: string;
  supplier: string | null;
  reference: string;
  /** In EUR. */
  total: number | null;
  subtotal: number | null;
  currency: string | null;
  totalOriginal: number | null;
  fxRate: number | null;
  invoiceDate: string | null;
  projectId: string | null;
  kind: "labor" | "material" | null;
  hours: number | null;
  /** Gevuld als de uren zijn terugberekend uit het bedrag i.p.v. van de factuur gelezen. */
  hoursDerivedFrom: string | null;
  lines: ProposalLine[];
  fields: AiInvoiceFields | null;
  verdict: InvoiceVerdict;
  supplierEmail: string | null;
  supplierEmailSource: string | null;
  duplicateOfPoId: string | null;
  aiModel: string | null;
  aiPromptVersion: number | null;
};

async function loadProjectNeedles(): Promise<ProjectNeedle[]> {
  return db
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
    .leftJoin(properties, eq(projects.propertyId, properties.id))
    .where(ne(projects.status, "archived"));
}

/**
 * Leest één factuurbijlage uit en bouwt het voorstel: wat de inkooporder zou
 * worden, plus het oordeel of de factuur compleet is.
 *
 * Faalt de uitlezing, dan levert dit nog steeds een voorstel op — met het
 * oordeel "onleesbaar". Een factuur mag nooit verdwijnen omdat de AI hikte.
 */
export async function buildInvoiceProposal(args: {
  emailId: string;
  attachmentId: string;
}): Promise<InvoiceProposal | null> {
  const att = await db.query.mailAttachments.findFirst({ where: eq(mailAttachments.id, args.attachmentId) });
  const mail = await db.query.emailInbox.findFirst({ where: eq(emailInbox.id, args.emailId) });
  if (!att || !mail) return null;

  const read = await readInvoiceWithAI({
    storagePath: att.storagePath,
    filename: att.filename,
    contentType: att.contentType ?? "application/pdf",
  });
  const f = read.ok ? read.fields : null;

  // Valuta: alles wordt in EUR opgeslagen.
  const detected = (f?.currency ?? "EUR").toUpperCase();
  let total = f?.total ?? (att.amountEur != null ? Number(att.amountEur) : null);
  let subtotal = f?.subtotal ?? null;
  let fxRate: number | null = null;
  let totalOriginal: number | null = null;
  if (detected !== "EUR" && f?.total != null && f.total > 0) {
    fxRate = await rateToEur(detected);
    totalOriginal = f.total;
    total = Math.round(f.total * fxRate * 100) / 100;
    if (subtotal != null) subtotal = Math.round(subtotal * fxRate * 100) / 100;
  }

  const supplier = f?.supplierLegalName ?? f?.supplier ?? att.supplierTag ?? null;
  const reference = f?.invoiceNumber
    ? `${supplier ?? att.supplierTag ?? ""} ${f.invoiceNumber}`.replace(/\s+/g, " ").trim()
    : buildPurchaseReference(mail.subject, att.filename);

  // Projectherkenning op hint én omschrijving; per regel als de factuur over
  // meerdere werven loopt (weekfacturen van onderaannemers).
  const needles = await loadProjectNeedles();
  const wholeText = [f?.projectHint, f?.descriptionText].filter(Boolean).join(" · ");
  const wholeMatch = matchProject(wholeText, needles);
  const lines: ProposalLine[] = (f?.lines ?? []).map((l) => {
    const m = matchProject([l.projectHint, l.description].filter(Boolean).join(" · "), needles);
    return {
      projectId: m.kind === "match" ? m.projectId : null,
      projectHint: l.projectHint,
      description: l.description,
      hours: l.hours,
      amount: l.amount,
    };
  });
  // Eén werf op de hele factuur → geen regels nodig.
  const distinctProjects = new Set(lines.map((l) => l.projectId).filter(Boolean));
  const projectId = wholeMatch.kind === "match" ? wholeMatch.projectId : null;

  // Dubbelcontrole: bestaat er al een inkooporder met deze referentie?
  const dup = await db.query.purchaseOrders.findFirst({
    where: eq(purchaseOrders.reference, reference),
    columns: { id: true },
  });

  // Stuurt een bouwer alleen een totaalbedrag? Reken de uren terug met het
  // bekende uurtarief — anders staat er een urenregel van "1 post" op het
  // project en klopt het uurtarief niet.
  const kind = f?.isLabor === true ? "labor" : f?.isLabor === false ? "material" : null;
  let hours = f?.hours ?? null;
  let hoursDerivedFrom: string | null = null;
  const exBtw = subtotal ?? total;
  if (kind === "labor" && (hours == null || hours <= 0) && exBtw != null && exBtw > 0) {
    const tarief = await guessHourlyRate(supplier);
    if (tarief) {
      hours = Math.round((exBtw / tarief.rate) * 100) / 100;
      hoursDerivedFrom = `${hours} uur afgeleid uit €${exBtw.toFixed(2)} ÷ €${tarief.rate.toFixed(2)}/uur (${tarief.source})`;
    }
  }

  const verdict = evaluateInvoice(read, {
    projectMatched: !!projectId || distinctProjects.size > 0,
    knownIbans: f?.supplierTaxId ? await knownIbansFor(f.supplierTaxId) : [],
    duplicateOf: dup?.id ?? null,
  });

  return {
    emailId: args.emailId,
    attachmentId: args.attachmentId,
    supplier,
    reference,
    total,
    subtotal,
    currency: detected,
    totalOriginal,
    fxRate,
    invoiceDate: f?.invoiceDate ?? null,
    projectId,
    kind,
    hours,
    hoursDerivedFrom,
    lines: distinctProjects.size > 1 ? lines : [],
    fields: f,
    verdict,
    supplierEmail: f?.supplierEmail ?? null,
    supplierEmailSource: f?.supplierEmail ? "invoice" : null,
    duplicateOfPoId: dup?.id ?? null,
    aiModel: read.ok ? read.model : null,
    aiPromptVersion: read.ok ? read.promptVersion : null,
  };
}

/**
 * Grenzen waarbinnen een bedrag een gelóófwaardig uurtarief is. Nodig omdat een
 * factuur zónder urenopgave in dit systeem als "1 post" wordt geboekt met het
 * hele factuurbedrag als tarief — zie de conventie bij time_entries. Zouden we
 * dat als uurtarief overnemen, dan rekent de terugrekening altijd 1 uur uit.
 */
const MIN_UURTARIEF = 8;
const MAX_UURTARIEF = 150;

/**
 * Uurtarief van deze bouwer, om uren terug te rekenen als de factuur alleen een
 * totaalbedrag noemt. Eerst het vastgelegde kostentarief van de arbeider, anders
 * wat er de vorige keer voor dezelfde leverancier is geboekt.
 */
export async function guessHourlyRate(
  supplier: string | null,
): Promise<{ rate: number; source: string } | null> {
  const sup = (supplier ?? "").trim().toLowerCase();
  if (sup.length < 4) return null;

  // Naam-match arbeider ↔ leverancier: bevat-elkaar, zoals bij het koppelen van
  // een weekfactuur ("Zerghini Abdelmjid" ↔ arbeider "Abdelmjid").
  const alleWorkers = await db
    .select({ name: workers.name, rate: workers.hourlyCostEur })
    .from(workers)
    .where(eq(workers.active, true));
  const treffers = alleWorkers.filter((w) => {
    const n = w.name.trim().toLowerCase();
    const tarief = Number(w.rate);
    return (
      n.length >= 4 &&
      (sup.includes(n) || n.includes(sup)) &&
      tarief >= MIN_UURTARIEF &&
      tarief <= MAX_UURTARIEF
    );
  });
  if (treffers.length === 1) {
    return { rate: Number(treffers[0].rate), source: `tarief van ${treffers[0].name}` };
  }

  // Anders: het laatst geboekte tarief voor deze leverancier. Alleen regels met
  // écht getelde uren en een plausibel tarief — een "1 post"-regel zegt niets
  // over het uurtarief.
  const [laatste] = await db
    .select({ rate: timeEntries.hourlyCostEur, date: timeEntries.date, hours: timeEntries.hours })
    .from(timeEntries)
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, timeEntries.purchaseOrderId))
    .where(
      sql`lower(${purchaseOrders.supplier}) = ${sup}
        and ${timeEntries.hours}::numeric > 1
        and ${timeEntries.hourlyCostEur}::numeric between ${MIN_UURTARIEF} and ${MAX_UURTARIEF}`,
    )
    .orderBy(desc(timeEntries.date))
    .limit(1);
  if (laatste) {
    return { rate: Number(laatste.rate), source: `vorige factuur (${laatste.date})` };
  }
  return null;
}

/** IBAN's die deze leverancier eerder gebruikte — een afwijking is een fraudesignaal. */
async function knownIbansFor(taxId: string): Promise<string[]> {
  const rows = await db
    .select({ fields: purchaseInvoiceReviews.aiFields })
    .from(purchaseInvoiceReviews)
    .where(and(eq(purchaseInvoiceReviews.status, "approved"), isNotNull(purchaseInvoiceReviews.aiFields)))
    .limit(200);
  const wanted = taxId.toUpperCase().replace(/[^0-9A-Z]/g, "");
  const out = new Set<string>();
  for (const r of rows) {
    const f = r.fields as AiInvoiceFields | null;
    if (!f?.iban || !f.supplierTaxId) continue;
    if (f.supplierTaxId.toUpperCase().replace(/[^0-9A-Z]/g, "") === wanted) out.add(f.iban);
  }
  return [...out];
}

/* ─────────────────────────── wachtrij vullen ─────────────────────────── */

/**
 * Zet het voorstel in de wachtrij. Idempotent dankzij de unieke index op de
 * bijlage: de mailpoll draait elke 15 minuten en mag geen dubbele rijen maken.
 * Een al beoordeelde factuur wordt nooit overschreven.
 */
export async function upsertInvoiceReview(p: InvoiceProposal, source: "auto" | "manual" = "auto"): Promise<string> {
  const values = {
    emailId: p.emailId,
    mailAttachmentId: p.attachmentId,
    source,
    proposedSupplier: p.supplier,
    proposedReference: p.reference,
    proposedTotal: p.total != null ? p.total.toFixed(2) : null,
    proposedSubtotal: p.subtotal != null ? p.subtotal.toFixed(2) : null,
    proposedCurrency: p.currency,
    proposedTotalOriginal: p.totalOriginal != null ? p.totalOriginal.toFixed(2) : null,
    fxRate: p.fxRate != null ? String(p.fxRate) : null,
    proposedInvoiceDate: p.invoiceDate,
    suggestedProjectId: p.projectId,
    suggestedKind: p.kind,
    suggestedHours: p.hours != null ? String(p.hours) : null,
    aiFields: p.fields as unknown,
    aiReadOk: p.verdict.readOk,
    aiError: p.verdict.readError,
    aiModel: p.aiModel,
    aiPromptVersion: p.aiPromptVersion,
    aiCheckedAt: new Date(),
    verdict: p.verdict.status,
    findings: [
      ...p.verdict.checks,
      ...(p.hoursDerivedFrom
        ? [
            {
              key: "hours_derived",
              label: p.hoursDerivedFrom,
              severity: "warning" as const,
              ok: false,
              internal: true,
              es: "",
            },
          ]
        : []),
    ] as unknown,
    duplicateOfPoId: p.duplicateOfPoId,
    supplierEmail: p.supplierEmail,
    supplierEmailSource: p.supplierEmailSource,
    updatedAt: new Date(),
  };
  const [row] = await db
    .insert(purchaseInvoiceReviews)
    .values(values)
    .onConflictDoUpdate({
      target: purchaseInvoiceReviews.mailAttachmentId,
      set: values,
      // Nooit een al genomen besluit overschrijven.
      setWhere: eq(purchaseInvoiceReviews.status, "pending"),
    })
    .returning({ id: purchaseInvoiceReviews.id });
  if (row) return row.id;
  const bestaand = await db.query.purchaseInvoiceReviews.findFirst({
    where: eq(purchaseInvoiceReviews.mailAttachmentId, p.attachmentId),
    columns: { id: true },
  });
  return bestaand!.id;
}

/* ─────────────────────────── goedkeuren ─────────────────────────── */

export type ApprovalOverrides = {
  supplier?: string | null;
  reference?: string | null;
  total?: number | null;
  subtotal?: number | null;
  projectId?: string | null;
  kind?: "labor" | "material" | null;
  hours?: number | null;
  /** Uren staan al via het portaal op het project — geen nieuwe urenregel maken. */
  hoursAlreadyLogged?: boolean;
  /** Verdeling over meerdere werven; overschrijft `projectId` als 'ie gevuld is. */
  split?: { projectId: string; hours?: number | null; amount: number }[];
};

/**
 * Keurt goed en maakt DE inkooporder. Claimt de review eerst atomair, zodat
 * dubbelklikken of twee openstaande tabbladen nooit twee inkooporders opleveren.
 */
export async function approveInvoiceReview(args: {
  reviewId: string;
  overrides?: ApprovalOverrides;
  userId: string | null;
  via: "app" | "mail";
}): Promise<{ purchaseOrderId: string | null; reason?: string }> {
  const claimed = await db
    .update(purchaseInvoiceReviews)
    .set({
      status: "approved",
      decidedBy: args.userId,
      decidedAt: new Date(),
      decidedVia: args.via,
      updatedAt: new Date(),
    })
    .where(and(eq(purchaseInvoiceReviews.id, args.reviewId), eq(purchaseInvoiceReviews.status, "pending")))
    .returning();
  const review = claimed[0];
  if (!review) return { purchaseOrderId: null, reason: "al-afgehandeld" };

  const o = args.overrides ?? {};
  const supplier = (o.supplier ?? review.proposedSupplier ?? "Onbekende leverancier").trim();
  const reference = (o.reference ?? review.proposedReference ?? "").trim() || null;
  const total = o.total ?? (review.proposedTotal != null ? Number(review.proposedTotal) : 0);
  const subtotal = o.subtotal ?? (review.proposedSubtotal != null ? Number(review.proposedSubtotal) : null);

  // Dubbelcontrole als harde grens: bestaat de referentie al, dan koppelen we de
  // mail aan die inkooporder in plaats van een tweede aan te maken.
  if (reference) {
    const bestaand = await db.query.purchaseOrders.findFirst({
      where: eq(purchaseOrders.reference, reference),
      columns: { id: true },
    });
    if (bestaand) {
      await db
        .update(purchaseInvoiceReviews)
        .set({ status: "superseded", purchaseOrderId: bestaand.id, updatedAt: new Date() })
        .where(eq(purchaseInvoiceReviews.id, review.id));
      await db
        .update(emailInbox)
        .set({ linkedPurchaseOrderId: bestaand.id, status: "linked", updatedAt: new Date() })
        .where(eq(emailInbox.id, review.emailId));
      return { purchaseOrderId: bestaand.id, reason: "bestond-al" };
    }
  }

  const att = await db.query.mailAttachments.findFirst({ where: eq(mailAttachments.id, review.mailAttachmentId) });
  const mail = await db.query.emailInbox.findFirst({ where: eq(emailInbox.id, review.emailId) });

  // Bijlagen naar de inkoop-bucket (pas nu — een afgekeurde factuur laat geen
  // sporen achter in de administratie).
  const poAttachments: { name: string; path: string; size?: number; uploadedAt?: string }[] = [];
  if (att) {
    const copied = await copyMailAttachmentToPoBucket({ mailStoragePath: att.storagePath, filename: att.filename });
    if (copied) poAttachments.push({ ...copied, uploadedAt: new Date().toISOString() });
    if (isExcelAttachment(att.filename, att.contentType ?? "")) {
      try {
        const xbuf = await downloadMailAttachmentBuffer(att.storagePath);
        const pdf = xbuf ? await buildInvoicePdfAttachment(xbuf, att.filename) : null;
        if (pdf) poAttachments.push(pdf);
      } catch (e) {
        console.error("Excel→PDF mislukt:", e instanceof Error ? e.message : e);
      }
    }
  }

  const kind = o.kind ?? (review.suggestedKind as "labor" | "material" | null);
  const split = o.split?.length ? o.split : null;
  const projectId = split ? null : (o.projectId ?? review.suggestedProjectId);

  const [po] = await db
    .insert(purchaseOrders)
    .values({
      supplier,
      reference,
      kind: "invoice",
      status: "received",
      currency: "EUR",
      orderDate: review.proposedInvoiceDate ?? (mail?.receivedAt ?? new Date()).toISOString().slice(0, 10),
      receivedAt: mail?.receivedAt ?? new Date(),
      total: total.toFixed(2),
      subtotal: subtotal != null ? subtotal.toFixed(2) : null,
      tax: subtotal != null ? (Math.round((total - subtotal) * 100) / 100).toFixed(2) : null,
      // Bij een verdeling over werven blijft de inkooporder zelf ongekoppeld
      // (projectId is dan null): anders telt het hele bedrag óók nog eens op
      // één project bovenop de verdeelde kostenregels.
      projectId,
      countAsLabor: kind === "labor",
      items: [
        {
          name: review.proposedReference ?? mail?.subject ?? "Inkoopfactuur",
          units: 1,
          unitPrice: total,
          note: att ? `Bron: ${att.filename}` : undefined,
        },
      ],
      attachments: poAttachments,
      notes: `Goedgekeurd uit mail "${mail?.subject ?? ""}" (${mail?.fromEmail ?? ""}).`,
      stockAppliedAt: new Date(), // geen voorraadmutatie
    })
    .returning({ id: purchaseOrders.id });

  // Kosten op de juiste plek zetten.
  const ex = poExVatAssumingSpanishVat({ subtotal, total, tax: null, items: [] });
  const verdelingen = split ?? (projectId ? [{ projectId, hours: o.hours ?? null, amount: ex.amount }] : []);
  for (const deel of verdelingen) {
    if (kind === "labor" && !o.hoursAlreadyLogged) {
      const uren = deel.hours && deel.hours > 0 ? deel.hours : 1;
      await db.insert(timeEntries).values({
        projectId: deel.projectId,
        workerName: supplier,
        date: review.proposedInvoiceDate ?? new Date().toISOString().slice(0, 10),
        hours: String(uren),
        hourlyCostEur: (deel.amount / uren).toFixed(2),
        purchaseOrderId: po.id,
        note: `Uren via inkoopfactuur${reference ? ` ${reference}` : ""}`,
      });
    } else if (kind !== "labor" && split) {
      // Materiaal verdeeld over werven: per project een kostenregel, want
      // purchase_orders kan maar aan één project hangen.
      await db.insert(projectCosts).values({
        projectId: deel.projectId,
        date: review.proposedInvoiceDate ?? new Date().toISOString().slice(0, 10),
        category: "material",
        description: `Inkoopfactuur ${reference ?? supplier}`,
        supplier,
        purchaseOrderId: po.id,
        amountEur: deel.amount.toFixed(2),
      });
    }
  }

  await db
    .update(purchaseInvoiceReviews)
    .set({ purchaseOrderId: po.id, updatedAt: new Date() })
    .where(eq(purchaseInvoiceReviews.id, review.id));
  await db
    .update(emailInbox)
    .set({ linkedPurchaseOrderId: po.id, status: "linked", updatedAt: new Date() })
    .where(eq(emailInbox.id, review.emailId));

  const correcties: string[] = [];
  if (o.total != null && review.proposedTotal != null && Math.abs(o.total - Number(review.proposedTotal)) > 0.01) {
    correcties.push(`bedrag bijgesteld €${Number(review.proposedTotal).toFixed(2)} → €${o.total.toFixed(2)}`);
  }
  if (o.supplier && o.supplier !== review.proposedSupplier) correcties.push(`leverancier bijgesteld`);
  await db.insert(activities).values({
    type: "note",
    subject: `Inkoopfactuur goedgekeurd: ${supplier}${reference ? ` · ${reference}` : ""}`,
    body:
      `€${total.toFixed(2)}${subtotal != null ? ` (ex. btw €${subtotal.toFixed(2)})` : ""}` +
      `${verdelingen.length ? ` · ${kind === "labor" ? "uren" : "materiaal"} op ${verdelingen.length} project(en)` : " · nog geen project"}` +
      `${correcties.length ? ` · ${correcties.join(", ")}` : ""}` +
      `${args.via === "mail" ? " · goedgekeurd vanuit de meldingsmail" : ""}`,
    authorId: args.userId,
  });

  return { purchaseOrderId: po.id };
}

/* ─────────────────────────── afkeuren / negeren ─────────────────────────── */

export async function rejectInvoiceReview(args: {
  reviewId: string;
  reason: string;
  userId: string | null;
  via: "app" | "mail";
  messageId?: string | null;
  /** Terugsturen naar de leverancier; leeg = alleen intern afkeuren. */
  mail?: { to: string; subject: string; html: string; text: string; attachInvoice?: boolean };
  /** Namens wie de mail uitgaat — komt in de From-naam, het adres blijft purchase@. */
  sender?: { name?: string | null };
}): Promise<{ ok: boolean; mailSent?: boolean; mailReason?: string }> {
  const claimed = await db
    .update(purchaseInvoiceReviews)
    .set({
      status: "rejected",
      decidedBy: args.userId,
      decidedAt: new Date(),
      decidedVia: args.via,
      decisionNote: args.reason,
      rejectMessageId: args.messageId ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(purchaseInvoiceReviews.id, args.reviewId), eq(purchaseInvoiceReviews.status, "pending")))
    .returning();
  const review = claimed[0];
  if (!review) return { ok: false };

  // Terugsturen naar de leverancier, als antwoord in dezelfde thread vanaf het
  // inkoop-postvak — daar stuurde hij de factuur immers naartoe.
  let mailSent: boolean | undefined;
  let mailReason: string | undefined;
  let messageId = args.messageId ?? null;
  if (args.mail?.to) {
    const mail = await db.query.emailInbox.findFirst({
      where: eq(emailInbox.id, review.emailId),
      columns: { messageId: true, referencesHeader: true },
    });
    const att = args.mail.attachInvoice
      ? await db.query.mailAttachments.findFirst({ where: eq(mailAttachments.id, review.mailAttachmentId) })
      : null;
    const bijlagen = att
      ? await (async () => {
          const buf = await downloadMailAttachmentBuffer(att.storagePath);
          return buf ? [{ filename: att.filename, content: buf, contentType: att.contentType ?? undefined }] : [];
        })()
      : [];

    const res = await sendEmail({
      to: args.mail.to,
      subject: args.mail.subject,
      html: args.mail.html,
      text: args.mail.text,
      attachments: bijlagen,
      fromPurchase: true,
      // Vanaf purchase@ met de naam van de afzender erbij: de leverancier ziet
      // wie hem schreef, en zijn antwoord — met de gecorrigeerde factuur — komt
      // meteen op purchase@ binnen en dus terug in deze wachtrij.
      fromUser: args.sender,
      inReplyTo: mail?.messageId ? ensureAngles(mail.messageId) : undefined,
      references: [mail?.referencesHeader, mail?.messageId ? ensureAngles(mail.messageId) : null]
        .filter(Boolean)
        .join(" ") || undefined,
    });
    mailSent = res.sent;
    mailReason = res.reason;
    messageId = res.messageId ?? messageId;
    if (res.sent) {
      await recordSentEmail({
        kind: "other",
        toEmail: args.mail.to,
        subject: args.mail.subject,
        html: args.mail.html,
        text: args.mail.text,
      });
    }
  }

  await db
    .update(purchaseInvoiceReviews)
    .set({ rejectMessageId: messageId, updatedAt: new Date() })
    .where(eq(purchaseInvoiceReviews.id, review.id));
  await db
    .update(emailInbox)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(emailInbox.id, review.emailId));
  await db.insert(activities).values({
    type: "note",
    subject: `Inkoopfactuur afgekeurd: ${review.proposedSupplier ?? "onbekend"}${review.proposedReference ? ` · ${review.proposedReference}` : ""}`,
    body:
      args.reason +
      (args.mail?.to
        ? mailSent
          ? `\n\nTeruggestuurd naar ${args.mail.to}.`
          : `\n\nMail naar ${args.mail.to} MISLUKT (${mailReason ?? "onbekend"}) — handmatig versturen.`
        : "\n\nNiet gemaild; alleen intern afgekeurd."),
    authorId: args.userId,
  });
  return { ok: true, mailSent, mailReason };
}

/** Message-ID's moeten tussen punthaken staan; sommige bronnen leveren ze zonder. */
function ensureAngles(id: string): string {
  const v = id.trim();
  return v.startsWith("<") ? v : `<${v}>`;
}

export async function ignoreInvoiceReview(args: { reviewId: string; userId: string | null }): Promise<void> {
  const claimed = await db
    .update(purchaseInvoiceReviews)
    .set({ status: "ignored", decidedBy: args.userId, decidedAt: new Date(), decidedVia: "app", updatedAt: new Date() })
    .where(and(eq(purchaseInvoiceReviews.id, args.reviewId), eq(purchaseInvoiceReviews.status, "pending")))
    .returning();
  const review = claimed[0];
  if (!review) return;
  await db
    .update(emailInbox)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(emailInbox.id, review.emailId));
}

/** Het opgeslagen oordeel terug als lijst met controles. */
export function reviewChecks(review: Pick<PurchaseInvoiceReview, "findings">): Check[] {
  return Array.isArray(review.findings) ? (review.findings as Check[]) : [];
}

/** Aantal facturen dat op beoordeling wacht — voor tellers op dashboard/zijbalk. */
export async function pendingReviewCount(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(purchaseInvoiceReviews)
    .where(eq(purchaseInvoiceReviews.status, "pending"));
  return row?.n ?? 0;
}
