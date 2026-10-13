import { describe, expect, it } from "vitest";
import { findWebsiteBrochure, WEBSITE_BROCHURES } from "@/lib/brochure-links";

describe("CRM website brochure choices", () => {
  it("exposes only the permanent English and Spanish Habitat One links", () => {
    expect(WEBSITE_BROCHURES.map(({ path, url }) => [path, url])).toEqual([
      ["brochure:stone-motion-en", "https://www.habitat-one.com/brochure/en"],
      ["brochure:stone-motion-es", "https://www.habitat-one.com/brochure/es"],
    ]);
  });

  it("does not resolve arbitrary client-supplied brochure paths", () => {
    expect(findWebsiteBrochure("brochure:stone-motion-en")?.url).toBe("https://www.habitat-one.com/brochure/en");
    expect(findWebsiteBrochure("brochure:https://attacker.example/file.pdf")).toBeUndefined();
  });
});
