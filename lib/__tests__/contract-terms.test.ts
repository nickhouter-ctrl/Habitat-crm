import { describe, expect, it } from "vitest";

import { canonicalJson, shortHash } from "@/lib/canonical-json";
import {
  CONSENT_KEYS,
  CONTRACT_TERMS_VERSION,
  buildSnapshot,
  contractArticles,
  contractChecks,
  contractLang,
  contractSnapshotHash,
} from "@/lib/contract-terms";

const doc = {
  docNumber: "EST-2026-0042",
  title: "Verbouwing Villa Benissa",
  items: [{ name: "Sloopwerk", units: 1, price: 12000, taxRate: 21 }],
  notes: "Voorbehouden…",
  subtotalEur: "120000.00",
  taxEur: "25200.00",
  totalEur: "145200.00",
  paymentSchedule: [{ label: "bij opdracht", pct: 20, amountEur: 24000 }],
} as Parameters<typeof buildSnapshot>[0];

describe("canonicalJson", () => {
  it("negeert sleutelvolgorde", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
  });

  it("houdt arrayvolgorde vast — offerteregels zijn geordend", () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });
});

describe("contractArticles", () => {
  it("levert in elke taal minstens de negen voorbehouden", () => {
    for (const lang of ["nl", "en", "es"] as const) {
      expect(contractArticles(lang).length).toBeGreaterThanOrEqual(9);
      expect(contractArticles(lang).every((a) => a.trim().length > 40)).toBe(true);
    }
  });

  it("noemt meerwerk én onvoorziene kosten in het eerste artikel", () => {
    const eerste = contractArticles("nl")[0].toLowerCase();
    expect(eerste).toContain("meerwerk");
    expect(eerste).toContain("onvoorziene");
  });
});

describe("contractChecks", () => {
  it("heeft in elke taal een zin per vinkje", () => {
    for (const lang of ["nl", "en", "es"] as const) {
      const checks = contractChecks(lang);
      expect(checks.map((c) => c.key)).toEqual(CONSENT_KEYS);
      expect(checks.every((c) => c.text.trim().length > 30)).toBe(true);
    }
  });

  it("houdt meerwerk en onvoorzien apart — anders is één vinkje te betwisten", () => {
    const checks = contractChecks("nl");
    expect(checks.find((c) => c.key === "meerwerk")!.text).not.toBe(
      checks.find((c) => c.key === "onvoorzien")!.text,
    );
  });
});

describe("contractSnapshotHash", () => {
  it("is stabiel voor dezelfde offerte", () => {
    expect(contractSnapshotHash(buildSnapshot(doc, "nl"))).toBe(
      contractSnapshotHash(buildSnapshot(doc, "nl")),
    );
  });

  it("verandert bij één cent verschil", () => {
    const anders = { ...doc, totalEur: "145200.01" };
    expect(contractSnapshotHash(buildSnapshot(anders, "nl"))).not.toBe(
      contractSnapshotHash(buildSnapshot(doc, "nl")),
    );
  });

  it("verandert als de artikelen wijzigen (andere taal = andere tekst)", () => {
    expect(contractSnapshotHash(buildSnapshot(doc, "es"))).not.toBe(
      contractSnapshotHash(buildSnapshot(doc, "nl")),
    );
  });

  it("verandert als een regel wordt toegevoegd", () => {
    const extra = { ...doc, items: [...doc.items!, { name: "Extra", units: 1, price: 1, taxRate: 21 }] };
    expect(contractSnapshotHash(buildSnapshot(extra, "nl"))).not.toBe(
      contractSnapshotHash(buildSnapshot(doc, "nl")),
    );
  });
});

describe("contractLang", () => {
  it("valt voor Duits terug op Engels — quoteClauses kent geen Duits", () => {
    expect(contractLang("de")).toBe("en");
  });

  it("valt zonder voorkeur terug op Spaans, net als de offertepagina", () => {
    expect(contractLang(null)).toBe("es");
    expect(contractLang("fr")).toBe("es");
  });
});

describe("snapshot", () => {
  it("bevat de artikelen letterlijk, zodat het bewijs los van de code staat", () => {
    expect(buildSnapshot(doc, "nl").articles).toEqual(contractArticles("nl"));
  });

  it("draagt een versie mee die je kunt ophogen zonder oude handtekeningen te raken", () => {
    expect(CONTRACT_TERMS_VERSION).toMatch(/^\d{4}-\d{2}/);
  });
});

describe("shortHash", () => {
  it("maakt er iets van dat een mens kan vergelijken", () => {
    expect(shortHash("a".repeat(64))).toBe("AAAA-AAAA-AAAA");
  });
});
