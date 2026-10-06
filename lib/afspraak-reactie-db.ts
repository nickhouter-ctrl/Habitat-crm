import "server-only";
/**
 * De databasekant van afspraakvoorstellen: aanmaken, versturen, de reactie van
 * de klant vastleggen, het team laten weten wat de klant koos, en een voorstel
 * van de klant overnemen. Teksten en mail: lib/afspraak-reactie.ts.
 */
import { eq, sql } from "drizzle-orm";

import { crmUrl } from "@/lib/crm-url";
import { db } from "@/lib/db";
import { activities, appointmentInvites, appointments, contacts, emailSuppressions, users, type AppointmentInvite } from "@/lib/db/schema";
import { brandedEmail, escapeHtml, sendEmail } from "@/lib/email";
import { COMPANY_INBOX } from "@/lib/mail-bcc";
import { afspraakMoment, afspraakTaal, afspraakUitnodigingMail, nieuwAfspraakToken, type AfspraakSoort } from "@/lib/afspraak-reactie";

export const afspraakLink = (token: string) => `${crmUrl()}/afspraak/${token}`;
const MIN = 60_000;

/** Een voorstel maken. Bij een vast moment staat de afspraak meteen in de agenda. */
export async function maakAfspraakvoorstel(v: {
  contactId: string; soort: AfspraakSoort; titel: string; locatie?: string | null; minuten: number; notities?: string | null;
  bericht?: string | null; momenten: Date[]; taal: string; door: string;
}): Promise<AppointmentInvite> {
  return db.transaction(async (tx) => {
    let appointmentId: string | null = null;
    if (v.soort === "fixed") {
      const [a] = await tx.insert(appointments).values({
        contactId: v.contactId, title: v.titel, startsAt: v.momenten[0], endsAt: new Date(v.momenten[0].getTime() + v.minuten * MIN),
        location: v.locatie || null, notes: v.notities || null, createdBy: v.door, assigneeId: v.door,
      }).returning({ id: appointments.id });
      appointmentId = a.id;
    }
    const [inv] = await tx.insert(appointmentInvites).values({
      token: nieuwAfspraakToken(), contactId: v.contactId, appointmentId, mode: v.soort, title: v.titel, location: v.locatie || null,
      durationMinutes: v.minuten, notes: v.notities || null, message: v.bericht || null,
      slots: v.soort === "open" ? [] : v.momenten.map((m) => m.toISOString()), lang: v.taal, assigneeId: v.door, createdBy: v.door,
    }).returning();
    return inv;
  });
}

/** Mail het voorstel naar de klant. Geeft terug of hij echt is verstuurd. */
export async function verstuurAfspraakvoorstel(inviteId: string, afzender: { name?: string | null; email?: string | null }, teamKopie = false) {
  const [inv] = await db.select().from(appointmentInvites).where(eq(appointmentInvites.id, inviteId));
  if (!inv) return { verstuurd: false, reden: "Voorstel niet gevonden." };
  const [c] = await db.select().from(contacts).where(eq(contacts.id, inv.contactId));
  const naar = c?.email?.trim();
  if (!naar) return { verstuurd: false, reden: "Deze klant heeft geen e-mailadres." };
  const [geblokt] = await db.select({ id: emailSuppressions.id }).from(emailSuppressions).where(sql`lower(${emailSuppressions.email}) = ${naar.toLowerCase()}`);
  if (geblokt) return { verstuurd: false, reden: "Dit adres staat op de niet-mailenlijst." };

  const taal = afspraakTaal(inv.lang);
  const mail = afspraakUitnodigingMail({
    soort: inv.mode as AfspraakSoort, taal, naam: c.firstName?.trim() || c.name.split(/\s+/)[0],
    momenten: inv.slots.map((s) => new Date(s)), locatie: inv.location, bericht: inv.message, link: afspraakLink(inv.token),
  });
  const r = await sendEmail({
    to: naar, subject: mail.subject, html: mail.html, text: mail.text, fromUser: { name: afzender.name },
    copyPolicy: teamKopie ? "team" : undefined, afzenderEmail: afzender.email ?? null,
  });
  if (r.sent) {
    await db.update(appointmentInvites).set({ sentAt: new Date(), updatedAt: new Date() }).where(eq(appointmentInvites.id, inv.id));
    const wat = inv.mode === "fixed" ? `afspraak ${afspraakMoment(new Date(inv.slots[0]), "nl")}`
      : inv.mode === "choice" ? `${inv.slots.length} momenten om uit te kiezen` : "vraag wanneer het de klant uitkomt";
    await db.insert(activities).values({ contactId: c.id, type: "note", subject: "Afspraakvoorstel verstuurd", body: `${wat} · naar ${r.recipients ?? naar}` });
  }
  return { verstuurd: r.sent, reden: r.sent ? undefined : "De mailprovider bevestigde de verzending niet.", naar: r.recipients ?? naar };
}

export async function vindAfspraakvoorstel(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const [r] = await db.select({ inv: appointmentInvites, afspraak: appointments })
    .from(appointmentInvites).leftJoin(appointments, eq(appointments.id, appointmentInvites.appointmentId))
    .where(eq(appointmentInvites.token, token));
  return r ?? null;
}

/** De momenten waaruit de klant nog kan kiezen: alleen die nog niet voorbij zijn. */
export function openMomenten(inv: Pick<AppointmentInvite, "slots">, nu = Date.now()): { index: number; op: Date }[] {
  return inv.slots.map((s, index) => ({ index, op: new Date(s) })).filter((m) => m.op.getTime() > nu);
}

/** Kan de klant nog reageren? Niet ingetrokken, en de afspraak (als die er is) is nog niet begonnen of afgerond. */
export function kanReageren(r: { inv: AppointmentInvite; afspraak: typeof appointments.$inferSelect | null }, nu = Date.now()): boolean {
  if (r.inv.status === "cancelled") return false;
  if (r.afspraak) return r.afspraak.status === "scheduled" && !r.afspraak.completedAt && r.afspraak.startsAt.getTime() > nu;
  return true;
}

type Uitkomst = { ok: true; status: string; op?: Date } | { ok: false; fout: "onbekend" | "voorbij" | "ongeldig" };

/** Vast moment: akkoord. Nog eens klikken verandert niets en meldt niets opnieuw. */
export async function klantAkkoord(token: string): Promise<Uitkomst> {
  const r = await vindAfspraakvoorstel(token);
  if (!r) return { ok: false, fout: "onbekend" };
  if (!kanReageren(r) || !r.afspraak) return { ok: false, fout: "voorbij" };
  if (r.inv.status === "accepted") return { ok: true, status: "accepted", op: r.afspraak.startsAt };
  await db.update(appointmentInvites).set({ status: "accepted", respondedAt: new Date(), proposedStartsAt: null, updatedAt: new Date() }).where(eq(appointmentInvites.id, r.inv.id));
  await meld(r.inv, "akkoord", r.afspraak.startsAt);
  return { ok: true, status: "accepted", op: r.afspraak.startsAt };
}

/** Keuze uit meerdere momenten: zet de afspraak in de agenda. */
export async function klantKiest(token: string, index: number): Promise<Uitkomst> {
  const r = await vindAfspraakvoorstel(token);
  if (!r) return { ok: false, fout: "onbekend" };
  if (!kanReageren(r)) return { ok: false, fout: "voorbij" };
  if (r.inv.status === "chosen" && r.afspraak) return { ok: true, status: "chosen", op: r.afspraak.startsAt };
  const moment = openMomenten(r.inv).find((m) => m.index === index);
  if (r.inv.mode !== "choice" || !moment) return { ok: false, fout: "ongeldig" };
  await db.transaction(async (tx) => {
    // Twee klikken tegelijk mogen geen twee afspraken opleveren.
    const [vast] = await tx.select().from(appointmentInvites).where(eq(appointmentInvites.id, r.inv.id)).for("update");
    if (vast.appointmentId) return;
    const [a] = await tx.insert(appointments).values({
      contactId: vast.contactId, title: vast.title, startsAt: moment.op, endsAt: new Date(moment.op.getTime() + vast.durationMinutes * MIN),
      location: vast.location, notes: vast.notes, createdBy: vast.createdBy, assigneeId: vast.assigneeId,
    }).returning({ id: appointments.id });
    await tx.update(appointmentInvites).set({ appointmentId: a.id, status: "chosen", respondedAt: new Date(), proposedStartsAt: null, updatedAt: new Date() }).where(eq(appointmentInvites.id, vast.id));
  });
  await meld(r.inv, "gekozen", moment.op);
  return { ok: true, status: "chosen", op: moment.op };
}

const JAAR = 366 * 86_400_000;
/** Ander moment voorstellen — kan bij alle drie de soorten. */
export async function klantStelVoor(token: string, opIso: string, bericht: string): Promise<Uitkomst> {
  const r = await vindAfspraakvoorstel(token);
  if (!r) return { ok: false, fout: "onbekend" };
  if (!kanReageren(r)) return { ok: false, fout: "voorbij" };
  const op = new Date(opIso);
  const nu = Date.now();
  if (Number.isNaN(op.getTime()) || op.getTime() < nu + 30 * MIN || op.getTime() > nu + JAAR) return { ok: false, fout: "ongeldig" };
  const tekst = bericht.trim().slice(0, 1000) || null;
  await db.update(appointmentInvites).set({ status: "proposed", respondedAt: new Date(), proposedStartsAt: op, customerMessage: tekst, updatedAt: new Date() }).where(eq(appointmentInvites.id, r.inv.id));
  await meld({ ...r.inv, customerMessage: tekst }, "voorstel", op, r.afspraak?.startsAt);
  return { ok: true, status: "proposed", op };
}

/** Notitie in het dossier + een mail aan wie het voorstel deed. */
async function meld(inv: AppointmentInvite, soort: "akkoord" | "gekozen" | "voorstel", op: Date, gepland?: Date) {
  const [c] = await db.select({ id: contacts.id, name: contacts.name }).from(contacts).where(eq(contacts.id, inv.contactId));
  const klant = c?.name ?? "De klant";
  const w = afspraakMoment(op, "nl");
  const onderwerp = soort === "akkoord" ? `${klant} gaat akkoord met de afspraak — ${w}`
    : soort === "gekozen" ? `${klant} koos een moment — ${w}` : `${klant} stelt een moment voor — ${w}`;
  const regels = soort === "akkoord" ? [`${klant} heeft de afspraak van ${w} geaccepteerd.`]
    : soort === "gekozen" ? [`${klant} koos ${w}. De afspraak staat in de agenda.`]
    : [
        gepland ? `${klant} kan niet op ${afspraakMoment(gepland, "nl")} en stelt voor: ${w}.` : `${klant} stelt voor: ${w}.`,
        ...(inv.customerMessage ? [`Bericht: "${inv.customerMessage}"`] : []),
        "Neem het voorstel over in het dossier, of plan zelf een ander moment.",
      ];
  await db.insert(activities).values({
    contactId: inv.contactId, type: "note",
    subject: soort === "voorstel" ? "Afspraak: klant stelt een moment voor" : soort === "gekozen" ? "Afspraak: klant koos een moment" : "Afspraak: klant akkoord",
    body: regels.join("\n"),
  });
  const wie = inv.assigneeId ?? inv.createdBy;
  const [u] = wie ? await db.select({ email: users.email }).from(users).where(eq(users.id, wie)) : [];
  const dossier = `${crmUrl()}/opvolging/${inv.contactId}`;
  try {
    await sendEmail({
      to: u?.email ?? COMPANY_INBOX, subject: onderwerp, interneMelding: true,
      html: brandedEmail(`${regels.map((r) => `<p>${escapeHtml(r)}</p>`).join("")}<p><a href="${dossier}">Open het dossier</a></p>`),
      text: `${regels.join("\n")}\n\n${dossier}`,
    });
  } catch (e) {
    // De reactie staat al vast; een mislukte melding mag de klant geen fout geven.
    console.warn("[afspraak] melding aan het team mislukt:", e instanceof Error ? e.message : e);
  }
}

/**
 * Het moment van de klant overnemen: de afspraak verplaatsen (of aanmaken), en
 * het voorstel wordt een vast moment waar de klant opnieuw akkoord op geeft.
 */
export async function neemVoorstelOver(inviteId: string): Promise<{ ok: boolean; fout?: string }> {
  return db.transaction(async (tx) => {
    const [inv] = await tx.select().from(appointmentInvites).where(eq(appointmentInvites.id, inviteId)).for("update");
    if (!inv || inv.status !== "proposed" || !inv.proposedStartsAt) return { ok: false, fout: "Er staat geen voorstel van de klant open." };
    const op = inv.proposedStartsAt;
    const eind = new Date(op.getTime() + inv.durationMinutes * MIN);
    let appointmentId = inv.appointmentId;
    if (appointmentId) await tx.update(appointments).set({ startsAt: op, endsAt: eind, updatedAt: new Date() }).where(eq(appointments.id, appointmentId));
    else {
      const [a] = await tx.insert(appointments).values({
        contactId: inv.contactId, title: inv.title, startsAt: op, endsAt: eind, location: inv.location, notes: inv.notes,
        createdBy: inv.createdBy, assigneeId: inv.assigneeId,
      }).returning({ id: appointments.id });
      appointmentId = a.id;
    }
    await tx.update(appointmentInvites).set({
      appointmentId, mode: "fixed", slots: [op.toISOString()], status: "pending", proposedStartsAt: null, updatedAt: new Date(),
    }).where(eq(appointmentInvites.id, inv.id));
    return { ok: true };
  });
}

/** Voorstel intrekken: de link werkt niet meer. Een al geplande afspraak blijft staan. */
export async function trekVoorstelIn(inviteId: string) {
  await db.update(appointmentInvites).set({ status: "cancelled", updatedAt: new Date() }).where(eq(appointmentInvites.id, inviteId));
}
