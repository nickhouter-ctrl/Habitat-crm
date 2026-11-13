import { describe, expect, it } from "vitest";

import {
  LOCAL_HASHTAGS,
  LOCATION_LINE,
  MAX_HASHTAGS,
  SEPARATOR,
  buildHashtags,
  fallbackCaption,
  formatCaption,
  hasRiskyClaim,
  parseCaptionResponse,
  stripRiskyClaims,
  videoPrompt,
} from "../caption";
import { deriveTheme, isExcluded, preferenceScore, productCode } from "../themes";
import { parseWeekdays, parsePublishTime, socialConfig } from "../config";

describe("formatCaption", () => {
  it("zet Engels eerst, dan —, dan Spaans, dan de plaats en de hashtags", () => {
    const caption = formatCaption({ en: "Stone that bends.", es: "Piedra que se curva.", hashtags: buildHashtags("shower") });
    const parts = caption.split("\n\n");
    expect(parts[0]).toBe("Stone that bends.");
    expect(parts[1]).toBe(SEPARATOR);
    expect(parts[2]).toBe("Piedra que se curva.");
    expect(parts[3]).toBe(LOCATION_LINE);
    expect(parts[4].startsWith(LOCAL_HASHTAGS.join(" "))).toBe(true);
    expect(parts[4]).toContain("#ducha");
    expect(caption.indexOf("Stone")).toBeLessThan(caption.indexOf("Piedra"));
  });

  it("haalt hashtags uit de lopende tekst (die staan onderaan)", () => {
    const caption = formatCaption({ en: "Nice #stone wall.", es: "Bonita #piedra.", hashtags: [] });
    expect(caption.split("\n\n")[0]).not.toContain("#");
  });

  it("schrapt niet-verifieerbare claims", () => {
    const caption = formatCaption({
      en: "Warm texture. Only 3 mm thick and fire-rated A1. Visit us.",
      es: "Textura cálida. Precio desde 45 €. Ven a vernos.",
      hashtags: [],
    });
    expect(caption).not.toMatch(/mm|A1|fire|€|Precio/i);
    expect(caption).toContain("Warm texture.");
    expect(caption).toContain("Ven a vernos.");
  });
});

describe("claims", () => {
  it("herkent risicozinnen", () => {
    expect(hasRiskyClaim("Only 2,5 kg per panel")).toBe(true);
    expect(hasRiskyClaim("Ignífugo y resistente")).toBe(true);
    expect(hasRiskyClaim("Lifetime warranty")).toBe(true);
    expect(hasRiskyClaim("Run your hand over the grain.")).toBe(false);
  });
  it("laat lege regels niet stapelen", () => {
    expect(stripRiskyClaims("A.\n\n\n\nB.")).toBe("A.\n\nB.");
  });
});

describe("hashtags", () => {
  it("begint met de lokale tags, ontdubbelt en blijft onder het maximum", () => {
    const tags = buildHashtags("kitchen", ["#Javea", "cocina", "#nieuw tag", ...Array.from({ length: 40 }, (_, i) => `#t${i}`)]);
    expect(tags.slice(0, LOCAL_HASHTAGS.length)).toEqual(LOCAL_HASHTAGS);
    expect(tags.filter((t) => t.toLowerCase() === "#javea")).toHaveLength(1);
    expect(tags).toContain("#nieuwtag");
    expect(tags.length).toBeLessThanOrEqual(MAX_HASHTAGS);
  });
});

describe("fallbackCaption", () => {
  it("volgt hetzelfde formaat", () => {
    const caption = fallbackCaption("installation", "howto");
    expect(caption.split("\n\n")[1]).toBe(SEPARATOR);
    expect(caption).toContain(LOCATION_LINE);
    expect(caption).toContain("#HabitatOne");
  });
});

describe("parseCaptionResponse", () => {
  it("leest JSON (ook in codeblok)", () => {
    expect(parseCaptionResponse('```json\n{"en":"Hi","es":"Hola","tags":["#a"]}\n```')).toEqual({ en: "Hi", es: "Hola", tags: ["#a"] });
  });
  it("null bij ontbrekende taal of rommel", () => {
    expect(parseCaptionResponse('{"en":"Hi"}')).toBeNull();
    expect(parseCaptionResponse("geen json")).toBeNull();
  });
});

describe("videoPrompt", () => {
  it("vraagt villa-stijl en sluit donker marmer uit", () => {
    expect(videoPrompt("texture")).toMatch(/hand/i);
    expect(videoPrompt("anything")).toMatch(/no dark or black marble/);
  });
});

describe("thema's", () => {
  it("leidt het thema af uit de bestandsnaam", () => {
    expect(deriveTheme("column-wrapped.jpg")).toBe("column");
    expect(deriveTheme("curved-shower-02.jpg")).toBe("shower");
    expect(deriveTheme("install-adhesive.jpg")).toBe("installation");
    expect(deriveTheme("MS-033-sandstone-interieur.jpg")).toBe("interior");
    expect(deriveTheme("MS-033.jpg")).toBe("product");
    expect(deriveTheme("benefit-light.jpg")).toBe("benefit");
    expect(deriveTheme("IMG_0001.jpg")).toBe("general");
    expect(productCode("ms033-x")).toBe("MS-033");
  });

  it("sluit uit op hele woorden", () => {
    expect(isExcluded("black-marble-bathroom.jpg", [], ["black"])).toBe(true);
    expect(isExcluded("blackwood.jpg", [], ["black"])).toBe(false);
    expect(isExcluded("x.jpg", ["Nero Marquina"], ["marquina"])).toBe(true);
  });

  it("geeft echte montage/textuur voorrang boven renders", () => {
    expect(preferenceScore({ name: "install-hands-villa.jpg" })).toBeGreaterThan(preferenceScore({ name: "kitchen-render.jpg" }));
    expect(preferenceScore({ name: "x.jpg", source: "generated" })).toBeLessThan(preferenceScore({ name: "x.jpg", source: "upload" }));
  });
});

describe("config", () => {
  it("weekdagen en tijd", () => {
    expect(parseWeekdays(undefined)).toEqual([1, 3, 5]);
    expect(parseWeekdays("5, 1,1,9")).toEqual([1, 5]);
    expect(parsePublishTime("25:00")).toBe("08:00");
    expect(parsePublishTime("08:30")).toBe("08:30");
    expect(socialConfig({ SOCIAL_EXCLUDE_KEYWORDS: "a, B" }).excludeKeywords).toEqual(["a", "b"]);
    expect(socialConfig({}).excludeKeywords).toContain("marquina");
  });
});
