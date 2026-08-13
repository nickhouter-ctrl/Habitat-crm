/**
 * Sjabloonregistry: naam → component + tekenlimieten (brief §6 + §6b).
 *
 * De limieten staan hier als DATA, per sjabloon × formaat — niet
 * hardgecodeerd in de UI. Een story-formaat verdraagt een langere kop dan een
 * vierkante feed-post. De editor (T6) leest deze zelfde tabel voor de
 * tellers; de validatie (validate.ts) gebruikt hem om `approved` te bewaken.
 *
 * De kop-limiet geldt op 100% van de typeschaal; via de automatische
 * verkleining (100% → 88% → 78%, §6b) past er in de praktijk tot
 * `floor(limiet / 0.78)` tekens vóór een spec ongeldig wordt.
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
      "1080x1080": { eyebrow: 28, headline: 70, subline: 110, cta: 24, badge: 16 },
      "1080x1350": { eyebrow: 30, headline: 80, subline: 120, cta: 24, badge: 16 },
      "1080x1920": { eyebrow: 32, headline: 90, subline: 140, cta: 24, badge: 16 },
    },
  },
  split: {
    label: "Split — foto boven, tekstblok onder",
    component: SplitTemplate,
    limits: {
      "1080x1080": { eyebrow: 28, headline: 60, subline: 100, cta: 24, badge: 16 },
      "1080x1350": { eyebrow: 30, headline: 70, subline: 110, cta: 24, badge: 16 },
      "1080x1920": { eyebrow: 32, headline: 80, subline: 130, cta: 24, badge: 16 },
    },
  },
  swatch: {
    label: "Swatch — staalkaart op gekleurde ondergrond",
    component: SwatchTemplate,
    limits: {
      "1080x1080": { eyebrow: 24, headline: 50, subline: 90, cta: 22, badge: 18 },
      "1080x1350": { eyebrow: 26, headline: 60, subline: 100, cta: 22, badge: 18 },
      "1080x1920": { eyebrow: 28, headline: 70, subline: 120, cta: 22, badge: 18 },
    },
  },
  price: {
    label: "Price — full-bleed foto met prijsschijf",
    component: PriceTemplate,
    limits: {
      "1080x1080": { eyebrow: 28, headline: 60, subline: 100, cta: 24, badge: 14 },
      "1080x1350": { eyebrow: 30, headline: 70, subline: 110, cta: 24, badge: 14 },
      "1080x1920": { eyebrow: 32, headline: 80, subline: 130, cta: 24, badge: 14 },
    },
  },
};
