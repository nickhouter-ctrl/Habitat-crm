import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  MODULES,
  ROLES,
  ROLE_CAPS,
  ROLE_LABEL,
  ROLE_MODULES,
  heeftCap,
  magAlles,
  magPad,
  moduleVoorPad,
  padHeeftRegel,
  startPadVoorRol,
} from "@/lib/auth/modules";

const APP = join(process.cwd(), "app", "(app)");

/**
 * Elk pad achter de login moet een regel hebben. Dit is de belangrijkste test
 * van het hele rollenverhaal: een vergeten guard valt stil open, een vergeten
 * regel in de tabel laat deze test falen.
 */
function padenUitBestanden(dir: string, prefix = ""): string[] {
  const uit: string[] = [];
  for (const naam of readdirSync(dir)) {
    const pad = join(dir, naam);
    if (statSync(pad).isDirectory()) {
      // Routegroepen tellen niet mee in de URL; mappen met _ zijn privé.
      if (naam.startsWith("_")) continue;
      const stuk = naam.startsWith("(") && naam.endsWith(")") ? "" : `/${naam}`;
      uit.push(...padenUitBestanden(pad, prefix + stuk));
    } else if (naam === "page.tsx" || naam === "route.ts") {
      uit.push(prefix || "/");
    }
  }
  return uit;
}

/** [id] en [...slug] zijn in de tabel niet interessant: de prefix bepaalt de module. */
const naarUrl = (p: string) => p.replace(/\/\[[^\]]+\]/g, "/x");

describe("moduletabel", () => {
  it("heeft een regel voor elk pad onder app/(app)", () => {
    const paden = [...new Set(padenUitBestanden(APP).map(naarUrl))].sort();
    expect(paden.length).toBeGreaterThan(40); // teken dat de inventarisatie werkte
    const zonderRegel = paden.filter((p) => !padHeeftRegel(p));
    expect(zonderRegel).toEqual([]);
  });

  it("dekt ook de ingelogde pagina's buiten de routegroep", () => {
    for (const p of ["/labels", "/print-labels"]) expect(padHeeftRegel(p)).toBe(true);
  });

  it("kent elke rol een label en mogelijkheden toe", () => {
    for (const rol of ROLES) {
      expect(ROLE_LABEL[rol]).toBeTruthy();
      expect(ROLE_CAPS[rol]).toBeDefined();
      expect(ROLE_MODULES[rol]).toBeDefined();
    }
  });

  it("gebruikt geen module in ROLE_MODULES die niet bestaat", () => {
    const bestaand = new Set(MODULES.map((m) => m.key));
    for (const rol of ROLES) {
      const m = ROLE_MODULES[rol];
      if (m === "*") continue;
      for (const key of m) expect(bestaand.has(key)).toBe(true);
    }
  });

  it("laat de langste prefix winnen en houdt bijna-gelijke paden uit elkaar", () => {
    expect(moduleVoorPad("/leads")).toBe("leads");
    expect(moduleVoorPad("/leads/import")).toBe("leads");
    // /leadsachtig is géén submap van /leads
    expect(moduleVoorPad("/leadsachtig")).toBe("dashboard");
    expect(moduleVoorPad("/")).toBe("start");
    expect(moduleVoorPad("/sent-mail/123/print")).toBe("inbox");
  });
});

describe("rol marketing", () => {
  it("mag bij mail, contacten, aanvragen, leads, agenda en de assistent", () => {
    for (const p of ["/", "/inbox", "/sent-mail/1", "/contacts", "/contacts/1", "/aanvragen", "/leads", "/leads/import", "/assistent", "/agenda", "/settings", "/search"]) {
      expect(magPad("marketing", p)).toBe(true);
    }
  });

  it("mag niet bij projecten, financiën, inkoop, prijzen, panden en kozijnen", () => {
    for (const p of [
      "/projects",
      "/projects/1/begroting/pdf",
      "/invoices",
      "/voorschotten",
      "/inkooporders",
      "/bestellen",
      "/prijzenboek",
      "/prijslijst/pdf",
      "/properties",
      "/kozijnen",
      "/kozijnen/portaal",
      "/dashboard",
      "/rapporten/pdf",
      "/commissies",
      "/accounts",
      "/windows-accounts",
      "/archief",
      "/products",
      "/products/export",
      "/quotes",
      "/documents/1/pdf",
      "/marketing",
    ]) {
      expect(magPad("marketing", p)).toBe(false);
    }
  });

  it("mag wijzigen maar geen bedragen zien en het team niet beheren", () => {
    expect(heeftCap("marketing", "schrijven")).toBe(true);
    expect(heeftCap("marketing", "bedragen")).toBe(false);
    expect(heeftCap("marketing", "teambeheer")).toBe(false);
  });

  it("valt dicht bij een pad dat niet in de tabel staat", () => {
    expect(magPad("marketing", "/iets-nieuws")).toBe(false);
    expect(magPad("admin", "/iets-nieuws")).toBe(true);
  });
});

describe("bestaande rollen veranderen niet", () => {
  it("laat admin, agent en viewer overal bij", () => {
    for (const rol of ["admin", "agent", "viewer"] as const) {
      expect(magAlles(rol)).toBe(true);
      expect(magPad(rol, "/projects")).toBe(true);
      expect(magPad(rol, "/wat-dan-ook")).toBe(true);
    }
  });

  it("houdt viewer alleen-lezen en admin als enige beheerder", () => {
    expect(heeftCap("viewer", "schrijven")).toBe(false);
    expect(heeftCap("agent", "schrijven")).toBe(true);
    expect(heeftCap("agent", "teambeheer")).toBe(false);
    expect(heeftCap("admin", "teambeheer")).toBe(true);
  });
});

describe("onbekende rollen", () => {
  it("krijgen niets — ook niet bij een leeg of vreemd cookie", () => {
    for (const rol of [undefined, null, "", "root", "MARKETING", 42]) {
      expect(magPad(rol, "/")).toBe(false);
      expect(heeftCap(rol, "schrijven")).toBe(false);
      expect(startPadVoorRol(rol)).toBe("/login");
    }
  });

  it("sturen marketing naar de startpagina", () => {
    expect(startPadVoorRol("marketing")).toBe("/");
  });
});

/**
 * De guards zelf: staat er nog ergens een controle die alleen "mag deze
 * gebruiker wijzigen" vraagt, zonder te kijken bij welke module het hoort? Dat
 * is precies het gat waar een beperkt account door glipt — een server action is
 * met een gewone POST aan te roepen, ook als de pagina niet in het menu staat.
 */
describe("guards in de code", () => {
  const bestanden = (dir: string, uit: string[] = []): string[] => {
    for (const naam of readdirSync(dir)) {
      const pad = join(dir, naam);
      if (statSync(pad).isDirectory()) bestanden(pad, uit);
      else if (/\.tsx?$/.test(naam)) uit.push(pad);
    }
    return uit;
  };

  it("gebruikt requireWriteUser nergens meer buiten lib/auth", () => {
    const fout = bestanden(join(process.cwd(), "app"))
      .concat(bestanden(join(process.cwd(), "lib", "website")))
      .filter((f) => /requireWriteUser\(/.test(readFileSync(f, "utf8")));
    expect(fout.map((f) => f.replace(process.cwd() + "/", ""))).toEqual([]);
  });

  it("laat elk actions-bestand een module of een sterkere eis noemen", () => {
    const zonder = bestanden(join(process.cwd(), "app", "(app)"))
      .filter((f) => /\/(actions|.*-actions|queue-invoice)\.ts$/.test(f))
      .filter((f) => {
        const src = readFileSync(f, "utf8");
        // _start slaat de guard bewust over: eigen tegelvoorkeuren.
        if (f.includes("/_start/")) return false;
        // Een module, of iets strengers: beheerder of een mogelijkheid.
        return !/require(?:Module\("|Admin|Capability)/.test(src);
      });
    expect(zonder.map((f) => f.replace(process.cwd() + "/", ""))).toEqual([]);
  });
});
