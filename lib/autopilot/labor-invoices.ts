/**
 * Autopilot urenfacturen (afspraak Nick 21-11-2026): Pieter en Luis sturen een
 * factuur en — vaak in een aparte mail — een Excel-urenstaat met per dag de
 * uren per werf. Klopt alles exact, dan keurt het systeem de factuur zelf goed
 * en boekt het de uren per dag op de juiste werven.
 *
 * "Klopt" betekent allemaal tegelijk:
 *  - er is precies één urenstaat van dezelfde afzender waarvan uren × tarief
 *    op de cent het factuurbedrag ex btw is;
 *  - de persoon op de staat is één ploeglid, en de PRIJS op de staat is zijn tarief;
 *  - de staat telt zelf op (dagen ↔ totaalregel, uren × prijs ↔ bedrag);
 *  - elke werfkolom met uren hoort bij precies één project (projectaliassen);
 *  - per dag tellen de werfkolommen op tot UREN, of er staat maar één werf;
 *  - die persoon heeft op die dagen nog geen uren, en de staat is nog niet gebruikt.
 *
 * Kloppen de BEDRAGEN niet (fout van de leverancier), dan gaat de factuur met
 * een mail terug naar de afzender met wat er niet klopt (Nick: "dat komt nog
 * wel eens voor"); zijn verbeterde factuur komt vanzelf weer in de wachtrij.
 * Ligt het aan ons (onbekende werfkolom, al uren op die dag) → blijft staan
 * voor Nick, met de reden erbij.
 *
 * Er komen nooit uren dubbel: de factuur is de enige boeking, de staat levert
 * alleen de verdeling. De staat zelf maakt geen eigen kaart in de wachtrij.
 */
import "server-only";

import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { emailInbox, mailAttachments, purchaseInvoiceReviews, purchaseOrders, workers } from "@/lib/db/schema";
import { alleAliassen, normaliseerLabel, zoekProject } from "@/lib/project-aliases";
import { approveInvoiceReview, rejectInvoiceReview } from "@/lib/purchase-invoice-intake";
import { autoPushLaborInvoice } from "./labor-holded";
import { copyMailAttachmentToPoBucket, downloadMailAttachmentBuffer } from "@/lib/storage";
import { dagVerdeling, parseWideTimesheet, type WideTimesheet } from "@/lib/timesheet-wide";
import { workerRate } from "@/lib/worker-rate";

export type LaborDecision = {
  reviewId: string;
  supplier: string;
  reference: string | null;
  amount: number | null;
  outcome: "approved" | "returned" | "manual";
  reasons: string[];
  /** Korte samenvatting: "LUIS 31 u: Silvestre 20 u, Finca Lisa 11 u". */
  summary: string | null;
  sheet: string | null;
  /** Wat er met Holded gebeurde (concept gezet, of waarom niet). */
  holded?: string | null;
  at: string;
};

/** Een bevinding; `supplier` = fout van de leverancier → terugsturen. */
export type Finding = { text: string; supplier: boolean };
type Entry = { projectId: string; date: string; hours: number; workerId: string; workerName: string; hourlyCostEur: number; paymentMethod: "cash" | "invoice"; note: string; work: string[] };
type WorkerLike = { id: string; name: string; active: boolean; defaultPaymentMethod: "cash" | "invoice"; hourlyCostEur: string | null; hourlyCostCashEur: string | null };

const key = (id: string) => `autopilot:labor:${id}`;
const r2 = (n: number) => Math.round(n * 100) / 100;
const eur = (n: number) => `€ ${n.toFixed(2).replace(".", ",")}`;
const sheetTag = (attachmentId: string) => `[urenstaat:${attachmentId}]`;
/** Pas terugsturen als de factuur zo oud is: de urenstaat komt soms in een tweede mail. */
const RETURN_AFTER_MS = 2 * 3600_000;

/** Persoon op de staat: een woord uit titel/bestandsnaam dat in precies één ploegnaam voorkomt. */
export function workerForSheet<T extends { name: string; active: boolean }>(words: string[], ploeg: T[]): T | null {
  const hits = ploeg.filter((w) => w.active &&
    w.name.split(/\s+/).map(normaliseerLabel).filter((x) => x.length >= 3).some((x) => words.includes(x)));
  return hits.length === 1 ? hits[0] : null;
}

/** Pure kern: maakt van een staat de urenregels, of zegt waarom niet. */
export function planFromSheet(args: {
  sheet: WideTimesheet;
  worker: WorkerLike;
  subtotal: number;
  resolve: (label: string) => { projectId: string; projectNaam: string } | null;
  tag: string;
}): { findings: Finding[]; entries: Entry[]; summary: string } {
  const { sheet, worker, subtotal } = args;
  const findings: Finding[] = sheet.warnings.map((text) => ({ text, supplier: true }));
  const rate = workerRate(worker, worker.defaultPaymentMethod);
  if (rate == null) findings.push({ text: `Geen uurtarief bij ${worker.name}`, supplier: false });
  const rates = [...new Set(sheet.rows.map((r) => r.rate).filter((x): x is number => x != null))];
  if (rate != null && rates.some((x) => Math.abs(x - rate) > 0.001))
    findings.push({ text: `Het uurtarief op de urenstaat (${rates.map(eur).join(", ")}) is niet het afgesproken tarief van ${eur(rate)}`, supplier: true });
  if (rate != null && Math.abs(r2(sheet.totalHours * rate) - subtotal) > 0.01)
    findings.push({ text: `Volgens de urenstaat is het ${sheet.totalHours} uur × ${eur(rate)} = ${eur(r2(sheet.totalHours * rate))}, maar de factuur is ${eur(subtotal)} ex btw`, supplier: true });

  const perProject = new Map<string, { naam: string; hours: number }>();
  const entries: Entry[] = [];
  for (const row of sheet.rows) {
    const verdeling = dagVerdeling(row);
    if (!verdeling) {
      findings.push({ text: `${row.date ?? "?"}: de uren per werf (${row.sites.map((s) => `${s.label} ${s.hours}`).join(", ")}) tellen niet op tot ${row.hours} uur`, supplier: true });
      continue;
    }
    const afwijkend = row.sites.length === 1 && row.hours != null && Math.abs(row.sites[0].hours - row.hours) > 0.01;
    for (const s of verdeling) {
      const p = args.resolve(s.label);
      if (!p) { findings.push({ text: `Werfkolom "${s.label}" is aan geen (of meer dan één) project gekoppeld`, supplier: false }); continue; }
      if (!row.date) continue;
      const bestaand = entries.find((e) => e.projectId === p.projectId && e.date === row.date);
      if (bestaand) { bestaand.hours = r2(bestaand.hours + s.hours); if (row.note) bestaand.work.push(row.note); }
      else entries.push({
        work: row.note ? [row.note] : [],
        projectId: p.projectId, date: row.date, hours: s.hours,
        workerId: worker.id, workerName: worker.name, hourlyCostEur: rate ?? 0, paymentMethod: worker.defaultPaymentMethod,
        note: [`Urenstaat ${args.tag}`, row.note, `kolom ${s.label}`, afwijkend ? `werfkolom ${row.sites[0].hours} u, gefactureerd ${row.hours} u` : null].filter(Boolean).join(" · "),
      });
      const pp = perProject.get(p.projectId) ?? { naam: p.projectNaam, hours: 0 };
      pp.hours = r2(pp.hours + s.hours);
      perProject.set(p.projectId, pp);
    }
  }
  const uniek = [...new Map(findings.map((f) => [f.text, f])).values()];
  const summary = `${worker.name} ${sheet.totalHours} u${perProject.size ? `: ${[...perProject.values()].map((p) => `${p.naam} ${p.hours} u`).join(", ")}` : ""}`;
  return { findings: uniek, entries, summary };
}

/** Mail aan de leverancier: wat klopt er niet, en graag verbeterd terugsturen. */
export function returnMail(args: { name: string; invoice: string; amount: number; sheet: string; findings: Finding[] }) {
  const voornaam = args.name.split(/\s+/)[0] || args.name;
  const punten = args.findings.filter((f) => f.supplier).map((f) => f.text);
  const text = [
    `Hoi ${voornaam},`,
    "",
    `Bij factuur ${args.invoice} (${eur(args.amount)} ex btw) klopt iets niet met de urenstaat "${args.sheet}":`,
    "",
    ...punten.map((p) => `- ${p}`),
    "",
    "Wil je de factuur of de urenstaat aanpassen en opnieuw naar dit adres sturen? Dan verwerken we hem meteen.",
    "",
    "Groet,",
    "Habitat One",
  ].join("\n");
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#2a2520">
<p>Hoi ${esc(voornaam)},</p>
<p>Bij factuur ${esc(args.invoice)} (${esc(eur(args.amount))} ex btw) klopt iets niet met de urenstaat "${esc(args.sheet)}":</p>
<ul>${punten.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
<p>Wil je de factuur of de urenstaat aanpassen en opnieuw naar dit adres sturen? Dan verwerken we hem meteen.</p>
<p>Groet,<br>Habitat One</p></div>`;
  return { subject: `Factuur ${args.invoice}: bedrag klopt niet met urenstaat`, text, html };
}

type Pending = { id: string; supplier: string | null; reference: string | null; subtotal: string | null; createdAt: Date; aiFields: unknown; mailAttachmentId: string; fromEmail: string; receivedAt: Date | null; filename: string | null };
type Sheet = { attachmentId: string; filename: string; storagePath: string; sizeBytes: number | null; receivedAt: Date; parsed: WideTimesheet; worker: WorkerLike };

type Plan = {
  review: Pending;
  sheet: Sheet | null;
  exact: boolean;
  findings: Finding[];
  entries: Entry[];
  summary: string | null;
};

async function loadSheets(fromEmail: string, from: Date, to: Date, exclude: string[], ploeg: WorkerLike[]): Promise<Sheet[]> {
  const rows = await db
    .select({ id: mailAttachments.id, filename: mailAttachments.filename, storagePath: mailAttachments.storagePath, sizeBytes: mailAttachments.sizeBytes, receivedAt: emailInbox.receivedAt })
    .from(mailAttachments)
    .innerJoin(emailInbox, eq(emailInbox.id, mailAttachments.emailId))
    .where(and(
      sql`lower(${emailInbox.fromEmail}) = ${fromEmail.toLowerCase()}`,
      sql`${mailAttachments.filename} ~* '\\.(xlsx|xls|xlsm)$'`,
      sql`${emailInbox.receivedAt} between ${from.toISOString()}::timestamptz and ${to.toISOString()}::timestamptz`,
      // Al gebruikt voor een goedgekeurde factuur → nooit nog eens.
      sql`not exists (select 1 from time_entries t where t.note like '%' || ${"[urenstaat:"} || ${mailAttachments.id}::text || ']%')`,
    ));
  const out: Sheet[] = [];
  for (const s of rows) {
    if (exclude.includes(s.id)) continue;
    const bytes = await downloadMailAttachmentBuffer(s.storagePath).catch(() => null);
    const parsed = bytes ? parseWideTimesheet(bytes, s.filename) : null;
    if (!parsed) continue;
    const worker = workerForSheet(parsed.workerWords, ploeg);
    if (!worker) continue;
    out.push({ attachmentId: s.id, filename: s.filename, storagePath: s.storagePath, sizeBytes: s.sizeBytes, receivedAt: s.receivedAt ?? new Date(0), parsed, worker });
  }
  return out;
}

/**
 * Pieter werkt vaak vaste weken (5 × 8 uur), dus twee staten kunnen op
 * hetzelfde bedrag uitkomen, en oude, met de hand geboekte staten liggen er ook
 * nog. Kies de staat die het dichtst bij de factuur binnenkwam — mits binnen
 * 7 dagen en duidelijk de dichtstbijzijnde (de volgende ligt ≥ 2 dagen verder).
 */
export function closestSheet<T extends { receivedAt: Date }>(candidates: T[], invoiceAt: Date): T | null {
  const dist = (s: T) => Math.abs(s.receivedAt.getTime() - invoiceAt.getTime());
  const sorted = [...candidates].sort((a, b) => dist(a) - dist(b));
  if (!sorted[0] || dist(sorted[0]) > 7 * 86400_000) return null;
  if (sorted[1] && dist(sorted[1]) - dist(sorted[0]) < 2 * 86400_000) return null;
  return sorted[0];
}

const amountOf = (s: Sheet) => {
  const rate = workerRate(s.worker, s.worker.defaultPaymentMethod);
  return rate == null ? null : r2(s.parsed.totalHours * rate);
};

/**
 * Koppelt wachtende urenfacturen aan urenstaten van dezelfde afzender. Eerst de
 * exacte (bedrag = uren × tarief). Wat overblijft wordt alleen gekoppeld als
 * het ondubbelzinnig is: de naam van de persoon staat op de factuur, of er is
 * precies één factuur en één staat over. Dat paar klopt dan per definitie niet.
 */
export async function planLaborInvoices(): Promise<Plan[]> {
  const pending = (await db
    .select({
      id: purchaseInvoiceReviews.id, supplier: purchaseInvoiceReviews.proposedSupplier, reference: purchaseInvoiceReviews.proposedReference,
      subtotal: purchaseInvoiceReviews.proposedSubtotal, createdAt: purchaseInvoiceReviews.createdAt, aiFields: purchaseInvoiceReviews.aiFields,
      mailAttachmentId: purchaseInvoiceReviews.mailAttachmentId, fromEmail: emailInbox.fromEmail, receivedAt: emailInbox.receivedAt, filename: mailAttachments.filename,
    })
    .from(purchaseInvoiceReviews)
    .innerJoin(emailInbox, eq(emailInbox.id, purchaseInvoiceReviews.emailId))
    .leftJoin(mailAttachments, eq(mailAttachments.id, purchaseInvoiceReviews.mailAttachmentId))
    .where(and(
      eq(purchaseInvoiceReviews.status, "pending"),
      eq(purchaseInvoiceReviews.suggestedKind, "labor"),
      eq(purchaseInvoiceReviews.aiReadOk, true),
      gt(purchaseInvoiceReviews.createdAt, sql`now() - interval '30 days'`),
      sql`coalesce(${purchaseInvoiceReviews.aiFields}->>'documentType', '') <> 'timesheet'`,
      sql`${emailInbox.fromEmail} is not null`,
    ))
    .limit(30)) as Pending[];
  if (pending.length === 0) return [];

  const ploeg = (await db.select().from(workers)) as WorkerLike[];
  const aliassen = await alleAliassen();
  const projecten = await db.execute(sql`select id, name from projects where status <> 'archived'`) as unknown as { id: string; name: string }[];

  const plans: Plan[] = [];
  const bySender = new Map<string, Pending[]>();
  for (const p of pending) bySender.set(p.fromEmail.toLowerCase(), [...(bySender.get(p.fromEmail.toLowerCase()) ?? []), p]);

  for (const [sender, reviews] of bySender) {
    const times = reviews.map((r) => (r.receivedAt ?? r.createdAt).getTime());
    const sheets = await loadSheets(sender, new Date(Math.min(...times) - 30 * 86400_000), new Date(Math.max(...times) + 7 * 86400_000), reviews.map((r) => r.mailAttachmentId), ploeg);
    if (sheets.length === 0) continue;

    const make = (review: Pending, sheet: Sheet, exact: boolean): Plan => {
      const supplier = review.supplier ?? null;
      const resolve = (label: string) => {
        const a = zoekProject(aliassen, label, supplier);
        if (a) return { projectId: a.projectId, projectNaam: a.projectNaam };
        const p = projecten.filter((x) => normaliseerLabel(x.name) === normaliseerLabel(label));
        return p.length === 1 ? { projectId: p[0].id, projectNaam: p[0].name } : null;
      };
      const plan = planFromSheet({ sheet: sheet.parsed, worker: sheet.worker, subtotal: Number(review.subtotal ?? 0), resolve, tag: sheetTag(sheet.attachmentId) });
      return { review, sheet, exact, ...plan };
    };

    const usedSheets = new Set<string>();
    const left: Pending[] = [];
    for (const r of reviews) {
      const sub = r.subtotal != null ? Number(r.subtotal) : null;
      const at = r.receivedAt ?? r.createdAt;
      const exact = sub ? sheets.filter((s) => !usedSheets.has(s.attachmentId) && amountOf(s) != null && Math.abs(amountOf(s)! - sub) <= 0.01) : [];
      const pick = closestSheet(exact, at);
      if (pick) {
        usedSheets.add(pick.attachmentId);
        plans.push(make(r, pick, true));
      } else if (exact.filter((s) => Math.abs(s.receivedAt.getTime() - at.getTime()) <= 7 * 86400_000).length > 1) {
        plans.push({ review: r, sheet: null, exact: false, entries: [], summary: null, findings: [{ text: `Meerdere urenstaten komen op hetzelfde bedrag uit (${exact.map((s) => s.filename).join(", ")})`, supplier: false }] });
      } else left.push(r);
    }
    const leftSheets = sheets.filter((s) => !usedSheets.has(s.attachmentId));
    for (const r of left) {
      const tekst = normaliseerLabel(`${r.reference ?? ""} ${r.filename ?? ""} ${JSON.stringify(r.aiFields ?? {})}`);
      // Naam van de persoon op de factuur — maar de naam van de leverancier zelf
      // (Pieter) staat op elke factuur, dus die telt alleen als niemand anders genoemd wordt.
      const genoemd = leftSheets.filter((s) => s.worker.name.split(/\s+/).map(normaliseerLabel).some((w) => w.length >= 3 && tekst.includes(w)));
      const zonderLeverancier = genoemd.filter((s) => !s.worker.name.split(/\s+/).map(normaliseerLabel).some((w) => w.length >= 3 && normaliseerLabel(r.supplier ?? "").includes(w)));
      const at = r.receivedAt ?? r.createdAt;
      const keuze = closestSheet(zonderLeverancier.length ? zonderLeverancier : genoemd.length ? genoemd : left.length === 1 ? leftSheets : [], at);
      if (keuze) plans.push(make(r, keuze, false));
    }
  }

  // Al uren op die dagen voor deze persoon (portaal, eerdere factuur)? Dan niet.
  for (const p of plans) {
    if (!p.sheet || p.entries.length === 0) continue;
    const dagen = [...new Set(p.entries.map((e) => e.date))];
    const bezet = await db.execute(sql`select distinct date::text as d from time_entries
      where (worker_id = ${p.sheet.worker.id} or lower(worker_name) = ${p.sheet.worker.name.toLowerCase()})
        and date in (${sql.join(dagen.map((d) => sql`${d}::date`), sql`, `)}) order by 1`) as unknown as { d: string }[];
    if (bezet.length) p.findings.push({ text: `${p.sheet.worker.name} heeft al uren op ${bezet.map((b) => b.d).join(", ")}`, supplier: false });
  }
  return plans;
}

async function save(d: LaborDecision) {
  await db.execute(sql`insert into kv_cache(key, value) values (${key(d.reviewId)}, ${JSON.stringify(d)}::jsonb)
    on conflict (key) do update set value = excluded.value, updated_at = now()`);
}

/** Factuurnummer voor in de mail: uit de AI-velden, anders de referentie. */
function invoiceLabel(r: Pending): string {
  const n = (r.aiFields as { invoiceNumber?: string } | null)?.invoiceNumber;
  return n || r.reference || r.filename || "factuur";
}

/**
 * Elke autopilot-ronde. `dryRun` laat alleen zien wat er zou gebeuren.
 * Terugmailen kan uit met AUTOPILOT_LABOR_RETURN_MAIL=off.
 */
export async function runLaborInvoiceAutopilot(opts: { dryRun?: boolean } = {}) {
  const plans = await planLaborInvoices();
  const results: (LaborDecision & { plan?: Plan })[] = [];
  const mailAan = process.env.AUTOPILOT_LABOR_RETURN_MAIL !== "off";

  for (const p of plans) {
    const r = p.review;
    const amount = r.subtotal != null ? Number(r.subtotal) : null;
    const supplierFaults = p.findings.filter((f) => f.supplier);
    const ourFaults = p.findings.filter((f) => !f.supplier);
    let outcome: LaborDecision["outcome"] = "manual";
    let holdedNote: string | null = null;
    let reasons = p.findings.map((f) => f.text);

    const kanGoed = p.sheet && p.exact && p.findings.length === 0 && p.entries.length > 0;
    const terug = p.sheet && supplierFaults.length > 0 && mailAan && Date.now() - r.createdAt.getTime() >= RETURN_AFTER_MS;

    if (!opts.dryRun && kanGoed) {
      try {
        const res = await approveInvoiceReview({ reviewId: r.id, overrides: { kind: "labor", timeEntries: p.entries }, userId: null, via: "agent" });
        if (res.purchaseOrderId && !res.reason) {
          outcome = "approved";
          const copied = await copyMailAttachmentToPoBucket({ mailStoragePath: p.sheet!.storagePath, filename: p.sheet!.filename, sizeBytes: p.sheet!.sizeBytes });
          if (copied) await db.update(purchaseOrders)
            .set({ attachments: sql`coalesce(${purchaseOrders.attachments}, '[]'::jsonb) || ${JSON.stringify([{ ...copied, uploadedAt: new Date().toISOString() }])}::jsonb` })
            .where(eq(purchaseOrders.id, res.purchaseOrderId));
          await db.update(purchaseInvoiceReviews).set({ decisionNote: `Autopilot: ${p.summary} (urenstaat ${p.sheet!.filename})` }).where(eq(purchaseInvoiceReviews.id, r.id));
          // Meteen als concept in Holded, met factuur + urenstaat in één PDF (Nick 21-11).
          try {
            const notesPerProject = new Map<string, string[]>();
            for (const e of p.entries) notesPerProject.set(e.projectId, [...(notesPerProject.get(e.projectId) ?? []), ...e.work]);
            const h = await autoPushLaborInvoice({ poId: res.purchaseOrderId, sheet: p.sheet!, workerName: p.sheet!.worker.name, notesPerProject });
            holdedNote = h.message;
          } catch (e) {
            holdedNote = `Niet naar Holded: ${e instanceof Error ? e.message : String(e)}`;
          }
        } else reasons = [res.reason ?? "Goedkeuren gaf geen inkooporder"];
      } catch (err) {
        reasons = [`Automatisch goedkeuren mislukt: ${err instanceof Error ? err.message : String(err)}`];
      }
    } else if (!opts.dryRun && terug) {
      const m = returnMail({ name: r.supplier ?? p.sheet!.worker.name, invoice: invoiceLabel(r), amount: amount ?? 0, sheet: p.sheet!.filename, findings: p.findings });
      const res = await rejectInvoiceReview({
        reviewId: r.id,
        reason: `Autopilot: bedrag klopt niet met urenstaat ${p.sheet!.filename} — ${supplierFaults.map((f) => f.text).join("; ")}${ourFaults.length ? ` (ook: ${ourFaults.map((f) => f.text).join("; ")})` : ""}`,
        userId: null,
        via: "agent",
        mail: { to: r.fromEmail, subject: m.subject, html: m.html, text: m.text, attachInvoice: true },
        sender: { name: "Habitat One" },
      });
      if (res.ok && res.mailSent) outcome = "returned";
      else if (res.ok) reasons = [...reasons, `Teruggestuurd mislukt (${res.mailReason ?? "onbekend"}) — handmatig mailen`];
    }

    const d: LaborDecision = { reviewId: r.id, supplier: r.supplier ?? "?", reference: r.reference, amount, outcome, reasons, summary: p.summary, sheet: p.sheet?.filename ?? null, holded: holdedNote, at: new Date().toISOString() };
    if (opts.dryRun) { results.push({ ...d, outcome: kanGoed ? "approved" : terug || (p.sheet && supplierFaults.length) ? "returned" : "manual", plan: p }); continue; }
    // Alleen opslaan als er iets veranderd is, zodat de briefing geen ruis krijgt.
    const prev = await db.execute(sql`select value from kv_cache where key = ${key(r.id)}`) as unknown as { value: LaborDecision }[];
    const old = prev[0]?.value;
    if (!old || old.outcome !== d.outcome || old.reasons.join("|") !== d.reasons.join("|")) await save(d);
    results.push(d);
  }
  return results;
}

export async function recentLaborDecisions(days = 7): Promise<LaborDecision[]> {
  const rows = await db.execute(sql`select value from kv_cache where key like 'autopilot:labor:%'
    and updated_at > now() - make_interval(days => ${days}) order by updated_at desc limit 50`);
  return rows.map((r) => (r as { value: LaborDecision }).value);
}

