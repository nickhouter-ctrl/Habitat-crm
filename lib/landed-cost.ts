/**
 * Landed cost berekening per Purchase Order / shipment.
 *
 * Idee: alle facturen die bij een shipment horen (Allpack handling, Teresa,
 * Alianza vracht/duty, etc.) worden gekoppeld aan een PO. Vervolgens berekent
 * dit module de TRUE landed cost per product op basis van wat er werkelijk is
 * betaald.
 */
import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  emailInbox,
  mailAttachments,
  products,
  purchaseOrders,
  type PurchaseOrder,
} from "@/lib/db/schema";
import { CATEGORIES } from "@/lib/email-attachments";

export type AttachmentRow = {
  id: string;
  filename: string;
  category: string;
  supplierTag: string | null;
  amountEur: string | null;
  receivedAt: Date | null;
  emailId: string;
  emailSubject: string | null;
  emailFromEmail: string | null;
};

/** Haal alle bijlagen op die gekoppeld zijn aan deze PO via de mail-inbox link. */
export async function getAttachmentsForPO(purchaseOrderId: string): Promise<AttachmentRow[]> {
  const rows = await db
    .select({
      id: mailAttachments.id,
      filename: mailAttachments.filename,
      category: mailAttachments.category,
      supplierTag: mailAttachments.supplierTag,
      amountEur: mailAttachments.amountEur,
      receivedAt: mailAttachments.receivedAt,
      emailId: emailInbox.id,
      emailSubject: emailInbox.subject,
      emailFromEmail: emailInbox.fromEmail,
    })
    .from(mailAttachments)
    .innerJoin(emailInbox, eq(emailInbox.id, mailAttachments.emailId))
    .where(eq(emailInbox.linkedPurchaseOrderId, purchaseOrderId))
    .orderBy(mailAttachments.receivedAt);
  return rows as AttachmentRow[];
}

export interface LandedCostBreakdown {
  category: string;
  categoryLabel: string;
  amount: number;
  attachmentCount: number;
  isRecoverable: boolean;
}

export interface LandedCostResult {
  /** Som van product-prijzen × qty in de PO line items (de "factuur-waarde"). */
  factoryTotalEur: number;
  /** Som van non-recoverable extras (Allpack + Teresa + vracht + duty). */
  overheadTotalEur: number;
  /** factoryTotal + overheadTotal. */
  landedTotalEur: number;
  /** overheadTotal / factoryTotal — bv. 0.155 = 15.5% bovenop factory. */
  ratio: number;
  /** Per categorie: bedrag + aantal bijlagen. */
  breakdown: LandedCostBreakdown[];
  /** Aantal bijlagen zonder bedrag ingevuld. */
  missingAmounts: number;
}

/** Bereken landed-cost op basis van linked attachments. IVA-aanhangsels (recoverable) tellen NIET mee. */
export function computeLandedCost(args: {
  po: PurchaseOrder;
  attachments: AttachmentRow[];
}): LandedCostResult {
  // Factory total = som van line items
  const items = (args.po.items ?? []) as Array<{ quantity?: number; unitPrice?: number | string }>;
  let factoryTotal = 0;
  for (const it of items) {
    const qty = Number(it.quantity ?? 0);
    const price = Number(it.unitPrice ?? 0);
    factoryTotal += qty * price;
  }

  // Group attachments per categorie, sum bedragen
  const RECOVERABLE = new Set<string>(["quote-proforma", "certificate", "other"]);
  const byCategory = new Map<string, { amount: number; count: number }>();
  let missing = 0;
  for (const a of args.attachments) {
    const amt = a.amountEur != null ? Number(a.amountEur) : null;
    if (amt == null || !Number.isFinite(amt)) {
      missing++;
      continue;
    }
    // Quote-proforma / certificate niet in cost optellen
    if (RECOVERABLE.has(a.category)) continue;
    const e = byCategory.get(a.category) ?? { amount: 0, count: 0 };
    e.amount += amt;
    e.count++;
    byCategory.set(a.category, e);
  }

  const breakdown: LandedCostBreakdown[] = [];
  let overheadTotal = 0;
  for (const [cat, v] of byCategory) {
    breakdown.push({
      category: cat,
      categoryLabel: CATEGORIES[cat as keyof typeof CATEGORIES] ?? cat,
      amount: Math.round(v.amount * 100) / 100,
      attachmentCount: v.count,
      isRecoverable: false,
    });
    overheadTotal += v.amount;
  }
  // Sort: meeste eerst
  breakdown.sort((a, b) => b.amount - a.amount);

  const ratio = factoryTotal > 0 ? overheadTotal / factoryTotal : 0;

  return {
    factoryTotalEur: Math.round(factoryTotal * 100) / 100,
    overheadTotalEur: Math.round(overheadTotal * 100) / 100,
    landedTotalEur: Math.round((factoryTotal + overheadTotal) * 100) / 100,
    ratio,
    breakdown,
    missingAmounts: missing,
  };
}

/**
 * Pas de landed-cost ratio toe op alle producten in de PO.
 * Voor elke line-item met productId: update purchaseCostEur naar
 * (line.unitPrice in EUR) × (1 + ratio).
 */
export async function applyLandedCostToProducts(args: {
  purchaseOrderId: string;
  ratio: number;
}): Promise<{ updated: number; skipped: number }> {
  const po = await db.query.purchaseOrders.findFirst({
    where: eq(purchaseOrders.id, args.purchaseOrderId),
  });
  if (!po) throw new Error("PO niet gevonden");

  const items = (po.items ?? []) as Array<{
    productId?: string;
    unitPrice?: number | string;
    quantity?: number;
  }>;

  let updated = 0;
  let skipped = 0;
  for (const it of items) {
    if (!it.productId) {
      skipped++;
      continue;
    }
    const factoryUnit = Number(it.unitPrice ?? 0);
    if (factoryUnit <= 0) {
      skipped++;
      continue;
    }
    // Nieuwe inkoop = factory × (1 + ratio)
    const newPurchase = Math.round(factoryUnit * (1 + args.ratio) * 100) / 100;
    await db
      .update(products)
      .set({
        purchaseCostEur: String(newPurchase),
        updatedAt: new Date(),
      })
      .where(eq(products.id, it.productId));
    updated++;
  }

  // Bewaar samenvatting op de PO
  await db
    .update(purchaseOrders)
    .set({
      landedCostSummary: sql`${JSON.stringify({
        appliedAt: new Date().toISOString(),
        ratio: args.ratio,
      })}::jsonb` as any,
      updatedAt: new Date(),
    })
    .where(eq(purchaseOrders.id, args.purchaseOrderId));

  return { updated, skipped };
}

/** Patterns voor auto-linking van attachments aan PO via shipmentRef/containerRef. */
export const SHIPMENT_REF_PATTERNS = [
  /\bZMI\d{6,}/i,                      // Galadtrans/Alianza shipment IDs
  /\bYMMU\d{6,}/i,                     // Yang Ming container numbers
  /\bYMJAM\d{6,}/i,                    // Yang Ming Master BL
  /\bYHES\d+-?ZYX\d+/i,                // Yohome invoice ref
  /\b33#kkr\d+lxm/i,                   // KKR invoice ref
  /\bMS\d{8}-XBY/i,                    // Magic Stone CI ref
  /\bDM\d{10}/i,                       // Customs document ref
  /\b26ES\d{6}I\d{2}[A-Z]+\d+/i,       // Spanish DUA MRN
];

/** Extract shipment-refs uit een tekst. */
export function extractShipmentRefs(text: string): string[] {
  const refs = new Set<string>();
  for (const pat of SHIPMENT_REF_PATTERNS) {
    const matches = text.match(new RegExp(pat.source, "gi"));
    if (matches) for (const m of matches) refs.add(m);
  }
  return Array.from(refs);
}
