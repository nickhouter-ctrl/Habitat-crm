/**
 * Na het automatisch goedkeuren van een urenfactuur van Pieter/Luis: de
 * factuur meteen als CONCEPT in Holded zetten, met factuur + urenstaat in één
 * PDF (Nick 21-11-2026: zijn vriendin deed dat tot nu toe met de hand). In
 * Holded keurt zij hem daarna goed.
 *
 * "Helemaal goed ingevuld" — daarom alleen als alles vaststaat, anders niets:
 *  - contact gevonden op NIF/CIF (Hollandse Meesters), niet op naam;
 *  - een schoon factuurnummer (260090, niet "260090 Pieter") dat nog niet in Holded staat;
 *  - elke regel is uren, met een Holded-project en de grootboekrekening die bij
 *    deze leverancier voor uren het vaakst gebruikt is (21500000, ≥ 3 keer);
 *  - btw en eventuele IRPF volgen de factuur; samen exact het factuurbedrag
 *    (bookingProblems in de bestaande push).
 * Eén ding mis → niet boeken, reden naar de briefing; de knop "Boek in
 * Holded" op de inkooporder werkt dan gewoon met de hand.
 */
import "server-only";

import { eq, sql } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { db } from "@/lib/db";
import { purchaseOrders } from "@/lib/db/schema";
import { renderExcelToPdf } from "@/lib/excel-to-pdf";
import { loadPurchasePush, pushPurchaseToHolded, type PushContext } from "@/lib/holded/purchase-push";
import { downloadMailAttachmentBuffer, downloadPurchaseOrderBuffer, uploadPurchaseOrderBytes } from "@/lib/storage";

/** Minimaal zo vaak eerder zo geboekt bij deze leverancier, anders niet vanzelf. */
export const MIN_EERDER = 3;

/** "260090 Pieter" → "260090". Meerdere of geen nummers → null (dan niet gokken). */
export function cleanDocNumber(...bronnen: (string | null | undefined)[]): string | null {
  for (const b of bronnen) {
    const nums = [...new Set((b ?? "").match(/\b\d{5,8}\b/g) ?? [])];
    if (nums.length === 1) return nums[0];
  }
  return null;
}

type Ctx = Pick<PushContext, "blocked" | "existing" | "contact" | "lines" | "ai">;

/** Pure controle: waarom deze factuur NIET vanzelf naar Holded mag. Leeg = mag. */
export function autoPushProblems(ctx: Ctx, docNumber: string | null): string[] {
  const p: string[] = [];
  if (ctx.blocked) p.push(ctx.blocked);
  if (ctx.existing) p.push(`staat al in Holded (${ctx.existing.docNumber.trim()})`);
  if (!ctx.contact.matched || ctx.contact.how !== "nif") p.push("leverancier niet op NIF gevonden in Holded");
  if (!docNumber) p.push("geen eenduidig factuurnummer");
  if (ctx.lines.length === 0) p.push("geen regels");
  for (const l of ctx.lines) {
    const wie = `${l.name}`;
    if (l.kind !== "labor") p.push(`${wie}: geen urenregel`);
    if (!l.holdedProjectId) p.push(`${wie}: geen Holded-project gekoppeld`);
    const n = Number(l.basis.match(/deze leverancier \(uren, (\d+)×\)/)?.[1] ?? 0);
    if (!l.account || n < MIN_EERDER) p.push(`${wie}: grootboekrekening niet zeker (${l.basis})`);
    if (!/^p_iva_/.test(l.vat)) p.push(`${wie}: btw onbekend`);
    const ret = ctx.ai?.retentionPct ?? 0;
    if (ret > 0 && !l.retention) p.push(`${wie}: IRPF ${ret}% op de factuur maar geen inhouding gevonden`);
  }
  return [...new Set(p)];
}

/** Omschrijving per werf zoals ze het in Holded doen: wat er gedaan is. */
export function werkOmschrijving(worker: string, notes: string[]): string {
  const voornaam = worker.split(/\s+/)[0];
  const naam = voornaam.charAt(0).toUpperCase() + voornaam.slice(1).toLowerCase();
  const werk = [...new Set(notes.map((n) => n.trim()).filter(Boolean))].join("; ");
  return `${naam}${werk ? ` — ${werk}` : ""}`.replace(/\s+/g, " ").slice(0, 250);
}

/** Factuur-PDF met daarachter de urenstaat (liggend, passend gemaakt). */
export async function mergePdfs(parts: Uint8Array[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (const part of parts) {
    const doc = await PDFDocument.load(part, { ignoreEncryption: true });
    const pages = await out.copyPages(doc, doc.getPageIndices());
    for (const page of pages) out.addPage(page);
  }
  return out.save();
}

export type AutoPushResult = { ok: boolean; message: string };

export async function autoPushLaborInvoice(args: {
  poId: string;
  sheet: { storagePath: string; filename: string };
  workerName: string;
  /** Per CRM-project de werkzaamheden van de urenstaat. */
  notesPerProject: Map<string, string[]>;
}): Promise<AutoPushResult> {
  if (process.env.AUTOPILOT_HOLDED_PUSH === "off") return { ok: false, message: "Holded-push staat uit (AUTOPILOT_HOLDED_PUSH=off)" };
  const ctx = await loadPurchasePush(args.poId);
  const docNumber = cleanDocNumber(ctx.ai?.invoiceNumber, ctx.docNumber, ctx.po.reference);
  const problems = autoPushProblems(ctx, docNumber);
  if (problems.length) return { ok: false, message: `Niet naar Holded: ${problems.join("; ")}` };

  // Eén PDF: factuur bovenaan, urenstaat eronder.
  const atts = (ctx.po.attachments ?? []) as { name: string; path: string }[];
  const invoicePdf = atts.find((a) => /\.pdf$/i.test(a.name));
  const invoiceBytes = invoicePdf ? await downloadPurchaseOrderBuffer(invoicePdf.path) : null;
  const sheetXlsx = await downloadMailAttachmentBuffer(args.sheet.storagePath);
  const sheetPdf = sheetXlsx ? await renderExcelToPdf(sheetXlsx, args.sheet.filename) : null;
  if (!invoiceBytes || !sheetPdf) return { ok: false, message: "Niet naar Holded: factuur- of urenstaat-PDF niet te maken" };
  let merged: Uint8Array;
  try {
    merged = await mergePdfs([new Uint8Array(invoiceBytes), new Uint8Array(sheetPdf)]);
  } catch (e) {
    return { ok: false, message: `Niet naar Holded: PDF samenvoegen mislukt (${e instanceof Error ? e.message : String(e)})` };
  }
  const voornaam = args.workerName.split(/\s+/)[0];
  const name = `Factuur ${docNumber} met urenverantwoording ${voornaam.charAt(0).toUpperCase()}${voornaam.slice(1).toLowerCase()}.pdf`;

  // Ook in het CRM bij de inkooporder, zodat beide kanten hetzelfde bestand hebben.
  const meta = await uploadPurchaseOrderBytes(name, Buffer.from(merged), "application/pdf");
  if (meta) await db.update(purchaseOrders)
    .set({ attachments: sql`coalesce(${purchaseOrders.attachments}, '[]'::jsonb) || ${JSON.stringify([{ ...meta, uploadedAt: new Date().toISOString() }])}::jsonb` })
    .where(eq(purchaseOrders.id, args.poId));

  const choices = Object.fromEntries(ctx.lines.map((l) => [l.key, {
    account: l.account!,
    vat: l.vat,
    retention: l.retention,
    holdedProjectId: l.holdedProjectId,
    desc: werkOmschrijving(args.workerName, args.notesPerProject.get(l.crmProjectId ?? "") ?? []),
  }]));
  const res = await pushPurchaseToHolded({ poId: args.poId, docNumber: docNumber!, contactId: ctx.contact.matched!.id, choices, userId: null, attachment: { name, bytes: merged } });
  return { ok: res.ok, message: res.ok ? `Als concept in Holded gezet (${docNumber})${res.warnings?.length ? ` — let op: ${res.warnings.join(" ")}` : ""}` : `Niet naar Holded: ${res.message}` };
}
