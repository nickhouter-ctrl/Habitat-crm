/**
 * Het lezen en schrijven van de actielijst, op één plek.
 *
 * Er zijn twee ingangen: de pagina in het CRM (ingelogd) en de persoonlijke
 * link zonder inloggen (`/lijst/<token>`). Die verschillen alleen in hoe ze
 * vaststellen wie je bent — wat er daarna gebeurt moet gelijk zijn, anders
 * loopt de ene ingang vooruit op de andere. Vandaar dit bestand: de controle
 * op de invoer en de queries staan hier, de twee `actions.ts` doen de
 * authenticatie en niets meer.
 */
import "server-only";
import { and, asc, eq, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";

import { db } from "@/lib/db";
import { actionItemComments, actionItems, activities, staffNotifications, users } from "@/lib/db/schema";
import { heeftCap, magModuleAls } from "@/lib/auth/modules";
import { ACTIE_STATUSSEN } from "@/lib/actielijst";
import { agendaDateTime, validDay } from "@/lib/agenda-dates";
import { crmUrl } from "@/lib/crm-url";

/** Leeg = nog niemand, "team" = van het hele team, anders één medewerker. */
const wie = z.union([z.string().uuid(), z.literal(""), z.literal("team")]);

export const actiepuntInvoer = z.object({
  /** Bij een nieuw punt het id uit het formulier: twee keer versturen geeft één punt. */
  id: z.string().uuid(),
  nieuw: z.enum(["1", "0"]).default("0"),
  groupName: z.string().trim().min(2).max(60).regex(/^[^\r\n]+$/),
  subgroup: z.string().trim().max(60).regex(/^[^\r\n]*$/).default(""),
  title: z.string().trim().min(3).max(200).regex(/^[^\r\n]+$/),
  description: z.string().trim().max(4000).default(""),
  assigneeId: wie.default(""),
  helpers: z.string().trim().max(200).regex(/^[^\r\n]*$/).default(""),
  dueDate: z.string().max(10).default(""),
  status: z.enum(ACTIE_STATUSSEN).default("open"),
});
export type ActiepuntInvoer = z.infer<typeof actiepuntInvoer>;

export const opmerkingInvoer = z.object({ itemId: z.string().uuid(), body: z.string().trim().min(2).max(2000) });
export const klaarInvoer = z.object({ id: z.string().uuid(), klaar: z.boolean() });
export const archiefInvoer = z.object({ id: z.string().uuid(), archief: z.boolean() });

/**
 * De verantwoordelijke moet de lijst zelf kunnen openen en bijwerken: anders
 * krijgt iemand een mail over een punt dat hij niet eens kan zien.
 */
export async function isGeldigeVerantwoordelijke(id: string): Promise<boolean> {
  const [gebruiker] = await db.select({ role: users.role, email: users.email }).from(users).where(eq(users.id, id));
  return !!gebruiker && magModuleAls(gebruiker.role, gebruiker.email, "actielijst") && heeftCap(gebruiker.role, "schrijven");
}

export type Medewerker = { id: string; name: string | null; email: string };

/** Wie je kunt toewijzen: de mensen die de lijst bijhouden. */
export async function toewijsbareMedewerkers(): Promise<Medewerker[]> {
  const team = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role }).from(users).orderBy(asc(users.name));
  return team.filter(u => magModuleAls(u.role, u.email, "actielijst") && heeftCap(u.role, "schrijven"))
    .map(u => ({ id: u.id, name: u.name, email: u.email }));
}


/* ----------------------------------------------- het punt in de teamagenda */

/**
 * Een actiepunt met een deadline hoort ook in de agenda te staan: daar kijken
 * we 's ochtends, en daar hangt de Apple-agenda-sync aan. Dat gebeurt met een
 * gewone taak (`activities.type = "task"`), dus zonder nieuwe koppeling:
 * `/agenda`, het ochtendoverzicht van 08:00 en de telefoonagenda zien hem
 * allemaal vanzelf.
 *
 * De regels, op één plek zodat agenda en lijst niet uit elkaar lopen:
 *  - geen deadline → geen taak (en een bestaande taak verdwijnt);
 *  - afgevinkt of uit de lijst gehaald → de taak is afgerond, niet verwijderd,
 *    zodat de historie blijft staan en de agenda hem niet meer toont;
 *  - de taak staat bij de verantwoordelijke, en zonder verantwoordelijke bij
 *    degene die het punt aanmaakte.
 */
async function stemTaakAf(itemId: string, actorId: string): Promise<void> {
  const [item] = await db.select({ id: actionItems.id, title: actionItems.title, description: actionItems.description, groupName: actionItems.groupName, subgroup: actionItems.subgroup, dueDate: actionItems.dueDate, status: actionItems.status, assigneeId: actionItems.assigneeId, teamwide: actionItems.teamwide, createdById: actionItems.createdById, archivedAt: actionItems.archivedAt, taskId: actionItems.taskId }).from(actionItems).where(eq(actionItems.id, itemId));
  if (!item) return;
  const dueAt = item.dueDate ? agendaDateTime(item.dueDate, "17:00") : null;
  if (!dueAt) {
    if (item.taskId) { await db.delete(activities).where(eq(activities.id, item.taskId)); await db.update(actionItems).set({ taskId: null }).where(eq(actionItems.id, item.id)); }
    return;
  }
  const afgerond = item.status === "done" || !!item.archivedAt;
  const velden = {
    type: "task" as const,
    subject: item.title,
    body: [[item.groupName, item.subgroup].filter(Boolean).join(" \u00b7 "), item.description, `${crmUrl()}/actielijst?taak=${item.id}`].filter(Boolean).join("\n\n"),
    dueAt,
    completedAt: afgerond ? new Date() : null,
    // Een teampunt hangt aan niemand in het bijzonder; dan staat het in de
    // teamagenda bij degene die het aanmaakte.
    assigneeId: item.teamwide ? null : item.assigneeId ?? item.createdById ?? actorId,
    authorId: item.createdById ?? actorId,
  };
  if (item.taskId) {
    const [bijgewerkt] = await db.update(activities).set({ ...velden, updatedAt: new Date() }).where(and(eq(activities.id, item.taskId), eq(activities.type, "task"))).returning({ id: activities.id });
    if (bijgewerkt) return;
  }
  const [taak] = await db.insert(activities).values(velden).returning({ id: activities.id });
  await db.update(actionItems).set({ taskId: taak.id }).where(eq(actionItems.id, item.id));
}

export type BewaarUitkomst = { itemId: string; nieuw: boolean; bestond: boolean } | { fout: "deadline" | "verantwoordelijke" | "niet-gevonden" };

/** Nieuw actiepunt of een bestaand punt bijwerken. */
export async function bewaarActiepuntDb(d: ActiepuntInvoer, actorId: string): Promise<BewaarUitkomst> {
  if (d.dueDate && !validDay(d.dueDate)) return { fout: "deadline" };
  const heleTeam = d.assigneeId === "team";
  const assigneeId = heleTeam ? "" : d.assigneeId;
  if (assigneeId && !(await isGeldigeVerantwoordelijke(assigneeId))) return { fout: "verantwoordelijke" };
  const velden = {
    groupName: d.groupName,
    subgroup: d.subgroup || null,
    title: d.title,
    description: d.description || null,
    assigneeId: assigneeId || null,
    teamwide: heleTeam,
    helpers: d.helpers || null,
    dueDate: d.dueDate || null,
    status: d.status,
    // Afvinken legt vast wie het deed; terugzetten wist dat weer, anders blijft
    // er een "klaar door" staan bij een punt dat openstaat.
    doneAt: d.status === "done" ? new Date() : null,
    doneById: d.status === "done" ? actorId : null,
  };
  if (d.nieuw === "1") {
    const [saved] = await db.insert(actionItems).values({ id: d.id, ...velden, createdById: actorId }).onConflictDoNothing().returning({ id: actionItems.id });
    if (saved) await stemTaakAf(saved.id, actorId);
    return { itemId: d.id, nieuw: true, bestond: !saved };
  }
  const [saved] = await db.update(actionItems).set({ ...velden, updatedAt: new Date() }).where(eq(actionItems.id, d.id)).returning({ id: actionItems.id });
  if (!saved) return { fout: "niet-gevonden" };
  await stemTaakAf(saved.id, actorId);
  return { itemId: saved.id, nieuw: false, bestond: false };
}

export async function zetKlaarDb(id: string, klaar: boolean, actorId: string): Promise<boolean> {
  const [saved] = await db.update(actionItems)
    .set(klaar
      ? { status: "done" as const, doneAt: new Date(), doneById: actorId, updatedAt: new Date() }
      : { status: "open" as const, doneAt: null, doneById: null, updatedAt: new Date() })
    .where(eq(actionItems.id, id)).returning({ id: actionItems.id });
  if (!saved) return false;
  await stemTaakAf(id, actorId);
  return true;
}

export async function zetArchiefDb(id: string, archief: boolean, actorId: string): Promise<boolean> {
  const [saved] = await db.update(actionItems).set({ archivedAt: archief ? new Date() : null, updatedAt: new Date() }).where(eq(actionItems.id, id)).returning({ id: actionItems.id });
  if (!saved) return false;
  // Een gearchiveerd punt hoeft niet meer te melden dat het te laat is.
  if (archief) await db.delete(staffNotifications).where(and(eq(staffNotifications.entityId, id), eq(staffNotifications.kind, "action_overdue"), eq(staffNotifications.status, "pending")));
  await stemTaakAf(id, actorId);
  return true;
}

export async function plaatsOpmerkingDb(itemId: string, body: string, actorId: string): Promise<boolean> {
  const [item] = await db.select({ id: actionItems.id }).from(actionItems).where(eq(actionItems.id, itemId));
  if (!item) return false;
  await db.insert(actionItemComments).values({ itemId, authorId: actorId, body });
  return true;
}

export type Weergave = "open" | "alles" | "archief";

/**
 * De lijst zoals beide ingangen hem tonen: de regels van dit filter, een
 * magere kopie van de hele lijst (voor de tellers en de groepsuggesties), de
 * opmerkingen van de zichtbare regels en eventueel het geopende punt.
 */
export async function laadActielijst(opts: { weergave: Weergave; alleenVoor?: string | null; punt?: string | null }) {
  const toegewezen = alias(users, "action_assignee");
  const kolommen = { id: actionItems.id, groupName: actionItems.groupName, subgroup: actionItems.subgroup, title: actionItems.title, description: actionItems.description, helpers: actionItems.helpers, dueDate: actionItems.dueDate, status: actionItems.status, assigneeId: actionItems.assigneeId, teamwide: actionItems.teamwide, assigneeName: toegewezen.name, assigneeEmail: toegewezen.email, doneAt: actionItems.doneAt, archivedAt: actionItems.archivedAt, createdAt: actionItems.createdAt };
  const lijst = () => db.select(kolommen).from(actionItems).leftJoin(toegewezen, eq(toegewezen.id, actionItems.assigneeId));
  const [rijen, alles, selectieRijen] = await Promise.all([
    lijst().where(and(
      opts.weergave === "archief" ? isNotNull(actionItems.archivedAt) : isNull(actionItems.archivedAt),
      opts.weergave === "open" ? ne(actionItems.status, "done") : undefined,
      // Van mij = aan mij toegewezen, plus wat van het hele team is.
      opts.alleenVoor ? or(eq(actionItems.assigneeId, opts.alleenVoor), eq(actionItems.teamwide, true)) : undefined,
    )).orderBy(asc(actionItems.groupName), sql`${actionItems.subgroup} nulls first`, sql`case when ${actionItems.status} = 'done' then 1 else 0 end`, sql`${actionItems.dueDate} asc nulls last`, asc(actionItems.createdAt)).limit(500),
    // De tellers en de groepnamen horen bij de hele lijst, niet bij dit filter.
    db.select({ groupName: actionItems.groupName, subgroup: actionItems.subgroup, status: actionItems.status, dueDate: actionItems.dueDate, assigneeId: actionItems.assigneeId, teamwide: actionItems.teamwide }).from(actionItems).where(isNull(actionItems.archivedAt)).limit(2000),
    opts.punt ? lijst().where(eq(actionItems.id, opts.punt)) : [],
  ]);
  const ids = [...new Set([...rijen.map(r => r.id), ...(opts.punt ? [opts.punt] : [])])];
  const opmerkingen = ids.length
    ? await db.select({ id: actionItemComments.id, itemId: actionItemComments.itemId, body: actionItemComments.body, createdAt: actionItemComments.createdAt, authorName: users.name })
        .from(actionItemComments).leftJoin(users, eq(users.id, actionItemComments.authorId)).where(inArray(actionItemComments.itemId, ids)).orderBy(asc(actionItemComments.createdAt))
    : [];
  return { rijen, alles, opmerkingen, selectie: selectieRijen[0] ?? null };
}

export type ActielijstRij = Awaited<ReturnType<typeof laadActielijst>>["rijen"][number];
export type ActielijstOpmerking = Awaited<ReturnType<typeof laadActielijst>>["opmerkingen"][number];
