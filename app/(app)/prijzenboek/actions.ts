"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { asc, eq, sql } from "drizzle-orm";

import { requireWriteUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import {
  activities,
  priceBookItems,
  projects,
  type DocumentLineItem,
  type DocumentPhase,
} from "@/lib/db/schema";
import { computeTotals } from "@/lib/documents";
import { insertNumberedDocument } from "@/lib/doc-number";
import { parseMoney } from "@/lib/parse-money";
import {
  badkamerSamenstelling,
  DEFAULT_PRIJZENBOEK_MARGE,
  HOOFDSTUKKEN,
  kostUitOpbouw,
  snijverliesToelichting,
} from "@/lib/price-book";
import { autoTermijnen, betalingsschemaTekst, MAX_TERMIJNEN, quoteClauses, SCHEMA_FASEN, type QuoteLang } from "@/lib/quote-clauses";
import { syncSanitairPrijzen } from "@/lib/sanitair-prijzen";
import { suggestedPrice } from "@/lib/pricing";

/* ───────────────────────────── beheer ───────────────────────────── */

export async function savePriceBookItem(id: string, formData: FormData) {
  await requireWriteUser();
  // Kostopbouw wint van het kostveld: staan er uren of materiaal, dan is de
  // kost daaruit afgeleid (het veld staat in de UI ook op slot). Zo kan een
  // wijziging van het ploegtarief niet stilletjes naast een oud kostbedrag
  // blijven staan.
  const uren = parseMoney(String(formData.get("laborHours") ?? ""));
  const materiaal = parseMoney(String(formData.get("materialCostEur") ?? ""));
  const kost =
    uren != null || materiaal != null
      ? kostUitOpbouw({ laborHours: uren, materialCostEur: materiaal })
      : parseMoney(String(formData.get("costEur") ?? ""));
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
      wastePct: String(parseMoney(String(formData.get("wastePct") ?? "")) ?? 0),
      laborHours: uren != null ? String(uren) : null,
      materialCostEur: materiaal != null ? materiaal.toFixed(2) : null,
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
  let projectId = uuidOrNull(formData.get("projectId"));

  // Nieuw project direct vanuit de wizard: naam getypt + geen bestaand project
  // gekozen → meteen aanmaken en de offerte eraan koppelen. Bestaat er al een
  // project met (op hoofdletters na) dezelfde naam, dan gebruiken we dát —
  // "oliva hotel" naast "Oliva Hotel" betekent uren en kosten die je op het
  // verkeerde scherm zoekt.
  const nieuwProject = String(formData.get("nieuwProject") ?? "").trim();
  if (!projectId && nieuwProject) {
    const bestaand = await db.query.projects.findFirst({
      where: sql`lower(trim(${projects.name})) = ${nieuwProject.toLowerCase()}`,
      columns: { id: true },
    });
    if (bestaand) {
      projectId = bestaand.id;
    } else {
      const [aangemaakt] = await db.insert(projects).values({ name: nieuwProject, contactId }).returning({ id: projects.id });
      projectId = aangemaakt.id;
    }
  }
  const taal = (["nl", "en", "es"].includes(String(formData.get("taal"))) ? String(formData.get("taal")) : "nl") as QuoteLang;
  const onvoorzienPct = parseMoney(String(formData.get("onvoorzien") ?? "")) ?? 10;
  // Badkamer-specificatie en herreken-link uit de formulierdata zelf afleiden
  // (zelfde helper als het voorbeeld). Vroeger reisden die als hidden velden
  // mee en stapelden ze zich bij elke herberekening op in de URL.
  const { spec: badkamerSpec } = badkamerSamenstelling((veld) => String(formData.get(veld) ?? ""));
  const invoerVelden = /^(bereken|taal|onvoorzien|contactId|projectId|b_aantal|b\d+_|d_|s_aantal|s\d+_|q_|qb_|nieuwProject)/;
  const wizardQuery = new URLSearchParams(
    [...formData.entries()].filter(
      (e): e is [string, string] => typeof e[1] === "string" && e[1] !== "" && invoerVelden.test(e[0]),
    ),
  ).toString();
  const posten = await db
    .select()
    .from(priceBookItems)
    .where(eq(priceBookItems.active, true))
    .orderBy(asc(priceBookItems.sortOrder), asc(priceBookItems.name));

  const items: DocumentLineItem[] = [];
  const overgeslagen: string[] = [];
  const gebruikteHoofdstukken: string[] = [];
  const verkoopPerHoofdstuk: Record<string, number> = {};

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
      verkoopPerHoofdstuk[hoofdstuk] = (verkoopPerHoofdstuk[hoofdstuk] ?? 0) + qty * Number(p.priceEur);
      // Snijverlies vermelden we alleen als het aantal écht uit de calculator
      // komt: heeft iemand het vakje overgetypt, dan is dát zijn aantal en zou
      // "inclusief 10% snijverlies" een bewering zijn die niet klopt.
      const basis = parseMoney(String(formData.get(`qb_${p.id}`) ?? ""));
      const uitCalculator = basis != null && Math.abs(basis - qty) < 0.005;
      const snijverlies =
        uitCalculator && Number(p.wastePct) > 0
          ? snijverliesToelichting(qty / (1 + Number(p.wastePct) / 100), qty, p.wastePct, p.unit)
          : null;
      const omschrijving = [
        p.description,
        // Per-badkamer specificatie alleen op de installatieregel — niet op
        // elke post die toevallig per badkamer meetelt (ventilatie e.d.).
        p.name.startsWith("Badkamer installatie") && badkamerSpec ? badkamerSpec : null,
        snijverlies,
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
        category: "renovatie",
        phase: hoofdstuk,
        productId: p.productId ?? undefined,
      });
    }
  }
  if (items.length === 0) redirect("/calculator?fout=leeg");

  // Betalingsschema: vrij aantal termijnen met eigen omschrijving en %. De
  // terugval is dezelfde fase-lijst als het voorbeeld toonde — pas daarna het
  // vaste standaardschema.
  const auto = autoTermijnen(taal, verkoopPerHoofdstuk);
  const schemaStandaard = auto.length > 0 ? auto : SCHEMA_FASEN.map((f) => ({ label: f[taal], pct: f.standaard }));
  const sAantal = Math.min(
    Math.max(Number.parseInt(String(formData.get("s_aantal") ?? ""), 10) || schemaStandaard.length, 0),
    MAX_TERMIJNEN,
  );
  // De wizard toont de (fase-gebaseerde) waarden in de velden zelf, dus wat
  // hier binnenkomt is precies wat op het scherm stond.
  let termijnen = Array.from({ length: sAantal }, (_, idx) => {
    const i = idx + 1;
    return {
      label: String(formData.get(`s${i}_label`) ?? "").trim() || schemaStandaard[idx]?.label || `Termijn ${i}`,
      pct: parseMoney(String(formData.get(`s${i}_pct`) ?? "")) ?? schemaStandaard[idx]?.pct ?? 0,
    };
  });
  if (termijnen.reduce((s, t) => s + t.pct, 0) === 0) termijnen = schemaStandaard.map((t) => ({ ...t }));

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
    // Gestructureerd schema naast de leesbare tekst: bij akkoord worden
    // hieruit de termijn-proforma's op het project klaargezet.
    paymentSchedule: termijnen
      .filter((t) => t.pct > 0 && t.label)
      .map((t) => ({ label: t.label, pct: t.pct, amountEur: Math.round((totals.subtotal * t.pct) / 100) })),
    notes: [quoteClauses(taal), betalingsschemaTekst(taal, totals.subtotal, termijnen)].filter(Boolean).join("\n\n"),
    // Een gecalculeerde offerte is per definitie een volledige verbouwing: fases,
    // stelposten, betaling in termijnen. Die tekent de klant, in plaats van hem
    // met één klik weg te drukken. Uit te zetten op de offertepagina.
    requiresContract: true,
  });

  const kost = items.reduce((s, it) => s + (Number(it.costEur) || 0) * (Number(it.units) || 0), 0);
  await db.insert(activities).values({
    type: "note",
    subject: `Offerte ${docNumber} gecalculeerd uit het prijzenboek`,
    body: `${items.length} regels · verkoop ${round2(totals.subtotal)} · kostprijs ${round2(kost)}${
      overgeslagen.length ? ` · overgeslagen (geen prijs): ${overgeslagen.join(", ")}` : ""
    }${wizardQuery ? `\nGebruikte maten (opnieuw calculeren): /calculator?${wizardQuery}` : ""}`,
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
