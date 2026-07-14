import "server-only";
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { projects, workerPortalLinks, workers } from "@/lib/db/schema";

/**
 * Zoek de portaal-link (arbeider + project) bij een token. Null bij een
 * ongeldige link, een inactieve arbeider of een gearchiveerd project —
 * archiveren trekt dus automatisch alle links van dat project in.
 */
export async function portalLinkForToken(token: string) {
  if (!token || token.length < 20) return null;
  const [row] = await db
    .select({ link: workerPortalLinks, worker: workers, project: projects })
    .from(workerPortalLinks)
    .innerJoin(workers, eq(workers.id, workerPortalLinks.workerId))
    .innerJoin(projects, eq(projects.id, workerPortalLinks.projectId))
    .where(
      and(
        eq(workerPortalLinks.token, token),
        eq(workers.active, true),
        eq(projects.status, "active"),
      ),
    )
    .limit(1);
  return row ?? null;
}

/* ------------------------------------------------ portaal-vertalingen */

export type PortalLang = "nl" | "es" | "en";

export const PORTAL_LANGS: Record<PortalLang, string> = {
  nl: "Nederlands",
  es: "Español",
  en: "English",
};

/** Alle portaal-teksten per taal — ingesteld per arbeider (`workers.portal_lang`). */
export const PORTAL_T = {
  nl: {
    hello: "Hoi",
    thisWeek: "Deze week",
    hoursUnit: "uur",
    hoursShort: "u",
    formTitle: "Uren invullen",
    project: "Project",
    chooseProject: "Kies project…",
    date: "Datum",
    hours: "Uren",
    note: "Opmerking",
    optional: "(optioneel)",
    notePlaceholder: "bijv. badkamer boven",
    crewName: "Wie",
    crewNamePlaceholder: "leeg = jijzelf",
    save: "Uren opslaan",
    saving: "Bezig…",
    saved: "Uren opgeslagen — kantoor controleert ze nog.",
    recentTitle: "Laatste 2 weken",
    empty: "Nog niets ingevuld.",
    remove: "Verwijderen",
    footer: "Vragen? Bel kantoor.",
    invalidLink: "Deze link is niet (meer) geldig.",
    invalidLinkTitle: "Link niet geldig",
    invalidLinkBody: "Vraag kantoor om een nieuwe link.",
    errChooseProject: "Kies een project.",
    errDate: "Datum ontbreekt.",
    errHoursMissing: "Vul uren in.",
    errHoursRange: "Uren moeten tussen 0 en 16 liggen.",
    errFuture: "Datum kan niet in de toekomst liggen.",
    errTooOld: "Datum te lang geleden — overleg met kantoor.",
    errProject: "Project niet gevonden.",
    days: ["zo", "ma", "di", "wo", "do", "vr", "za"],
  },
  es: {
    hello: "Hola",
    thisWeek: "Esta semana",
    hoursUnit: "horas",
    hoursShort: "h",
    formTitle: "Apuntar horas",
    project: "Proyecto",
    chooseProject: "Elige proyecto…",
    date: "Fecha",
    hours: "Horas",
    note: "Nota",
    optional: "(opcional)",
    notePlaceholder: "p.ej. baño arriba",
    crewName: "Quién",
    crewNamePlaceholder: "vacío = tú mismo",
    save: "Guardar horas",
    saving: "Guardando…",
    saved: "Horas guardadas — la oficina las revisará.",
    recentTitle: "Últimas 2 semanas",
    empty: "Aún no hay horas.",
    remove: "Eliminar",
    footer: "¿Preguntas? Llama a la oficina.",
    invalidLink: "Este enlace ya no es válido.",
    invalidLinkTitle: "Enlace no válido",
    invalidLinkBody: "Pide un enlace nuevo a la oficina.",
    errChooseProject: "Elige un proyecto.",
    errDate: "Falta la fecha.",
    errHoursMissing: "Rellena las horas.",
    errHoursRange: "Las horas deben estar entre 0 y 16.",
    errFuture: "La fecha no puede ser futura.",
    errTooOld: "Fecha demasiado antigua — consulta con la oficina.",
    errProject: "Proyecto no encontrado.",
    days: ["do", "lu", "ma", "mi", "ju", "vi", "sá"],
  },
  en: {
    hello: "Hi",
    thisWeek: "This week",
    hoursUnit: "hours",
    hoursShort: "h",
    formTitle: "Log hours",
    project: "Project",
    chooseProject: "Choose project…",
    date: "Date",
    hours: "Hours",
    note: "Note",
    optional: "(optional)",
    notePlaceholder: "e.g. upstairs bathroom",
    crewName: "Who",
    crewNamePlaceholder: "empty = yourself",
    save: "Save hours",
    saving: "Saving…",
    saved: "Hours saved — the office will review them.",
    recentTitle: "Last 2 weeks",
    empty: "Nothing logged yet.",
    remove: "Delete",
    footer: "Questions? Call the office.",
    invalidLink: "This link is no longer valid.",
    invalidLinkTitle: "Invalid link",
    invalidLinkBody: "Ask the office for a new link.",
    errChooseProject: "Choose a project.",
    errDate: "Date is missing.",
    errHoursMissing: "Fill in the hours.",
    errHoursRange: "Hours must be between 0 and 16.",
    errFuture: "The date cannot be in the future.",
    errTooOld: "Date too long ago — check with the office.",
    errProject: "Project not found.",
    days: ["su", "mo", "tu", "we", "th", "fr", "sa"],
  },
} as const;

export type PortalStrings = (typeof PORTAL_T)[PortalLang];

export function portalT(lang: string | null | undefined): PortalStrings {
  return PORTAL_T[lang as PortalLang] ?? PORTAL_T.es;
}
