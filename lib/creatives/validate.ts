/**
 * Layoutgaranties (brief §6b): tekenlimieten, automatische kopverkleining en
 * validatie vóór opslaan. Een spec die hier niet doorheen komt kan nooit de
 * status `approved` krijgen — de editor toont wat er mis is en waar.
 */
import type { CreativeSpec } from "./schema";
import { TEMPLATES, type CopyLimits } from "./templates";

/** Verkleiningsstappen voor kop én subregel: 100%, dan 88%, dan 78% (§6b/U10). */
export const HEADLINE_SHRINK_STEPS = [1, 0.88, 0.78] as const;
export type HeadlineScale = (typeof HEADLINE_SHRINK_STEPS)[number];

/**
 * Welke schaal een verkleinbare tekstrol (kop, subregel) nodig heeft om te
 * passen. `null` betekent: past óók op 78% niet — dan is de spec ongeldig.
 * We kappen nooit stil af.
 */
export function shrinkScaleFor(length: number, limit: number): HeadlineScale | null {
  for (const scale of HEADLINE_SHRINK_STEPS) {
    if (length <= Math.floor(limit / scale)) return scale;
  }
  return null;
}

/** @deprecated gebruik {@link shrinkScaleFor} — zelfde functie, bredere naam. */
export const headlineScaleFor = shrinkScaleFor;

export type CopyRole = keyof CopyLimits;

/** Eén geconstateerd probleem: welk veld, hoeveel te lang, en een NL-melding. */
export interface CopyIssue {
  role: CopyRole;
  actual: number;
  allowed: number;
  message: string;
}

const ROLE_LABEL: Record<CopyRole, string> = {
  eyebrow: "Bovenregel",
  headline: "Kop",
  subline: "Subregel",
  cta: "Knoptekst",
  badge: "Badge",
};

/**
 * Controleer alle tekstrollen van een spec tegen de limieten van het gekozen
 * sjabloon × formaat. De kop mag via automatische verkleining langer zijn dan
 * de basislimiet; de overige rollen zijn hard begrensd.
 *
 * @returns lege array = de spec past; anders per veld een issue met melding.
 */
export function validateSpecCopy(spec: CreativeSpec): CopyIssue[] {
  const limits = TEMPLATES[spec.template].limits[spec.format];
  const issues: CopyIssue[] = [];

  // Kop en subregel mogen via automatische verkleining voorbij de basislimiet.
  for (const role of ["headline", "subline"] as const) {
    const text = role === "headline" ? spec.copy.headline : spec.copy.subline;
    if (!text) continue;
    if (shrinkScaleFor(text.length, limits[role]) === null) {
      const allowed = Math.floor(limits[role] / 0.78);
      issues.push({
        role,
        actual: text.length,
        allowed,
        message:
          `${ROLE_LABEL[role]} is ${text.length} tekens; maximaal ${allowed} ` +
          `(inclusief automatische verkleining) voor sjabloon '${spec.template}' in ${spec.format}.`,
      });
    }
  }

  for (const role of ["eyebrow", "cta", "badge"] as const) {
    const text = spec.copy[role];
    if (!text) continue;
    if (text.length > limits[role]) {
      issues.push({
        role,
        actual: text.length,
        allowed: limits[role],
        message:
          `${ROLE_LABEL[role]} is ${text.length} tekens; maximaal ${limits[role]} ` +
          `voor sjabloon '${spec.template}' in ${spec.format}.`,
      });
    }
  }

  return issues;
}

/** Past de spec binnen de layoutgaranties? (Poortwachter voor `approved`.) */
export function specFitsLayout(spec: CreativeSpec): boolean {
  return validateSpecCopy(spec).length === 0;
}
