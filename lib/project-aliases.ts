/**
 * Hoe anderen onze werven noemen, en hoe we die namen terugvinden.
 *
 * Bewust géén `server-only`: de normalisatie wordt ook in de browser gebruikt
 * om te zoeken, en de scripts lezen deze tabel ook.
 */
import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { projectAliases, projects } from "@/lib/db/schema";

/**
 * Naam op één vorm brengen: alles weg behalve letters en cijfers, in kleine
 * letters. Zo vallen "cata Gorg", "Cata-gorg" en "CATAGORG" samen — precies
 * het soort verschil dat op een handgeschreven urenlijst voorkomt. Dezelfde
 * regel staat in de unieke index op de tabel, zodat de database en de code
 * hetzelfde denken.
 */
export function normaliseerLabel(label: string): string {
  return (label ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

export interface Alias {
  id: string;
  projectId: string;
  projectNaam: string;
  label: string;
  supplier: string | null;
}

/** Alle aliassen, met de projectnaam erbij. */
export async function alleAliassen(): Promise<Alias[]> {
  const rijen = await db
    .select({
      id: projectAliases.id,
      projectId: projectAliases.projectId,
      projectNaam: projects.name,
      label: projectAliases.label,
      supplier: projectAliases.supplier,
    })
    .from(projectAliases)
    .innerJoin(projects, eq(projects.id, projectAliases.projectId))
    .orderBy(asc(projects.name), asc(projectAliases.label));
  return rijen;
}

/** De aliassen van één project. */
export async function aliassenVanProject(projectId: string): Promise<Alias[]> {
  return (await alleAliassen()).filter((a) => a.projectId === projectId);
}

/**
 * Naam → project. Een alias met leverancier wint van een algemene, want die is
 * specifieker: als Pieter "cata Gorg" schrijft en er staat ook een algemene
 * "cata gorg", dan telt die van Pieter.
 */
export function zoekProject(
  aliassen: Alias[],
  label: string,
  supplier?: string | null,
): Alias | null {
  const k = normaliseerLabel(label);
  if (!k) return null;
  const lev = normaliseerLabel(supplier ?? "");
  const treffers = aliassen.filter((a) => normaliseerLabel(a.label) === k);
  if (treffers.length === 0) return null;
  return (
    treffers.find((a) => a.supplier && lev && normaliseerLabel(a.supplier) === lev) ??
    treffers.find((a) => !a.supplier) ??
    treffers[0]
  );
}

/**
 * Per project de zoektermen voor de keuzelijst: de eigen naam plus de namen die
 * anderen gebruiken. Zo vindt "cata" ook Pand gata de gorgos.
 */
export function zoektermenPerProject(aliassen: Alias[]): Map<string, string[]> {
  const uit = new Map<string, string[]>();
  for (const a of aliassen) {
    const lijst = uit.get(a.projectId) ?? [];
    lijst.push(a.supplier ? `${a.label} (${a.supplier})` : a.label);
    uit.set(a.projectId, lijst);
  }
  return uit;
}
