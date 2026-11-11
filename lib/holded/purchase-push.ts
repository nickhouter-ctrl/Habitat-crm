import "server-only";
/**
 * Een goedgekeurde inkoopfactuur als CONCEPT in Holded boeken — alleen via de
 * knop, nooit vanzelf (Nick 09-11-2026). Specificatie zoals bij het keuren:
 * één regel per werf/werker/soort, met per regel het Holded-project, de
 * grootboekrekening en btw/IRPF, voorgesteld op basis van hoe jullie het in
 * Holded met de hand boeken (zie purchase-learning.ts).
 *
 * Veiligheid, zoals bij de weekfacturen (worker-holded-delivery.ts): eerst
 * terugzoeken (tag of factuurnummer bij hetzelfde contact), en een POST waarvan
 * het antwoord kwijt is wordt NOOIT opnieuw verstuurd — alleen teruggezocht.
 */
import { and, desc, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { activities, holdedSyncMap, projectCosts, projects, purchaseInvoiceReviews, purchaseOrders, timeEntries } from "@/lib/db/schema";
import type { AiInvoiceFields } from "@/lib/ai-invoice-extract";
import { poExVat } from "@/lib/purchase-orders";
import { downloadPurchaseOrderBuffer } from "@/lib/storage";
import { holded, holdedListAll, HoldedError } from "./client";
import { holdedProjecten } from "./sync";
import type { HoldedAccount, HoldedContact, HoldedDocument, HoldedTax } from "./types";
import {
  bookingProblems,
  bookingTotals,
  buildDraftLines,
  changedFromProposal,
  holdedPurchaseBody,
  purchaseTag,
  verifyRemote,
  type HoldedPushLine,
  type HoldedPushSnapshot,
} from "./purchase-booking";
import { suggestBooking, type HistoryLine } from "./purchase-learning";

const normTax = (s: string | null | undefined) => (s ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase().replace(/^ES(?=[A-Z0-9]{9}$)/, "");
const normName = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\b(s\.?l\.?u?|s\.?a\.?|sociedad limitada|ltd|bv|b\.v\.)\b/g, "").replace(/[^a-z0-9]/g, "");
const normDoc = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, "").toUpperCase();

export type ContactOption = { id: string; name: string; taxId: string | null };

export type PushContext = {
  po: typeof purchaseOrders.$inferSelect;
  /** Reden waarom deze factuur (nog) niet naar Holded kan. */
  blocked: string | null;
  exVat: number;
  invoiceTotal: number;
  supplier: string;
  docNumber: string;
  date: string;
  contact: { matched: ContactOption | null; how: "nif" | "naam" | null; candidates: ContactOption[]; canCreate: boolean };
  /** Bestaat er in Holded al een document voor deze factuur? */
  existing: { id: string; docNumber: string; total: number; draft: boolean } | null;
  lines: (HoldedPushLine & { basis: string })[];
  accounts: HoldedAccount[];
  taxes: HoldedTax[];
  holdedProjects: { id: string; name: string }[];
  ai: AiInvoiceFields | null;
};

/** Holded-gegevens die per push één keer nodig zijn. */
async function holdedReferenceData() {
  const [accounts, taxes, holdedProjects, docs, contacts] = await Promise.all([
    holded.request<HoldedAccount[]>("/accounting/v1/chartofaccounts"),
    holded.request<HoldedTax[]>("/invoicing/v1/taxes"),
    holdedProjecten(),
    holdedListAll((page) => holded.documents.list("purchase", { page }), 20),
    holdedListAll((page) => holded.contacts.list({ page }), 30),
  ]);
  return {
    accounts: (accounts ?? []).filter((a) => a.id && a.num).sort((a, b) => a.num - b.num),
    taxes: (taxes ?? []).filter((t) => t.scope === "purchases" && t.status !== false && (t.group === "iva" || t.group === "retention")),
    holdedProjects,
    docs: docs ?? [],
    contacts: contacts ?? [],
  };
}

function contactOption(c: HoldedContact): ContactOption {
  return { id: c.id, name: (c.name ?? "").trim(), taxId: c.code || c.vatnumber || null };
}

export async function loadPurchasePush(poId: string): Promise<PushContext> {
  const po = await db.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, poId) });
  if (!po) throw new Error("Inkooporder niet gevonden.");
  const review = await db.query.purchaseInvoiceReviews.findFirst({
    where: and(eq(purchaseInvoiceReviews.purchaseOrderId, poId), inArray(purchaseInvoiceReviews.status, ["approved", "superseded"])),
  });
  const ai = (review?.aiFields as AiInvoiceFields | null) ?? null;

  const ref = await holdedReferenceData();
  const ex = poExVat(po);
  const exVat = ex.amount;
  const invoiceTotal = Number(po.total) || 0;
  const supplier = po.supplier;
  const docNumber = (ai?.invoiceNumber ?? po.reference ?? "").trim();
  const date = po.orderDate ?? new Date().toISOString().slice(0, 10);

  let blocked: string | null = null;
  if (po.kind !== "invoice") blocked = "Alleen inkoopfacturen kunnen naar Holded, geen bestellingen.";
  else if (ex.vatUnknown) blocked = "Het btw-bedrag van deze factuur is onbekend. Vul subtotaal en btw in via Bewerken.";
  else if (review?.proposedCurrency && review.proposedCurrency.toUpperCase() !== "EUR")
    blocked = `Deze factuur is in ${review.proposedCurrency}. Facturen in vreemde valuta boek je voorlopig met de hand in Holded.`;
  else if (po.holdedPushStatus === "posting" || po.holdedPushStatus === "unknown")
    blocked = "De vorige verzending is onzeker. Zoek hem eerst terug in Holded (knop hieronder); er wordt niets dubbel geboekt.";

  // Contact: eerst op NIF/CIF, dan op exact dezelfde naam — nooit gokken.
  const options = ref.contacts.map(contactOption);
  const tax = normTax(ai?.supplierTaxId);
  let matched: ContactOption | null = null, how: "nif" | "naam" | null = null;
  if (tax) {
    const m = ref.contacts.filter((c) => [c.code, c.vatnumber].some((v) => normTax(v) === tax));
    if (m.length === 1) { matched = contactOption(m[0]); how = "nif"; }
  }
  if (!matched) {
    const names = [supplier, ai?.supplierLegalName].map(normName).filter(Boolean);
    const m = ref.contacts.filter((c) => names.includes(normName(c.name)));
    if (m.length === 1) { matched = contactOption(m[0]); how = "naam"; }
  }
  const firstWord = normName(supplier.split(/\s+/)[0]).slice(0, 5);
  const candidates = matched
    ? []
    : options.filter((o) => firstWord.length >= 3 && normName(o.name).includes(firstWord)).slice(0, 15);

  // Bestaat hij al in Holded? Op onze tag, of op factuurnummer bij hetzelfde contact.
  const tagged = ref.docs.filter((d) => d.tags?.includes(purchaseTag(poId)) || String(d.notes ?? "").includes(purchaseTag(poId)));
  const sameNumber = docNumber
    ? ref.docs.filter((d) => normDoc(d.docNumber) === normDoc(docNumber) && (!matched || d.contact === matched.id))
    : [];
  const hit = (po.holdedId ? ref.docs.find((d) => d.id === po.holdedId) : undefined) ?? tagged[0] ?? (matched ? sameNumber[0] : undefined);
  const existing = hit
    ? { id: hit.id, docNumber: hit.docNumber ?? "", total: Number(hit.total) || 0, draft: !hit.approvedAt }
    : null;

  // Regels zoals bij het keuren geboekt.
  const [tes, costs] = await Promise.all([
    db.select({ projectId: timeEntries.projectId, workerName: timeEntries.workerName, hours: timeEntries.hours, rate: timeEntries.hourlyCostEur })
      .from(timeEntries).where(eq(timeEntries.purchaseOrderId, poId)),
    db.select({ projectId: projectCosts.projectId, category: projectCosts.category, description: projectCosts.description, amount: projectCosts.amountEur })
      .from(projectCosts).where(eq(projectCosts.purchaseOrderId, poId)),
  ]);
  const projectIds = [...new Set([po.projectId, ...tes.map((t) => t.projectId), ...costs.map((c) => c.projectId)].filter(Boolean) as string[])];
  const projRows = projectIds.length
    ? await db.select({ id: projects.id, name: projects.name, holdedProjectId: projects.holdedProjectId }).from(projects).where(inArray(projects.id, projectIds))
    : [];
  const projMap = new Map(projRows.map((p) => [p.id, p]));

  const draft = buildDraftLines({
    exVat,
    poProjectId: po.projectId,
    countAsLabor: po.countAsLabor,
    timeEntries: tes.map((t) => ({ projectId: t.projectId, workerName: t.workerName, hours: Number(t.hours), rate: Number(t.rate) })),
    costs: costs.map((c) => ({ projectId: c.projectId, category: c.category, description: c.description, amount: Number(c.amount) })),
    projectNames: new Map(projRows.map((p) => [p.id, p.name])),
    fallbackDesc: [po.reference, ai?.projectHint].filter(Boolean).join(" · ") || supplier,
  });

  const history: HistoryLine[] = ref.docs.flatMap((d: HoldedDocument) =>
    (d.products ?? []).map((l) => ({ contact: d.contact ?? null, date: d.date ?? 0, name: l.name, desc: l.desc, units: l.units, price: l.price, account: l.account, taxes: l.taxes })),
  );
  const vatExempt = !!ai?.vatExemptionNote && /sujeto pasivo|inversi[oó]n|exent|84\.?\s*uno|art\.?\s*20/i.test(ai.vatExemptionNote);
  const vatRate = ai?.vatRate ?? (exVat ? Math.round(((invoiceTotal + (ai?.retentionAmount ?? 0) - exVat) / exVat) * 100) : null);
  // Werven zonder vaste Holded-koppeling (Showroom Donny, beurs): neem de keuze
  // van de vorige inkoop-push op die werf over. Bewust niet op het project zelf
  // vastgelegd — voor verkoop blijven die werven ongekoppeld.
  const eerder = new Map<string, string>();
  const vorige = await db
    .select({ lines: purchaseOrders.holdedPushLines })
    .from(purchaseOrders)
    .where(isNotNull(purchaseOrders.holdedPushLines))
    .orderBy(desc(purchaseOrders.holdedPushAt))
    .limit(200);
  for (const v of vorige)
    for (const l of v.lines?.lines ?? [])
      if (l.crmProjectId && l.holdedProjectId && !eerder.has(l.crmProjectId)) eerder.set(l.crmProjectId, l.holdedProjectId);

  const lines = draft.map((l) => {
    const s = suggestBooking({ history, contactId: matched?.id ?? null, kind: l.kind, vatRate, vatExempt, retentionPct: ai?.retentionPct ?? null, taxes: ref.taxes });
    const holdedProjectId = l.crmProjectId ? projMap.get(l.crmProjectId)?.holdedProjectId ?? eerder.get(l.crmProjectId) ?? null : null;
    return { ...l, holdedProjectId, account: s.account, vat: s.vat, retention: s.retention, basis: s.basis };
  });

  return {
    po,
    blocked,
    exVat,
    invoiceTotal,
    supplier,
    docNumber,
    date,
    contact: { matched, how, candidates, canCreate: !!tax && !!(ai?.supplierLegalName || supplier) },
    existing,
    lines,
    accounts: ref.accounts,
    taxes: ref.taxes,
    holdedProjects: ref.holdedProjects,
    ai,
  };
}

export type PushInput = {
  poId: string;
  docNumber: string;
  /** Holded contact-id, of "new" om er een aan te maken op NIF/CIF. */
  contactId: string;
  /** Per regel-key wat er gekozen is; aantallen en bedragen komen altijd uit het keuren. */
  choices: Record<string, { account: string; vat: string; retention: string | null; holdedProjectId: string | null; desc: string }>;
  userId: string | null;
};

export type PushResult = { ok: boolean; message: string; holdedId?: string; warnings?: string[] };

async function attachPdf(holdedId: string, po: typeof purchaseOrders.$inferSelect): Promise<string | null> {
  const atts = (po.attachments ?? []) as { name: string; path: string }[];
  const pdf = atts.find((a) => /\.pdf$/i.test(a.name)) ?? atts[0];
  if (!pdf) return "Geen bijlage om mee te sturen.";
  try {
    const buf = await downloadPurchaseOrderBuffer(pdf.path);
    if (!buf) return "Bijlage niet gevonden in de opslag.";
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(buf)]), pdf.name);
    form.append("setMain", "true");
    const base = (process.env.HOLDED_API_BASE ?? "https://api.holded.com/api").replace(/\/$/, "");
    const res = await fetch(`${base}/invoicing/v1/documents/purchase/${holdedId}/attach`, {
      method: "POST",
      headers: { key: process.env.HOLDED_API_KEY ?? "" },
      body: form,
      signal: AbortSignal.timeout(20000),
    });
    return res.ok ? null : `PDF niet meegestuurd (Holded ${res.status}) — voeg hem in Holded toe.`;
  } catch {
    return "PDF niet meegestuurd — voeg hem in Holded toe.";
  }
}

async function remember(poId: string, holdedId: string) {
  await db.update(purchaseOrders).set({ holdedId, updatedAt: new Date() }).where(eq(purchaseOrders.id, poId));
  await db
    .insert(holdedSyncMap)
    .values({ entityType: "document", localId: poId, holdedId, lastSyncedAt: new Date(), lastSyncDirection: "push" })
    .onConflictDoNothing();
}

const zonderBasis = ({ basis, ...l }: HoldedPushLine & { basis: string }): HoldedPushLine => {
  void basis;
  return l;
};

export async function pushPurchaseToHolded(input: PushInput): Promise<PushResult> {
  if (process.env.CRM_EXTERNAL_EFFECTS === "disabled") return { ok: false, message: "Externe koppelingen staan uit in deze omgeving." };
  const ctx = await loadPurchasePush(input.poId);
  if (ctx.blocked) return { ok: false, message: ctx.blocked };
  if (ctx.po.holdedId || ctx.existing) {
    return { ok: false, message: "Deze factuur staat al in Holded. Koppel hem aan dat document in plaats van opnieuw te boeken." };
  }

  const accountIds = new Set(ctx.accounts.map((a) => a.id));
  const taxKeys = new Map(ctx.taxes.map((t) => [t.key, t]));
  const projectIdsHolded = new Set(ctx.holdedProjects.map((p) => p.id));
  const lines: HoldedPushLine[] = ctx.lines.map(zonderBasis).map((l) => {
    const c = input.choices[l.key];
    if (!c) return l;
    return {
      ...l,
      account: accountIds.has(c.account) ? c.account : null,
      vat: taxKeys.get(c.vat)?.group === "iva" ? c.vat : l.vat,
      retention: c.retention && taxKeys.get(c.retention)?.group === "retention" ? c.retention : null,
      holdedProjectId: c.holdedProjectId && projectIdsHolded.has(c.holdedProjectId) ? c.holdedProjectId : null,
      desc: c.desc.trim().slice(0, 250) || l.desc,
    };
  });
  const proposed = ctx.lines.map(zonderBasis);
  const totals = bookingTotals(lines, taxKeys);
  const docNumber = input.docNumber.trim();
  const contactId = input.contactId === "new" ? (ctx.contact.canCreate ? "new" : null) : input.contactId || null;
  const problems = bookingProblems({ lines, totals, exVat: ctx.exVat, invoiceTotal: ctx.invoiceTotal, contactId, docNumber });
  if (problems.length) return { ok: false, message: problems.join(" ") };

  // Ander document met hetzelfde nummer bij het gekozen contact? Dan niet boeken.
  if (contactId !== "new") {
    const docs = await holdedListAll((page) => holded.documents.list("purchase", { page }), 20);
    const dup = docs.find((d) => normDoc(d.docNumber) === normDoc(docNumber) && d.contact === contactId);
    if (dup) return { ok: false, message: `In Holded staat bij dit contact al factuur ${dup.docNumber}. Koppel hem daaraan in plaats van opnieuw te boeken.` };
  }

  // Claim: maar één verzending tegelijk, en nooit over een onzekere heen.
  const claimed = await db
    .update(purchaseOrders)
    .set({ holdedPushStatus: "posting", holdedPushAt: new Date(), holdedPushError: null })
    .where(and(eq(purchaseOrders.id, input.poId), isNull(purchaseOrders.holdedId), or(isNull(purchaseOrders.holdedPushStatus), eq(purchaseOrders.holdedPushStatus, "error"))))
    .returning({ id: purchaseOrders.id });
  if (!claimed.length) return { ok: false, message: "Deze factuur wordt al verstuurd of de vorige verzending is onzeker." };

  const fail = async (status: "error" | "unknown", message: string): Promise<PushResult> => {
    await db.update(purchaseOrders).set({ holdedPushStatus: status, holdedPushError: message }).where(eq(purchaseOrders.id, input.poId));
    return { ok: false, message };
  };

  let contact = contactId!;
  if (contact === "new") {
    try {
      const ai = ctx.ai;
      const r = await holded.contacts.create({
        name: (ai?.supplierLegalName || ctx.supplier).trim(),
        code: ai?.supplierTaxId?.trim(),
        type: "supplier",
        ...(ai?.supplierEmail ? { email: ai.supplierEmail } : {}),
        ...(ai?.supplierAddress ? { billAddress: { address: ai.supplierAddress } } : {}),
      });
      if (!r.id) return fail("error", "Holded maakte geen contact aan.");
      contact = r.id;
    } catch (e) {
      return fail("error", `Contact aanmaken in Holded mislukt: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const body = holdedPurchaseBody({ poId: input.poId, contactId: contact, docNumber, date: ctx.date, supplier: ctx.supplier, lines });
  const sent: HoldedPushSnapshot = { contactId: contact, docNumber, date: ctx.date, lines, totals };
  const proposedSnap: HoldedPushSnapshot = { contactId: ctx.contact.matched?.id ?? null, docNumber: ctx.docNumber, date: ctx.date, lines: proposed, totals: bookingTotals(proposed, taxKeys) };

  let holdedId: string;
  try {
    const r = await holded.documents.create("purchase", body);
    if (!r?.id) return fail("unknown", "Holded gaf geen document-id terug. Zoek de factuur terug in Holded voordat je opnieuw boekt.");
    holdedId = r.id;
  } catch (e) {
    // Een 4xx is een weigering: er is niets aangemaakt. Alles anders (time-out,
    // 5xx) kan wél aangekomen zijn — dan alleen terugzoeken.
    if (e instanceof HoldedError && e.status >= 400 && e.status < 500)
      return fail("error", `Holded weigerde de factuur (${e.status}): ${JSON.stringify(e.body).slice(0, 300)}`);
    return fail("unknown", "Geen antwoord van Holded. Zoek de factuur terug in Holded; er wordt niet opnieuw geboekt.");
  }

  await remember(input.poId, holdedId);
  const warnings: string[] = [];
  try {
    const remote = await holded.documents.get("purchase", holdedId);
    warnings.push(...verifyRemote(remote, sent));
    if (remote.approvedAt) warnings.push("Holded heeft de factuur meteen definitief gemaakt in plaats van als concept.");
  } catch {
    warnings.push("Kon de factuur niet terugladen uit Holded om te controleren.");
  }
  const attachWarn = await attachPdf(holdedId, ctx.po);
  if (attachWarn) warnings.push(attachWarn);

  await db
    .update(purchaseOrders)
    .set({ holdedPushStatus: "sent", holdedPushError: warnings.length ? warnings.join(" ") : null, holdedPushLines: sent, holdedPushProposed: proposedSnap, updatedAt: new Date() })
    .where(eq(purchaseOrders.id, input.poId));
  const changed = changedFromProposal(proposed, lines);
  await db.insert(activities).values({
    type: "note",
    subject: `Inkoopfactuur als concept in Holded: ${ctx.supplier} · ${docNumber}`,
    body: `${lines.length} regel(s), ${changed} aangepast t.o.v. het voorstel.${warnings.length ? ` Let op: ${warnings.join(" ")}` : ""}`,
    authorId: input.userId,
  });
  return { ok: true, holdedId, warnings, message: warnings.length ? "Als concept in Holded gezet, met opmerkingen." : "Als concept in Holded gezet." };
}

/** Koppel aan een document dat al in Holded staat (handmatig geboekt of eerdere push). */
export async function linkExistingPurchase(poId: string, holdedId: string): Promise<PushResult> {
  const doc = await holded.documents.get("purchase", holdedId);
  if (!doc?.id) return { ok: false, message: "Document niet gevonden in Holded." };
  await remember(poId, doc.id);
  await db.update(purchaseOrders).set({ holdedPushStatus: "sent", holdedPushError: null, updatedAt: new Date() }).where(eq(purchaseOrders.id, poId));
  return { ok: true, holdedId: doc.id, message: `Gekoppeld aan Holded-factuur ${doc.docNumber ?? ""}.` };
}

/** Na een onzekere verzending: terugzoeken op onze tag. Niet gevonden = vrijgeven voor een nieuwe poging. */
export async function recoverUncertainPush(poId: string, confirmNotInHolded: boolean): Promise<PushResult> {
  const docs = await holdedListAll((page) => holded.documents.list("purchase", { page }), 20);
  const hit = docs.find((d) => d.tags?.includes(purchaseTag(poId)) || String(d.notes ?? "").includes(purchaseTag(poId)));
  if (hit) return linkExistingPurchase(poId, hit.id);
  if (!confirmNotInHolded) return { ok: false, message: "Niet teruggevonden op de CRM-markering. Kijk zelf in Holded; staat hij er niet, bevestig dat dan." };
  await db.update(purchaseOrders).set({ holdedPushStatus: "error", holdedPushError: "Niet in Holded aangekomen (gecontroleerd)." }).where(eq(purchaseOrders.id, poId));
  return { ok: true, message: "Vrijgegeven: je kunt opnieuw boeken." };
}
