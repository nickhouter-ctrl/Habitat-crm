/**
 * Tests voor de marketingtaxonomie: menu-integriteit, familie-mapping en het
 * signaal voor nog niet gemapte families.
 */
import { describe, expect, it } from "vitest";

import {
  allSubcategories,
  FAMILY_TO_SUBCATEGORY,
  FAMILY_KEYWORD_RULES,
  groupForSubcategory,
  OVERIG,
  subcategoryForFamily,
  TAXONOMY,
  unmappedFamilies,
} from "../taxonomy";

describe("TAXONOMY-integriteit", () => {
  it("volgt het websitemenu (7 groepen)", () => {
    expect(TAXONOMY.map((g) => g.group)).toEqual([
      "Surfaces & Walls",
      "Flooring",
      "Bathroom",
      "Heating & Lighting",
      "Garden",
      "Doors",
      "Furniture",
    ]);
  });

  it("elke expliciete mapping wijst naar een bestaande subcategorie", () => {
    const known = new Set(allSubcategories());
    for (const [family, sub] of Object.entries(FAMILY_TO_SUBCATEGORY)) {
      expect(known.has(sub), `${family} → ${sub} bestaat niet in het menu`).toBe(true);
    }
    for (const rule of FAMILY_KEYWORD_RULES) {
      expect(known.has(rule.subcategory), `keyword-regel → ${rule.subcategory}`).toBe(true);
    }
  });

  it("subcategorieën zijn uniek over alle groepen", () => {
    const subs = allSubcategories();
    expect(new Set(subs).size).toBe(subs.length);
  });
});

describe("subcategoryForFamily", () => {
  it("mapt expliciete families", () => {
    expect(subcategoryForFamily("Seating")).toBe("Furniture");
    expect(subcategoryForFamily("PVC Vloeren")).toBe("PVC Flooring");
    expect(subcategoryForFamily("Schakelaars, stopcontacten & dimmers")).toBe(
      "Switches & sockets",
    );
    expect(subcategoryForFamily("Waterdamphaard")).toBe("Fireplaces");
    expect(subcategoryForFamily("Wastafels")).toBe("Bathroom");
    expect(subcategoryForFamily("Handdoekrekken")).toBe("Accessories");
    expect(subcategoryForFamily("Binnendeuren")).toBe("Doors");
    expect(subcategoryForFamily("XPS montageplaten")).toBe("XPS Backer Boards");
    expect(subcategoryForFamily("Solid surface platen")).toBe("Acrylic panels");
  });

  it("vangt de steen-/plaatstaart met keyword-regels", () => {
    for (const family of [
      "Age Stone",
      "Danxia Rammed Earth Board",
      "Italian Travertine",
      "Slate",
      "Roman Mosaic",
      "Terrazzo Rough Stone",
      "Bvlgari Marble Pillar",
      "Zen Ando Cement Board",
      "Wattle Weaving",
    ]) {
      expect(subcategoryForFamily(family), family).toBe("Flexible Stone");
    }
  });

  it("valt terug op Overig, ook zonder familie", () => {
    expect(subcategoryForFamily("Railingen")).toBe(OVERIG);
    expect(subcategoryForFamily(null)).toBe(OVERIG);
    expect(subcategoryForFamily("")).toBe(OVERIG);
  });
});

describe("groupForSubcategory", () => {
  it("vindt de menugroep terug", () => {
    expect(groupForSubcategory("Flexible Stone")).toBe("Surfaces & Walls");
    expect(groupForSubcategory("Accessories")).toBe("Bathroom");
    expect(groupForSubcategory("Furniture")).toBe("Furniture");
    expect(groupForSubcategory("bestaat-niet")).toBe(OVERIG);
  });
});

describe("unmappedFamilies", () => {
  it("signaleert welke families nog niet gemapt zijn (gededupliceerd, gesorteerd)", () => {
    expect(
      unmappedFamilies(["Age Stone", "Railingen", "Rona", "Railingen", null, "Tables"]),
    ).toEqual(["Railingen", "Rona"]);
  });

  it("is leeg als alles gemapt is", () => {
    expect(unmappedFamilies(["Seating", "Slate"])).toEqual([]);
  });
});
