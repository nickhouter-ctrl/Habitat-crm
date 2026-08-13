/**
 * Pasgarantie (U10, §6b): tekst binnen de registrylimiet rendert ALTIJD
 * volledig — nooit ellipsis, nooit stil afkappen. Deze suite dwingt dat af
 * voor elk veld × sjabloon × formaat, op de limiet zelf én (voor kop en
 * subregel) op de harde grens ná automatische verkleining.
 *
 * Orakel: dezelfde spec twee keer renderen met alléén het laatste teken
 * anders. Zijn de PNG's byte-identiek, dan is dat teken onzichtbaar — dus
 * afgekapt. Verschillen ze, dan is de tekst tot en met het laatste teken
 * zichtbaar. Het testcorpus is breed-realistische Nederlandse
 * advertentietekst; de limieten in de registry zijn hiermee gekalibreerd
 * (±10% marge). Faalt deze suite na een sjabloon- of limietwijziging, dan is
 * de wijziging te ruim — herkalibreer.
 */
import { describe, expect, it } from "vitest";

import { renderCreative } from "../render";
import type { RenderableSpec } from "../schema";
import { TEMPLATES, TEMPLATE_NAMES } from "../templates";
import { FORMAT_NAMES } from "../tokens";

const ASSET =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAE0lEQVR4nGNgWPDsPwMDAwMDAwAkBgMBvR9AlgAAAABJRU5ErkJggg==";

/** Zelfde corpus als de kalibratie — breed-realistische advertentietekst. */
const WORDS = [
  "Nieuwe",
  "wandpanelen",
  "voor",
  "keuken",
  "en",
  "badkamer",
  "gemonteerd",
  "door",
  "ons",
  "eigen",
  "team",
  "showroom",
  "kwaliteit",
  "materialen",
  "Mediterraan",
  "maatwerk",
];

function testText(len: number): string {
  let s = "";
  let i = 0;
  while (s.length < len + 2) s += (s ? " " : "") + WORDS[i++ % WORDS.length];
  let out = s.slice(0, len);
  if (out.endsWith(" ")) out = out.slice(0, -1) + "m";
  return out;
}

type Role = "eyebrow" | "headline" | "subline" | "cta" | "badge";

const BASE_COPY: Record<Role, string> = {
  eyebrow: "Keukenbladen en badkamers",
  headline: "Natuursteenlook op maat gemonteerd",
  subline: "Bezoek de showroom in Xàbia voor advies",
  cta: "Plan een showroombezoek",
  badge: "v.a. 1.250 €",
};

async function renderBytes(spec: RenderableSpec): Promise<Buffer> {
  const res = await renderCreative(spec);
  return Buffer.from(await res.arrayBuffer());
}

/** Orakel: is het laatste teken van `role` zichtbaar in de render? */
async function lastCharVisible(
  template: (typeof TEMPLATE_NAMES)[number],
  format: (typeof FORMAT_NAMES)[number],
  role: Role,
  text: string,
): Promise<boolean> {
  const make = (t: string): RenderableSpec =>
    ({
      template,
      palette: "diep",
      format,
      locale: "nl",
      copy: { ...BASE_COPY, [role]: t },
      assetUrl: ASSET,
    }) as RenderableSpec;
  const a = await renderBytes(make(text));
  const swapped = text.slice(0, -1) + (text.endsWith("W") ? "i" : "W");
  const b = await renderBytes(make(swapped));
  return !a.equals(b);
}

const SHRINKABLE: Role[] = ["headline", "subline"];
const ROLES: Role[] = ["eyebrow", "headline", "subline", "cta", "badge"];

describe("pasgarantie — tekst op de limiet rendert volledig, nooit ellipsis", () => {
  for (const template of TEMPLATE_NAMES) {
    for (const format of FORMAT_NAMES) {
      it(`${template} × ${format}`, async () => {
        const limits = TEMPLATES[template].limits[format];
        for (const role of ROLES) {
          // Op de basislimiet (100% typeschaal).
          expect(
            await lastCharVisible(template, format, role, testText(limits[role])),
            `${template}/${format}/${role}: tekst van ${limits[role]} tekens wordt afgekapt`,
          ).toBe(true);
          // Op de harde grens na automatische verkleining (78%).
          if (SHRINKABLE.includes(role)) {
            const hard = Math.floor(limits[role] / 0.78);
            expect(
              await lastCharVisible(template, format, role, testText(hard)),
              `${template}/${format}/${role}: ${hard} tekens (78%-grens) wordt afgekapt`,
            ).toBe(true);
          }
        }
      }, 120_000);
    }
  }
});
