/**
 * Herkent op welk project een inkoopfactuur (of een regel daarvan) hoort.
 *
 * De valkuil die dit oplost: een werf-alias kan een BUURT zijn. "Balcón al Mar"
 * staat als alias bij Het Palijsje, maar Calle Silvestre ligt in diezelfde buurt
 * — een matcher die de eerste treffer pakt, koppelt zo'n factuur aan het
 * verkeerde project zonder dat iemand het merkt.
 *
 * Daarom gelaagd: een projectnaam, -code of pandreferentie is beslissend, een
 * werf-alias of pandtitel telt daaronder mee, en een plaats-/buurtnaam alleen
 * als er precies één project overblijft. Passen er meerdere, dan kiest het
 * systeem NIETS en vraagt het om een keuze — liever een leeg veld dan een
 * factuur van tienduizend euro stilletjes op de verkeerde klus.
 */

export type ProjectNeedle = {
  id: string;
  name: string | null;
  code: string | null;
  siteAlias: string | null;
  propTitle: string | null;
  propRef: string | null;
  propLoc: string | null;
};

export type ProjectMatch =
  | { kind: "match"; projectId: string; matchedOn: string; strength: Strength }
  | { kind: "ambiguous"; candidates: { projectId: string; matchedOn: string }[] }
  | { kind: "none" };

type Strength = "strong" | "medium" | "weak";

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Woorden die te algemeen zijn om op te matchen (komen op elke factuur voor). */
const STOPWORDS = new Set([
  "villa", "casa", "obra", "calle", "carrer", "avenida", "camino", "cami", "urbanizacion",
  "javea", "xabia", "denia", "moraira", "benissa", "altea", "calpe", "alicante",
  "ref", "nr", "no", "the", "het", "de", "la", "el",
]);

/** Splits een veld in bruikbare zoektermen. */
function needlesFrom(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(/[,;/|]/)
    .map((v) => norm(v))
    .filter((v) => v.length >= 3 && !STOPWORDS.has(v));
}

/** Bevat de tekst deze zoekterm als heel woord? */
function contains(haystack: string, needle: string): boolean {
  if (needle.length < 3) return false;
  return new RegExp(`(^|\\s)${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`).test(haystack);
}

/**
 * Zoekt het project bij een stuk tekst van de factuur (de projecthint én de
 * omschrijving — een werf staat lang niet altijd in een apart veld).
 */
export function matchProject(text: string | null | undefined, projects: ProjectNeedle[]): ProjectMatch {
  const hay = norm(text ?? "");
  if (hay.length < 3) return { kind: "none" };

  // Per sterkte verzamelen welke projecten passen, met de term die trof.
  const tiers: Record<Strength, Map<string, string>> = {
    strong: new Map(),
    medium: new Map(),
    weak: new Map(),
  };

  for (const p of projects) {
    const buckets: [Strength, string[]][] = [
      // Naam, code en pandreferentie zijn per project uniek genoeg.
      ["strong", [...needlesFrom(p.name), ...needlesFrom(p.code), ...needlesFrom(p.propRef)]],
      // Werf-alias en pandtitel: meestal specifiek, soms een buurt.
      ["medium", [...needlesFrom(p.siteAlias), ...needlesFrom(p.propTitle)]],
      // Locatie is vrijwel altijd een plaats of buurt.
      ["weak", needlesFrom(p.propLoc)],
    ];
    for (const [strength, needles] of buckets) {
      for (const n of needles) {
        if (contains(hay, n)) {
          if (!tiers[strength].has(p.id)) tiers[strength].set(p.id, n);
        }
      }
    }
  }

  for (const strength of ["strong", "medium", "weak"] as const) {
    const hits = tiers[strength];
    if (hits.size === 0) continue;
    if (hits.size === 1) {
      const [projectId, matchedOn] = [...hits.entries()][0];
      return { kind: "match", projectId, matchedOn, strength };
    }
    // Meerdere projecten op dezelfde sterkte: niet gokken.
    return {
      kind: "ambiguous",
      candidates: [...hits.entries()].map(([projectId, matchedOn]) => ({ projectId, matchedOn })),
    };
  }
  return { kind: "none" };
}
