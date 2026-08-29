/**
 * Klantportaal (/klant): projectstatus en kosten voor de klant zelf.
 *
 * Toegang via een inloglink per e-mail (geen wachtwoorden): korte HMAC-token
 * (30 min) in de mail → klik zet een sessie-cookie (30 dagen). Zelfde
 * HMAC-mechaniek als lib/portal/token.ts, maar met een eigen `aud` zodat
 * webshop-tokens en portaal-cookies nooit inwisselbaar zijn.
 *
 * VEILIGHEID: alles wat dit bestand teruggeeft is klant-veilig — verkoopkant
 * alleen. Inkoopprijzen, kostprijzen en marges (time_entries, project_costs,
 * budget-kostzijde, lib/project-financials) blijven hier bewust buiten.
 */
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { commissionEntries, contacts, documents, projectCosts, projectExtras, projectPhases, projectPayments, projects, purchaseOrders, referrals, timeEntries } from "@/lib/db/schema";
import { alias } from "drizzle-orm/pg-core";
import { deriveProjectMargins } from "@/lib/project-financials";
import { poExVat } from "@/lib/purchase-orders";

const SECRET = process.env.PORTAL_JWT_SECRET ?? process.env.AUTH_SECRET ?? "";
const COOKIE = "klant_sessie";
const LOGIN_TTL_SEC = 30 * 60; // inloglink: 30 minuten
const SESSIE_TTL_SEC = 30 * 24 * 60 * 60; // cookie: 30 dagen

type Aud = "klant-login" | "klant-sessie" | "klant-aanmelden";
interface KlantToken {
  aud: Aud;
  email: string;
  exp: number;
}

const AANMELD_TTL_SEC = 14 * 24 * 60 * 60; // aanmeldlink: 14 dagen deelbaar

const b64url = (buf: Buffer) => buf.toString("base64url");

function sign(payload: KlantToken): string {
  if (!SECRET) throw new Error("PORTAL_JWT_SECRET/AUTH_SECRET ontbreekt");
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = b64url(createHmac("sha256", SECRET).update(`klant.${body}`).digest());
  return `${body}.${sig}`;
}

function verify(token: string | null | undefined, aud: Aud): KlantToken | null {
  if (!token || !SECRET) return null;
  const dot = token.indexOf(".");
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  const expected = b64url(createHmac("sha256", SECRET).update(`klant.${body}`).digest());
  const a = Buffer.from(token.slice(dot + 1));
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as KlantToken;
    if (payload.aud !== aud || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!payload.email) return null;
    return payload;
  } catch {
    return null;
  }
}

const nu = () => Math.floor(Date.now() / 1000);

export function maakLoginToken(email: string): string {
  return sign({ aud: "klant-login", email: email.toLowerCase().trim(), exp: nu() + LOGIN_TTL_SEC });
}
export function verifieerLoginToken(token: string): string | null {
  return verify(token, "klant-login")?.email ?? null;
}

/** Deelbare aanmeldlink (WhatsApp) voor nieuwe klanten — niet persoonsgebonden. */
export function maakAanmeldToken(): string {
  return sign({ aud: "klant-aanmelden", email: "*", exp: nu() + AANMELD_TTL_SEC });
}
export function verifieerAanmeldToken(token: string): boolean {
  return verify(token, "klant-aanmelden") !== null;
}

export async function zetKlantSessie(email: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, sign({ aud: "klant-sessie", email: email.toLowerCase().trim(), exp: nu() + SESSIE_TTL_SEC }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/klant",
    maxAge: SESSIE_TTL_SEC,
  });
}
export async function wisKlantSessie(): Promise<void> {
  (await cookies()).delete({ name: COOKIE, path: "/klant" });
}

/** Ingelogde klant (of null): e-mail uit de sessie-cookie. */
export async function klantEmail(): Promise<string | null> {
  const jar = await cookies();
  return verify(jar.get(COOKIE)?.value, "klant-sessie")?.email ?? null;
}

/* ------------------------------------------------------------- data-laag */

/** Contacten met dit e-mailadres (één klant kan meerdere contactkaarten hebben). */
export async function klantContacten(email: string) {
  return db
    .select({
      id: contacts.id,
      name: contacts.name,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      phone: contacts.phone,
      mobile: contacts.mobile,
      taxId: contacts.taxId,
      addressLine: contacts.addressLine,
      city: contacts.city,
      postalCode: contacts.postalCode,
      province: contacts.province,
      country: contacts.country,
      preferredLanguage: contacts.preferredLanguage,
    })
    .from(contacts)
    .where(sql`lower(${contacts.email}) = ${email.toLowerCase().trim()}`);
}

export interface KlantProject {
  id: string;
  name: string;
  status: string;
  kind: string;
  contractPriceEur: string | null;
  contractDate: string | null;
  startDate: string | null;
  endDate: string | null;
}

/** De projecten van deze klant (via projects.contactId). Klant-veilige velden. */
export async function klantProjecten(email: string) {
  const cts = await klantContacten(email);
  if (cts.length === 0) return { contacten: cts, projecten: [] as KlantProject[] };
  const projecten: KlantProject[] = await db
    .select({
      id: projects.id,
      name: projects.name,
      status: projects.status,
      kind: projects.kind,
      contractPriceEur: projects.contractPriceEur,
      contractDate: projects.contractDate,
      startDate: projects.startDate,
      endDate: projects.endDate,
    })
    .from(projects)
    .where(inArray(projects.contactId, cts.map((c) => c.id)))
    .orderBy(asc(projects.createdAt));
  return { contacten: cts, projecten };
}

/** Guard: hoort dit project bij deze klant? */
export async function klantMagProject(email: string, projectId: string): Promise<boolean> {
  const { projecten } = await klantProjecten(email);
  return projecten.some((p) => p.id === projectId);
}

/**
 * Alles wat de klant van één project mag zien — uitsluitend verkoopkant:
 * fases + voortgang, facturen/termijnen, ontvangen betalingen, goedgekeurd
 * meerwerk (verkoopbedrag). Geen kosten, geen marges, geen leveranciers.
 */
export async function klantProjectDetail(email: string, projectId: string) {
  const { projecten } = await klantProjecten(email);
  const project = projecten.find((p) => p.id === projectId);
  if (!project) return null;

  const [fases, docs, betalingen, meerwerk] = await Promise.all([
    db
      .select({
        name: projectPhases.name,
        description: projectPhases.description,
        plannedWeeks: projectPhases.plannedWeeks,
        progressPct: projectPhases.progressPct,
        sortOrder: projectPhases.sortOrder,
      })
      .from(projectPhases)
      .where(eq(projectPhases.projectId, projectId))
      .orderBy(asc(projectPhases.sortOrder)),
    // Alleen documenten die de klant al kent: verstuurd of verder. Nooit concepten.
    db
      .select({
        id: documents.id,
        kind: documents.kind,
        docNumber: documents.docNumber,
        title: documents.title,
        status: documents.status,
        issueDate: documents.issueDate,
        dueDate: documents.dueDate,
        totalEur: documents.totalEur,
        paidEur: documents.paidEur,
        isAdvance: documents.isAdvance,
      })
      .from(documents)
      .where(
        and(
          eq(documents.projectId, projectId),
          inArray(documents.kind, ["estimate", "proforma", "invoice", "creditnote"]),
          sql`${documents.status} not in ('draft', 'void')`,
        ),
      )
      .orderBy(asc(documents.issueDate)),
    db
      .select({
        date: projectPayments.date,
        amountEur: projectPayments.amountEur,
        description: projectPayments.description,
      })
      .from(projectPayments)
      .where(eq(projectPayments.projectId, projectId))
      .orderBy(asc(projectPayments.date)),
    // Meerwerk: alleen goedgekeurde posten, alleen het klantbedrag.
    db
      .select({
        description: projectExtras.description,
        amountEur: projectExtras.amountEur,
        approvedAt: projectExtras.approvedAt,
      })
      .from(projectExtras)
      .where(and(eq(projectExtras.projectId, projectId), isNotNull(projectExtras.approvedAt)))
      .orderBy(asc(projectExtras.approvedAt)),
  ]);

  return { project, fases, docs, betalingen, meerwerk };
}

/**
 * Kostenoverzicht voor de klant — uitsluitend VERKOOPwaarden verlaten deze
 * functie. Gemaakte kosten (uren, inkoop) worden hier eerst doorbelast met de
 * projectmarge (kost ÷ (1 − marge%)), precies zoals intern; de onderliggende
 * kost- en margecijfers blijven binnen deze functie.
 */
export async function klantKostenOverzicht(projectId: string): Promise<{
  aanneemsomEur: number | null;
  meerwerkEur: number;
  arbeidEur: number; // doorbelaste verkoopwaarde, ex. btw
  materialenEur: number; // doorbelaste verkoopwaarde, ex. btw
  totaalEur: number; // ex. btw
}> {
  const [[proj], tijdRows, poRows, losseKosten, [meerwerkAgg]] = await Promise.all([
    db
      .select({
        contractPriceEur: projects.contractPriceEur,
        laborMarginPct: projects.laborMarginPct,
        purchaseMarginPct: projects.purchaseMarginPct,
      })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1),
    // Goedgekeurde uren (portaal-uren die nog op controle wachten tellen niet).
    db
      .select({ hours: timeEntries.hours, hourlyCostEur: timeEntries.hourlyCostEur })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.projectId, projectId),
          sql`not (${timeEntries.selfLoggedAt} is not null and ${timeEntries.approvedAt} is null)`,
        ),
      ),
    // Materiaal-inkoop (als-uren-geboekte PO's zitten al in de uren).
    db
      .select({
        subtotal: purchaseOrders.subtotal,
        tax: purchaseOrders.tax,
        total: purchaseOrders.total,
        items: purchaseOrders.items,
      })
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.projectId, projectId),
          sql`${purchaseOrders.status} <> 'cancelled'`,
          sql`coalesce(${purchaseOrders.countAsLabor}, false) = false`,
        ),
      ),
    db
      .select({ amountEur: projectCosts.amountEur })
      .from(projectCosts)
      .where(eq(projectCosts.projectId, projectId)),
    db
      .select({ som: sql<string>`coalesce(sum(${projectExtras.amountEur}), 0)` })
      .from(projectExtras)
      .where(and(eq(projectExtras.projectId, projectId), isNotNull(projectExtras.approvedAt))),
  ]);

  const laborCost = tijdRows.reduce((s, t) => s + Number(t.hours ?? 0) * Number(t.hourlyCostEur ?? 0), 0);
  const purchaseCost =
    poRows.reduce((s, p) => s + poExVat(p).amount, 0) +
    losseKosten.reduce((s, c) => s + Number(c.amountEur ?? 0), 0);

  const marges = deriveProjectMargins({
    laborCost,
    laborMarginPct: proj?.laborMarginPct != null ? Number(proj.laborMarginPct) : null,
    productRevenue: 0,
    productCost: 0,
    purchaseCost,
    purchaseMarginPct: proj?.purchaseMarginPct != null ? Number(proj.purchaseMarginPct) : null,
  });

  const aanneemsomEur = proj?.contractPriceEur != null ? Number(proj.contractPriceEur) : null;
  const meerwerkEur = Number(meerwerkAgg?.som ?? 0);
  const arbeidEur = marges.laborRevenue;
  const materialenEur = marges.purchaseRevenue;
  // Vaste aanneemsom → kosten vallen binnen de som; anders (regie) telt het
  // doorbelaste werk zelf op tot het totaal.
  const totaalEur =
    aanneemsomEur != null ? aanneemsomEur + meerwerkEur : arbeidEur + materialenEur + meerwerkEur;

  return { aanneemsomEur, meerwerkEur, arbeidEur, materialenEur, totaalEur };
}

/** Mag deze klant dit document (PDF) inzien? Via project óf direct contact. */
export async function klantMagDocument(email: string, docId: string): Promise<boolean> {
  const [doc] = await db
    .select({ projectId: documents.projectId, contactId: documents.contactId, status: documents.status })
    .from(documents)
    .where(eq(documents.id, docId))
    .limit(1);
  if (!doc || doc.status === "draft" || doc.status === "void") return false;
  if (doc.projectId) return klantMagProject(email, doc.projectId);
  if (doc.contactId) {
    const cts = await klantContacten(email);
    return cts.some((c) => c.id === doc.contactId);
  }
  return false;
}

/** Losse offertes van deze klant (zonder project) — bv. webshop/meubels. */
export async function klantLosseOffertes(email: string) {
  const cts = await klantContacten(email);
  if (cts.length === 0) return [];
  return db
    .select({
      id: documents.id,
      docNumber: documents.docNumber,
      title: documents.title,
      status: documents.status,
      issueDate: documents.issueDate,
      totalEur: documents.totalEur,
    })
    .from(documents)
    .where(
      and(
        inArray(documents.contactId, cts.map((c) => c.id)),
        sql`${documents.projectId} is null`,
        eq(documents.kind, "estimate"),
        sql`${documents.status} not in ('draft', 'void')`,
      ),
    )
    .orderBy(asc(documents.issueDate));
}

/** Commissie-overzicht: aangebrachte klanten + opgebouwd/uitbetaald bedrag. */
export async function klantCommissies(email: string) {
  const cts = await klantContacten(email);
  if (cts.length === 0) return [];
  const referee = alias(contacts, "referee");
  return db
    .select({
      id: referrals.id,
      refereeNaam: referee.name,
      commissionPct: referrals.commissionPct,
      opgebouwd: sql<string>`coalesce(sum(${commissionEntries.amountEur}) filter (where ${commissionEntries.status} in ('pending', 'approved')), 0)`,
      uitbetaald: sql<string>`coalesce(sum(${commissionEntries.amountEur}) filter (where ${commissionEntries.status} = 'paid'), 0)`,
    })
    .from(referrals)
    .innerJoin(referee, eq(referrals.refereeContactId, referee.id))
    .leftJoin(commissionEntries, eq(commissionEntries.referralId, referrals.id))
    .where(and(inArray(referrals.referrerContactId, cts.map((c) => c.id)), eq(referrals.active, true)))
    .groupBy(referrals.id, referee.name, referrals.commissionPct);
}

/* ------------------------------------------------------------- vertaling */

export type KlantTaal = "nl" | "en" | "es";

export function kiesTaal(v: string | undefined | null): KlantTaal {
  return v === "en" || v === "es" || v === "nl" ? v : "nl";
}
