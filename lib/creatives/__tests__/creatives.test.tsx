/**
 * CI-laagtests voor de rendermotor (brief §6 + §6b).
 *
 * De belofte van het systeem is dat elke advertentie foutloos is opgemaakt.
 * Deze suite bewaakt dat:
 *  - de registry tekenlimieten als DATA per sjabloon × formaat bevat
 *  - de kop automatisch verkleint (100% → 88% → 78%) en nooit stil afkapt
 *  - validatie een spec die niet past tegenhoudt (kan geen `approved` worden)
 *  - alle sjablonen × formaten daadwerkelijk renderen via next/og
 *    (ImageResponse) met de randgevallen uit de brief: kop van 70 tekens,
 *    één woord van 25 tekens, lege badge, lege subregel, ondersteunende tekst
 *    van 200 tekens, en alle vier de talen inclusief ñ, à, í en ¿
 *  - alle 4 paletten × 4 sjablonen × 3 formaten renderen (acceptatie §6)
 */
import { describe, expect, it } from "vitest";

import { FORMATS, FORMAT_NAMES, PALETTES, PALETTE_NAMES } from "../tokens";
import { loadCreativeFonts, loadLogoDataUri } from "../fonts";
import {
  creativeSpecSchema,
  renderableSpecSchema,
  specHash,
  type RenderableSpec,
} from "../schema";
import { headlineScaleFor, validateSpecCopy } from "../validate";
import { TEMPLATES, TEMPLATE_NAMES } from "../templates";
import { renderCreative } from "../render";

/* ------------------------------------------------------------- test fixtures */

/** 2×2 PNG (donkergroen) als data-URI — geen netwerk in tests. */
const ASSET_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAE0lEQVR4nGNgWPDsPwMDAwMDAwAkBgMBvR9AlgAAAABJRU5ErkJggg==";

function baseSpec(overrides: Partial<RenderableSpec> = {}): RenderableSpec {
  return {
    template: "frame",
    palette: "diep",
    format: "1080x1080",
    locale: "nl",
    copy: {
      eyebrow: "Keukenbladen",
      headline: "Flexible Stone vanaf showroomvoorraad",
      subline: "Bezoek de showroom in Xàbia",
      cta: "Plan een bezoek",
      badge: "v.a. 1.250 €",
    },
    assetUrl: ASSET_DATA_URI,
    ...overrides,
  };
}

const KOP_70 = "Natuursteenlook keukenbladen op maat gezaagd en gemonteerd binnen twee w"; // 70+ tekens? nee: exact hieronder gecheckt
const KOP_70_EXACT = KOP_70.slice(0, 70);
const WOORD_25 = "Natuursteenverwerkingsbed"; // één woord, 25 tekens
const SUBLINE_200 = ("Van keukenblad tot complete badkamer: wij verzorgen opmeten, " +
  "zagen, leveren en monteren in heel de Costa Blanca, met eigen ploegen en " +
  "een vaste prijs vooraf zodat u nooit voor verrassingen komt te staan bij ons.")
  .slice(0, 200);

const LOCALE_COPY: Record<string, { headline: string; subline: string; cta: string }> = {
  nl: { headline: "Keukenbladen op maat, zó geregeld", subline: "Vraag vrijblijvend een offerte aan", cta: "Plan een bezoek" },
  en: { headline: "Custom worktops, fitted fast", subline: "Visit our showroom in Jávea", cta: "Book a visit" },
  es: { headline: "¿Cuánto cuesta tu encimera? Presupuesto en un día", subline: "Visítanos en Xàbia — atención en español", cta: "Pide presupuesto" },
  de: { headline: "Arbeitsplatten nach Maß — schnell montiert", subline: "Besuchen Sie unseren Showroom in Jávea", cta: "Termin vereinbaren" },
};

/** Render een spec en controleer dat er een PNG met de juiste maten uitkomt. */
async function expectRenders(spec: RenderableSpec): Promise<void> {
  const res = await renderCreative(spec);
  const buf = new Uint8Array(await res.arrayBuffer());
  const label = `${spec.template}/${spec.format}/${spec.palette}/${spec.locale}`;
  expect(buf.length, `${label}: lege PNG`).toBeGreaterThan(1000);
  expect([...buf.slice(0, 4)], `${label}: geen PNG-magic`).toEqual([0x89, 0x50, 0x4e, 0x47]);
  const view = new DataView(buf.buffer, buf.byteOffset);
  expect(view.getUint32(16), `${label}: breedte`).toBe(FORMATS[spec.format].width);
  expect(view.getUint32(20), `${label}: hoogte`).toBe(FORMATS[spec.format].height);
}

/* ------------------------------------------------------------------- tokens */

describe("tokens", () => {
  it("heeft precies vier paletten met alle vijf rollen", () => {
    expect(PALETTE_NAMES).toHaveLength(4);
    for (const name of PALETTE_NAMES) {
      const p = PALETTES[name];
      for (const key of ["ground", "ink", "muted", "accent", "onAccent"] as const) {
        expect(p[key], `${name}.${key}`).toMatch(/^#[0-9a-f]{6}$/);
      }
      expect(["cream", "dark"]).toContain(p.logo);
    }
  });

  it("heeft drie formaten met pixelmaten", () => {
    expect(FORMAT_NAMES).toEqual(["1080x1080", "1080x1350", "1080x1920"]);
    expect(FORMATS["1080x1920"]).toMatchObject({ width: 1080, height: 1920 });
  });
});

/* ----------------------------------------------------------------- registry */

describe("template-registry", () => {
  it("bevat de vier sjablonen uit de brief", () => {
    expect(TEMPLATE_NAMES).toEqual(["frame", "split", "swatch", "price"]);
  });

  it("heeft tekenlimieten als data, per sjabloon × formaat", () => {
    for (const name of TEMPLATE_NAMES) {
      for (const format of FORMAT_NAMES) {
        const limits = TEMPLATES[name].limits[format];
        expect(limits.headline, `${name}/${format}`).toBeGreaterThan(0);
        expect(limits.eyebrow).toBeGreaterThan(0);
        expect(limits.subline).toBeGreaterThan(0);
        expect(limits.cta).toBeGreaterThan(0);
        expect(limits.badge).toBeGreaterThan(0);
      }
    }
  });

  it("verdraagt in story-formaat een langere kop dan in vierkant", () => {
    for (const name of TEMPLATE_NAMES) {
      expect(TEMPLATES[name].limits["1080x1920"].headline).toBeGreaterThan(
        TEMPLATES[name].limits["1080x1080"].headline,
      );
    }
  });
});

/* -------------------------------------------------------------- auto-shrink */

describe("headlineScaleFor", () => {
  it("gebruikt 100% binnen de limiet", () => {
    expect(headlineScaleFor(40, 40)).toBe(1);
    expect(headlineScaleFor(1, 40)).toBe(1);
  });

  it("verkleint naar 88% en daarna 78% bij overschrijding", () => {
    expect(headlineScaleFor(41, 40)).toBe(0.88);
    expect(headlineScaleFor(Math.floor(40 / 0.88), 40)).toBe(0.88);
    expect(headlineScaleFor(Math.floor(40 / 0.88) + 1, 40)).toBe(0.78);
    expect(headlineScaleFor(Math.floor(40 / 0.78), 40)).toBe(0.78);
  });

  it("geeft null (past niet) voorbij 78% — nooit stil afkappen", () => {
    expect(headlineScaleFor(Math.floor(40 / 0.78) + 1, 40)).toBeNull();
  });
});

/* --------------------------------------------------------------- validatie */

describe("validateSpecCopy", () => {
  it("keurt een passende spec goed", () => {
    expect(validateSpecCopy(baseSpec())).toEqual([]);
  });

  it("meldt per veld wat er mis is en waar", () => {
    const spec = baseSpec({
      copy: {
        ...baseSpec().copy,
        eyebrow: "E".repeat(300),
        headline: "H".repeat(300),
      },
    });
    const issues = validateSpecCopy(spec);
    const roles = issues.map((i) => i.role);
    expect(roles).toContain("eyebrow");
    expect(roles).toContain("headline");
    for (const issue of issues) {
      expect(issue.message).toMatch(/tekens/);
      expect(issue.actual).toBeGreaterThan(issue.allowed);
    }
  });

  it("laat een kop toe die alleen met verkleinen past", () => {
    const limit = TEMPLATES.frame.limits["1080x1080"].headline;
    const len = Math.floor(limit / 0.78);
    const spec = baseSpec({ copy: { ...baseSpec().copy, headline: "x".repeat(len) } });
    expect(validateSpecCopy(spec)).toEqual([]);
  });
});

/* ------------------------------------------------------------------- schema */

describe("schema", () => {
  it("valideert een correcte spec", () => {
    expect(creativeSpecSchema.safeParse(baseSpec()).success).toBe(true);
  });

  it("weigert een onbekend sjabloon of formaat", () => {
    expect(creativeSpecSchema.safeParse({ ...baseSpec(), template: "hero" }).success).toBe(false);
    expect(creativeSpecSchema.safeParse({ ...baseSpec(), format: "500x500" }).success).toBe(false);
  });

  it("weigert een lege kop", () => {
    const spec = baseSpec({ copy: { ...baseSpec().copy, headline: "" } });
    expect(creativeSpecSchema.safeParse(spec).success).toBe(false);
  });

  it("staat als assetUrl alleen https of data:image toe (geen SSRF/XSS)", () => {
    expect(renderableSpecSchema.safeParse(baseSpec()).success).toBe(true);
    expect(
      renderableSpecSchema.safeParse(baseSpec({ assetUrl: "https://cdn.example.com/x.png" }))
        .success,
    ).toBe(true);
    for (const bad of [
      "http://intern.local/x.png",
      "file:///etc/passwd",
      "javascript:alert(1)",
      "data:text/html;base64,PHNjcmlwdD4=",
    ]) {
      expect(
        renderableSpecSchema.safeParse(baseSpec({ assetUrl: bad })).success,
        bad,
      ).toBe(false);
    }
  });

  it("specHash is stabiel en onafhankelijk van sleutelvolgorde", () => {
    const a = baseSpec();
    const b = JSON.parse(JSON.stringify(a)) as RenderableSpec;
    // andere sleutelvolgorde in copy
    b.copy = { badge: a.copy.badge, headline: a.copy.headline, cta: a.copy.cta, subline: a.copy.subline, eyebrow: a.copy.eyebrow };
    expect(specHash(a)).toBe(specHash(b));
    expect(specHash(a)).toMatch(/^[0-9a-f]{64}$/);
    const c = baseSpec({ palette: "creme" });
    expect(specHash(c)).not.toBe(specHash(a));
  });
});

/* -------------------------------------------------------------------- fonts */

describe("fonts", () => {
  it("laadt Sora-ttf's als ArrayBuffer (geen CDN)", async () => {
    const fonts = await loadCreativeFonts();
    expect(fonts.length).toBeGreaterThanOrEqual(3);
    for (const f of fonts) {
      expect(f.name).toBe("Sora");
      expect(f.data.byteLength).toBeGreaterThan(10_000);
    }
    expect(new Set(fonts.map((f) => f.weight)).size).toBe(fonts.length);
  });

  it("laadt beide logovarianten als data-URI", async () => {
    for (const variant of ["cream", "dark"] as const) {
      const uri = await loadLogoDataUri(variant);
      expect(uri).toMatch(/^data:image\/png;base64,/);
    }
  });
});

/* -------------------------------------------------- render: randgevallen §6b */

describe("rendering — randgevallen per sjabloon × formaat", () => {
  expect(KOP_70_EXACT).toHaveLength(70);
  expect(WOORD_25).toHaveLength(25);
  expect(SUBLINE_200).toHaveLength(200);

  for (const template of TEMPLATE_NAMES) {
    for (const format of FORMAT_NAMES) {
      it(`${template} × ${format}: kop 70, woord 25, lege badge/subregel, subregel 200, 4 talen`, async () => {
        const variants: Array<Partial<RenderableSpec["copy"]>> = [
          { headline: KOP_70_EXACT },
          { headline: WOORD_25 },
          { badge: undefined },
          { subline: undefined },
          { subline: SUBLINE_200 },
        ];
        for (const copyOverride of variants) {
          await expectRenders(
            baseSpec({ template, format, copy: { ...baseSpec().copy, ...copyOverride } }),
          );
        }
        for (const [locale, copy] of Object.entries(LOCALE_COPY)) {
          await expectRenders(
            baseSpec({
              template,
              format,
              locale: locale as RenderableSpec["locale"],
              copy: { ...baseSpec().copy, ...copy },
            }),
          );
        }
      }, 120_000);
    }
  }
});

/* ------------------------------------------- render: paletten (acceptatie §6) */

describe("rendering — vier paletten zonder overloop (kop 60, lege badge)", () => {
  const KOP_60 = "Badkamers en keukenbladen uit één hand, gemonteerd in Xàbia!".slice(0, 60);
  expect(KOP_60).toHaveLength(60);

  for (const palette of PALETTE_NAMES) {
    it(`palet ${palette}: alle sjablonen × formaten`, async () => {
      for (const template of TEMPLATE_NAMES) {
        for (const format of FORMAT_NAMES) {
          await expectRenders(
            baseSpec({
              template,
              format,
              palette,
              copy: { ...baseSpec().copy, headline: KOP_60, badge: undefined },
            }),
          );
        }
      }
    }, 120_000);
  }
});
