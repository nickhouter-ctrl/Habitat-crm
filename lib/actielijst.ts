/**
 * De regels van de gedeelde actielijst — puur, zonder database, zodat de
 * pagina, de server actions, de herinneringsmail en de tests dezelfde
 * uitkomst gebruiken.
 *
 * De kern is de kleur van een regel. In de lijst betekent groen "klaar", rood
 * "deadline verstreken en nog niet gedaan" en oranje "iemand is ermee bezig".
 * Dat wordt hier één keer uitgerekend: zou het scherm het zelf doen en de mail
 * ook, dan kan een regel rood staan zonder dat er ooit een mail uitgaat.
 */
import type { Locale } from "@/lib/i18n";

export const ACTIE_STATUSSEN = ["open", "in_progress", "done"] as const;
export type ActieStatus = (typeof ACTIE_STATUSSEN)[number];

export const ACTIE_STATUS_LABEL: Record<ActieStatus, string> = {
  open: "Open",
  in_progress: "Bezig",
  done: "Klaar",
};

/** Eén regel zoals de lijst en de mail hem nodig hebben. */
export interface ActieRegel {
  id: string;
  groupName: string;
  subgroup: string | null;
  title: string;
  dueDate: string | null;
  status: ActieStatus;
  assigneeId: string | null;
}

export type ActieKleur = "neutraal" | "bezig" | "achterstallig" | "klaar";

export function isActieStatus(v: unknown): v is ActieStatus {
  return typeof v === "string" && (ACTIE_STATUSSEN as readonly string[]).includes(v);
}

/**
 * Staat deze deadline stil? `vandaag` is de kalenderdag in Madrid, en de
 * vergelijking is op dagniveau: de dag van de deadline zelf is nog niet te
 * laat, de dag erna wel.
 */
export function isAchterstallig(regel: Pick<ActieRegel, "dueDate" | "status">, vandaag: string): boolean {
  return regel.status !== "done" && !!regel.dueDate && regel.dueDate < vandaag;
}

export function actieKleur(regel: Pick<ActieRegel, "dueDate" | "status">, vandaag: string): ActieKleur {
  if (regel.status === "done") return "klaar";
  if (isAchterstallig(regel, vandaag)) return "achterstallig";
  return regel.status === "in_progress" ? "bezig" : "neutraal";
}

/** Hoeveel dagen staat deze deadline al stil? Negatief = hij moet nog komen. */
export function dagenTeLaat(dueDate: string, vandaag: string): number {
  return Math.round((Date.parse(`${vandaag}T12:00:00Z`) - Date.parse(`${dueDate}T12:00:00Z`)) / 86_400_000);
}

/**
 * De sleutel van de herinneringsmail. Er zitten vier dingen in: het punt, de
 * gemiste deadline, de week erna en de ontvanger. Daarmee komt de mail één keer
 * de dag na de deadline, daarna één keer per week zolang het punt openblijft,
 * en stuurt een cron die twee keer op dezelfde dag langskomt er geen tweede.
 * Een verzette deadline is een nieuwe sleutel en mag opnieuw melden; bij een
 * punt van het hele team krijgt iedereen zijn eigen sleutel.
 */
export function actieMailSleutel(itemId: string, dueDate: string, vandaag: string, userId: string): string {
  return `actie:${itemId}:${dueDate}:w${Math.floor(dagenTeLaat(dueDate, vandaag) / 7)}:${userId}`;
}

/** Groep → subgroep → regels, in de volgorde waarin ze op het scherm staan. */
export function groepeer<T extends ActieRegel>(regels: T[]): { groep: string; subgroepen: { naam: string | null; regels: T[] }[] }[] {
  const groepen: { groep: string; subgroepen: { naam: string | null; regels: T[] }[] }[] = [];
  for (const regel of regels) {
    const groep = groepen.find(g => g.groep === regel.groupName) ?? (groepen.push({ groep: regel.groupName, subgroepen: [] }), groepen.at(-1)!);
    const naam = regel.subgroup?.trim() ? regel.subgroup : null;
    const sub = groep.subgroepen.find(s => s.naam === naam) ?? (groep.subgroepen.push({ naam, regels: [] }), groep.subgroepen.at(-1)!);
    sub.regels.push(regel);
  }
  return groepen;
}

/** Groepen en subgroepen die al in gebruik zijn — de suggesties bij het invoeren. */
export function bestaandeIndeling(regels: Pick<ActieRegel, "groupName" | "subgroup">[]): { groepen: string[]; subgroepen: string[] } {
  const groepen = new Set<string>(), subgroepen = new Set<string>();
  for (const r of regels) { groepen.add(r.groupName); if (r.subgroup?.trim()) subgroepen.add(r.subgroup); }
  return { groepen: [...groepen].sort((a, b) => a.localeCompare(b)), subgroepen: [...subgroepen].sort((a, b) => a.localeCompare(b)) };
}

/** Deadline zoals hij in de lijst en in de mail staat: dagnauwkeurig, Madrid. */
export function deadlineTekst(dueDate: string, locale: Locale | string): string {
  return new Date(`${dueDate}T12:00:00Z`).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "long", year: "numeric" });
}
