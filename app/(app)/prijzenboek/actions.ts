"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";

import { requireWriteUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import {
  activities,
  documents,
  priceBookItems,
  projects,
  type DocumentLineItem,
  type DocumentPhase,
} from "@/lib/db/schema";
import { computeTotals } from "@/lib/documents";
import { insertNumberedDocument } from "@/lib/doc-number";
import { moneyOrNull, parseMoney } from "@/lib/parse-money";
import { DEFAULT_PRIJZENBOEK_MARGE, HOOFDSTUKKEN } from "@/lib/price-book";
import { betalingsschemaTekst, quoteClauses, SCHEMA_FASEN, type QuoteLang } from "@/lib/quote-clauses";
import { syncSanitairPrijzen } from "@/lib/sanitair-prijzen";
import { suggestedPrice } from "@/lib/pricing";

/* ───────────────────────────── beheer ───────────────────────────── */

export async function savePriceBookItem(id: string, formData: FormData) {
  await requireWriteUser();
  const kost = parseMoney(String(formData.get("costEur") ?? ""));
  const marge = parseMoney(String(formData.get("marginPct") ?? "")) ?? DEFAULT_PRIJZENBOEK_MARGE;
  const prijsInvoer = parseMoney(String(formData.get("priceEur") ?? ""));

  // Verkoop volgt kost en marge, tenzij hij bewust is overgetypt: staat er nog
  // de OUDE verkoopprijs terwijl kost of marge wél veranderde, dan rekenen we
  // opnieuw (vangnet voor als de live-herberekening in de browser niet liep).
  const oud = await db.query.priceBookItems.findFirst({ where: eq(priceBookItems.id, id) });
  const ongewijzigdePrijs = prijsInvoer != null && oud?.priceEur != null && prijsInvoer === Number(oud.priceEur);
  const kostOfMargeGewijzigd = kost !== (oud?.costEur != null ? Number(oud.costEur) : null) || marge !== Number(oud?.marginPct ?? DEFAULT_PRIJZENBOEK_MARGE);
  const prijs =
    prijsInvoer == null || (ongewijzigdePrijs && kostOfMargeGewijzigd)
      ? kost != null
        ? Math.round(suggestedPrice(kost, marge))
        : null
      : prijsInvoer;

  await db
    .update(priceBookItems)
    .set({
      name: String(formData.get("name") ?? "").trim() || "Naamloos",
      description: String(formData.get("description") ?? "").trim() || null,
      unit: String(formData.get("unit") ?? "stuk"),
      driver: String(formData.get("driver") ?? "handmatig"),
      factor: String(parseMoney(String(formData.get("factor") ?? "")) ?? 1),
      costEur: kost != null ? kost.toFixed(2) : null,
      marginPct: String(marge),
      priceEur: prijs != null ? prijs.toFixed(2) : null,
      isStelpost: formData.get("isStelpost") === "on",
      stelpostNote: String(formData.get("stelpostNote") ?? "").trim() || null,
      // Eén keer bewust opgeslagen = gecontroleerd.
      needsReview: false,
      updatedAt: new Date(),
    })
    .where(eq(priceBookItems.id, id));
  revalidatePath("/prijzenboek");
}

export async function addPriceBookItem(chapter: string, formData: FormData) {
  await requireWriteUser();
  const kost = parseMoney(String(formData.get("costEur") ?? ""));
  const marge = DEFAULT_PRIJZENBOEK_MARGE;
  await db.insert(priceBookItems).values({
    chapter,
    name: String(formData.get("name") ?? "").trim() || "Nieuwe post",
    unit: String(formData.get("unit") ?? "stuk"),
    driver: String(formData.get("driver") ?? "handmatig"),
    costEur: kost != null ? kost.toFixed(2) : null,
    marginPct: String(marge),
    priceEur: kost != null ? Math.round(suggestedPrice(kost, marge)).toFixed(2) : null,
    needsReview: false,
    sortOrder: 999,
  });
  revalidatePath("/prijzenboek");
}

/** Ververs de "eigen collectie"-badkamerposten uit de actuele catalogusprijzen. */
export async function verversSanitairUitCatalogus() {
  await requireWriteUser();
  await syncSanitairPrijzen();
  revalidatePath("/prijzenboek");
}

export async function togglePriceBookActive(id: string, actief: boolean) {
  await requireWriteUser();
  await db.update(priceBookItems).set({ active: actief, updatedAt: new Date() }).where(eq(priceBookItems.id, id));
  revalidatePath("/prijzenboek");
}

export async function deletePriceBookItem(id: string) {
  await requireWriteUser();
  await db.delete(priceBookItems).where(eq(priceBookItems.id, id));
  revalidatePath("/prijzenboek");
}

/* ─────────────────────────── offerte maken ─────────────────────────── */

/**
 * Bouwt de concept-offerte uit de aantallen die in de wizard zijn bevestigd.
 *
 * De wizard rekent de aantallen vóór (maat × factor), maar wat hier binnenkomt
 * zijn de aantallen zoals ze op het scherm STONDEN — aanpasbaar per regel, dus
 * wat je zag is wat er op de offerte komt. De prijzen komen vers uit het
 * prijzenboek; regels zonder prijs worden overgeslagen en gemeld.
 */
export async function createQuoteFromPriceBook(formData: FormData) {
  const user = await requireWriteUser();
  const contactId = uuidOrNull(formData.get("contactId"));
  const projectId = uuidOrNull(formData.get("projectId"));
  const taal = (["nl", "en", "es"].includes(String(formData.get("taal"))) ? String(formData.get("taal")) : "nl") as QuoteLang;
  const onvoorzienPct = parseMoney(String(formData.get("onvoorzien") ?? "")) ?? 10;
  const badkamerSpec = String(formData.get("badkamerSpec") ?? "").trim();
  const wizardQuery = String(formData.get("wizardQuery") ?? "").trim();
  const termijnen = SCHEMA_FASEN.map((fase) => parseMoney(String(formData.get(fase.key) ?? "")) ?? fase.standaard);

  const posten = await db
    .select()
    .from(priceBookItems)
    .where(eq(priceBookItems.active, true))
    .orderBy(asc(priceBookItems.sortOrder), asc(priceBookItems.name));

  const items: DocumentLineItem[] = [];
  const overgeslagen: string[] = [];
  const gebruikteHoofdstukken: string[] = [];

  // In hoofdstuk-volgorde, zodat de offerte leest als een bestek.
  for (const hoofdstuk of HOOFDSTUKKEN) {
    for (const p of posten.filter((x) => x.chapter === hoofdstuk)) {
      const qty = parseMoney(String(formData.get(`q_${p.id}`) ?? ""));
      if (!qty || qty <= 0) continue;
      if (p.priceEur == null) {
        overgeslagen.push(p.name);
        continue;
      }
      if (!gebruikteHoofdstukken.includes(hoofdstuk)) gebruikteHoofdstukken.push(hoofdstuk);
      const omschrijving = [
        p.description,
        // Per-badkamer specificatie uit de wizard op de installatieregel.
        p.driver === "badkamers" && badkamerSpec ? badkamerSpec : null,
        p.isStelpost && p.stelpostNote ? `Stelpost: ${p.stelpostNote}` : null,
      ]
        .filter(Boolean)
        .join(". ");
      items.push({
        name: p.name,
        description: omschrijving || undefined,
        units: qty,
        unit: p.unit,
        price: Number(p.priceEur),
        costEur: p.costEur != null ? Number(p.costEur) : undefined,
        marginPct: Number(p.marginPct),
        taxRate: 21,
        category: hoofdstuk === "Eigen producten" ? "materiaal" : "renovatie",
        phase: hoofdstuk,
        productId: p.productId ?? undefined,
      });
    }
  }
  if (items.length === 0) redirect("/prijzenboek/offerte?fout=leeg");

  // Onvoorzien als zichtbare slotregel (keuze Nick): transparant richting de
  // klant, en het dekt precies de dingen die je vooraf niet kunt zien.
  if (onvoorzienPct > 0) {
    const sub = items.reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.units) || 0), 0);
    items.push({
      name: `Onvoorzien (${onvoorzienPct}%)`,
      description: taal === "es" ? "imprevistos" : taal === "en" ? "contingency" : "onvoorziene werkzaamheden",
      units: 1,
      price: Math.round(sub * (onvoorzienPct / 100) * 100) / 100,
      taxRate: 21,
      category: "renovatie",
      phase: gebruikteHoofdstukken[gebruikteHoofdstukken.length - 1],
    });
  }

  const phases: DocumentPhase[] = gebruikteHoofdstukken.map((h) => ({ key: h, label: h }));
  const totals = computeTotals(items);
  const round2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

  const project = projectId ? await db.query.projects.findFirst({ where: eq(projects.id, projectId) }) : null;

  const { id, docNumber } = await insertNumberedDocument("estimate", {
    kind: "estimate",
    status: "draft",
    title: `Offerte verbouwing${project ? ` — ${project.name}` : ""}`,
    contactId: contactId ?? project?.contactId ?? null,
    projectId,
    propertyId: project?.propertyId ?? null,
    issueDate: new Date().toISOString().slice(0, 10),
    currency: "EUR",
    subtotalEur: round2(totals.subtotal),
    taxEur: round2(totals.tax),
    totalEur: round2(totals.total),
    items,
    phases,
    notes: [quoteClauses(taal), betalingsschemaTekst(taal, totals.subtotal, termijnen)].filter(Boolean).join("\n\n"),
  });

  const kost = items.reduce((s, it) => s + (Number(it.costEur) || 0) * (Number(it.units) || 0), 0);
  await db.insert(activities).values({
    type: "note",
    subject: `Offerte ${docNumber} gecalculeerd uit het prijzenboek`,
    body: `${items.length} regels · verkoop ${round2(totals.subtotal)} · kostprijs ${round2(kost)}${
      overgeslagen.length ? ` · overgeslagen (geen prijs): ${overgeslagen.join(", ")}` : ""
    }${wizardQuery ? `\nGebruikte maten (opnieuw calculeren): /prijzenboek/offerte?${wizardQuery}` : ""}`,
    contactId: contactId ?? project?.contactId ?? null,
    documentId: id,
    authorId: user.id,
  });

  revalidatePath("/documents");
  redirect(`/documents/${id}/edit`);
}

function uuidOrNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s.length === 36 ? s : null;
}
