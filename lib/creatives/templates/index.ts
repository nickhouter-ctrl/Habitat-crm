/**
 * Sjabloonregistry: naam → component + tekenlimieten (brief §6 + §6b).
 *
 * De limieten staan hier als DATA, per sjabloon × formaat — niet
 * hardgecodeerd in de UI. Een story-formaat verdraagt een langere kop dan een
 * vierkante feed-post. De editor (T6) leest deze zelfde tabel voor de
 * tellers; de validatie (validate.ts) gebruikt hem om `approved` te bewaken.
 *
 * De kop- en subregellimiet gelden op 100% van de typeschaal; via de
 * automatische verkleining (100% → 88% → 78%, §6b/U10) past er in de praktijk
 * tot `floor(limiet / 0.78)` tekens vóór een spec ongeldig wordt.
 *
 * GEKALIBREERD (U10): deze getallen zijn empirisch gemeten met het
 * truncatie-orakel (zie __tests__/fit-guarantee.test.tsx) op breed-realistische
 * Nederlandse advertentietekst, mét ±10% marge, op 100% én op 78% schaal.
 * Wijzig een limiet nooit zonder de fit-guarantee-suite opnieuw te draaien —
 * die bewijst dat tekst op de limiet volledig rendert, zonder ellipsis.
 */
import type { ReactElement } from "react";

import type { TemplateProps } from "../schema";
import { TEMPLATE_NAMES, type FormatName, type TemplateName } from "../tokens";
import { FrameTemplate } from "./frame";
import { PriceTemplate } from "./price";
import { SplitTemplate } from "./split";
import { SwatchTemplate } from "./swatch";

export { TEMPLATE_NAMES };
export type { TemplateName };

/** Maximaal aantal tekens per tekstrol (op 100% typeschaal). */
export interface CopyLimits {
  eyebrow: number;
  headline: number;
  subline: number;
  cta: number;
  badge: number;
}

export interface TemplateEntry {
  /** Naam voor in de editor-picker. */
  label: string;
  component: (props: TemplateProps) => ReactElement;
  limits: Record<FormatName, CopyLimits>;
}

export const TEMPLATES: Record<TemplateName, TemplateEntry> = {
  frame: {
    label: "Frame — full-bleed foto met kop en knop",
    component: FrameTemplate,
    limits: {
      "1080x1080": { eyebrow: 29, headline: 36, subline: 63, cta: 24, badge: 16 },
      "1080x1350": { eyebrow: 28, headline: 32, subline: 62, cta: 24, badge: 16 },
      "1080x1920": { eyebrow: 25, headline: 41, subline: 81, cta: 24, badge: 16 },
    },
  },
  split: {
    label: "Split — foto boven, tekstblok onder",
    component: SplitTemplate,
    limits: {
      "1080x1080": { eyebrow: 29, headline: 36, subline: 63, cta: 24, badge: 16 },
      "1080x1350": { eyebrow: 28, headline: 32, subline: 91, cta: 24, badge: 16 },
      "1080x1920": { eyebrow: 25, headline: 50, subline: 81, cta: 24, badge: 16 },
    },
  },
  swatch: {
    label: "Swatch — staalkaart op gekleurde ondergrond",
    component: SwatchTemplate,
    limits: {
      "1080x1080": { eyebrow: 29, headline: 35, subline: 63, cta: 22, badge: 18 },
      "1080x1350": { eyebrow: 27, headline: 32, subline: 62, cta: 22, badge: 18 },
      "1080x1920": { eyebrow: 25, headline: 36, subline: 80, cta: 22, badge: 18 },
    },
  },
  price: {
    label: "Price — full-bleed foto met prijsschijf",
    component: PriceTemplate,
    limits: {
      "1080x1080": { eyebrow: 29, headline: 36, subline: 63, cta: 24, badge: 14 },
      "1080x1350": { eyebrow: 28, headline: 32, subline: 62, cta: 24, badge: 14 },
      "1080x1920": { eyebrow: 25, headline: 41, subline: 81, cta: 24, badge: 14 },
    },
  },
};
