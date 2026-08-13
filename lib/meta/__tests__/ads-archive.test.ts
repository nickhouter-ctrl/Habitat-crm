/**
 * Unit tests voor de pure logica van de concurrentiemonitor (brief §8b):
 * looptijdberekening (hét signaal), archief-naar-rij-mapping, de
 * token-verloopwaarschuwing (geen stille storing) en de dashboard-aggregatie.
 */
import { describe, expect, it } from "vitest";

import {
  daysRunning,
  mapArchiveAd,
  summarizeCompetitorAds,
  tokenExpiryWarning,
  type ArchiveAd,
  type CompetitorAdLike,
} from "../ads-archive";

const NOW = new Date("2026-08-13T12:00:00Z");

/* -------------------------------------------------------------- daysRunning */

describe("daysRunning", () => {
  it("telt dagen tussen start en stop", () => {
    expect(
      daysRunning(new Date("2026-06-01T00:00:00Z"), new Date("2026-07-01T00:00:00Z"), NOW),
    ).toBe(30);
  });

  it("gebruikt 'nu' voor advertenties die nog draaien", () => {
    expect(daysRunning(new Date("2026-08-03T12:00:00Z"), null, NOW)).toBe(10);
  });

  it("telt een advertentie van vandaag als 1 dag, nooit 0", () => {
    expect(daysRunning(new Date("2026-08-13T09:00:00Z"), null, NOW)).toBe(1);
  });

  it("geeft null zonder startdatum", () => {
    expect(daysRunning(null, null, NOW)).toBeNull();
  });
});

/* ------------------------------------------------------------- mapArchiveAd */

describe("mapArchiveAd", () => {
  const ad: ArchiveAd = {
    id: "arch-1",
    ad_delivery_start_time: "2026-06-01T00:00:00+0000",
    ad_delivery_stop_time: "2026-07-15T00:00:00+0000",
    ad_creative_bodies: ["Reforma tu baño"],
    ad_creative_link_titles: ["Habitat One"],
    ad_snapshot_url: "https://www.facebook.com/ads/archive/render_ad/?id=arch-1",
    publisher_platforms: ["instagram", "facebook"],
    languages: ["es"],
    eu_total_reach: 12345,
  };

  it("zet archiefvelden om naar een competitor_ads-rij", () => {
    const row = mapArchiveAd("comp-1", ad, NOW);
    expect(row.competitorId).toBe("comp-1");
    expect(row.metaAdArchiveId).toBe("arch-1");
    expect(row.deliveryStart?.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(row.deliveryStop?.toISOString()).toBe("2026-07-15T00:00:00.000Z");
    expect(row.bodies).toEqual(["Reforma tu baño"]);
    expect(row.languages).toEqual(["es"]);
    expect(row.platforms).toEqual(["instagram", "facebook"]);
    expect(row.euTotalReach).toBe(12345);
    expect(row.daysRunning).toBe(44);
    // Verwijzing, geen kopie: alleen de snapshot-URL, nooit gedownloade media.
    expect(row.snapshotUrl).toContain("facebook.com/ads/archive");
  });

  it("laat stop leeg voor lopende advertenties en rekent looptijd tot nu", () => {
    const row = mapArchiveAd("comp-1", { ...ad, ad_delivery_stop_time: undefined }, NOW);
    expect(row.deliveryStop).toBeNull();
    // 1 juni 00:00 → 13 aug 12:00 = 73,5 dagen → afgerond 74.
    expect(row.daysRunning).toBe(74);
  });
});

/* ------------------------------------------------------- tokenExpiryWarning */

describe("tokenExpiryWarning", () => {
  it("zwijgt als het token nog ruim geldig is", () => {
    expect(tokenExpiryWarning(new Date("2026-10-01T00:00:00Z"), NOW)).toBeNull();
  });

  it("waarschuwt binnen 14 dagen vóór verlopen, met dagen en vervolgactie", () => {
    const warning = tokenExpiryWarning(new Date("2026-08-20T12:00:00Z"), NOW);
    expect(warning).toMatch(/7 dagen/);
    expect(warning).toMatch(/vernieuw/i);
  });

  it("meldt een verlopen token expliciet", () => {
    expect(tokenExpiryWarning(new Date("2026-08-01T00:00:00Z"), NOW)).toMatch(/verlopen/i);
  });

  it("geeft null zonder verloopdatum (die kennen we dan niet)", () => {
    expect(tokenExpiryWarning(null, NOW)).toBeNull();
  });
});

/* --------------------------------------------------- summarizeCompetitorAds */

function fakeAd(overrides: Partial<CompetitorAdLike>): CompetitorAdLike {
  return {
    metaAdArchiveId: Math.random().toString(36).slice(2),
    deliveryStart: new Date("2026-08-01T00:00:00Z"),
    deliveryStop: null,
    daysRunning: 12,
    languages: ["es"],
    platforms: ["instagram"],
    euTotalReach: 1000,
    bodies: null,
    titles: null,
    snapshotUrl: null,
    ...overrides,
  };
}

describe("summarizeCompetitorAds", () => {
  it("zet langlopers (≥ 30 dagen) bovenaan, gesorteerd op looptijd", () => {
    const summary = summarizeCompetitorAds(
      [
        fakeAd({ metaAdArchiveId: "kort", daysRunning: 5 }),
        fakeAd({ metaAdArchiveId: "lang-45", daysRunning: 45 }),
        fakeAd({ metaAdArchiveId: "lang-60", daysRunning: 60 }),
        fakeAd({ metaAdArchiveId: "rand-30", daysRunning: 30 }),
      ],
      NOW,
    );
    expect(summary.longRunners.map((a) => a.metaAdArchiveId)).toEqual([
      "lang-60",
      "lang-45",
      "rand-30",
    ]);
  });

  it("telt taal- en platformverdeling per advertentie", () => {
    const summary = summarizeCompetitorAds(
      [
        fakeAd({ languages: ["es"], platforms: ["instagram"] }),
        fakeAd({ languages: ["es", "en"], platforms: ["instagram", "facebook"] }),
        fakeAd({ languages: ["nl"], platforms: ["facebook"] }),
      ],
      NOW,
    );
    expect(summary.languageSplit).toEqual({ es: 2, en: 1, nl: 1 });
    expect(summary.platformSplit).toEqual({ instagram: 2, facebook: 2 });
  });

  it("berekent instroom per maand op delivery_start (laatste 6 maanden)", () => {
    const summary = summarizeCompetitorAds(
      [
        fakeAd({ deliveryStart: new Date("2026-08-05T00:00:00Z") }),
        fakeAd({ deliveryStart: new Date("2026-08-20T00:00:00Z") }),
        fakeAd({ deliveryStart: new Date("2026-07-01T00:00:00Z") }),
        fakeAd({ deliveryStart: new Date("2025-01-01T00:00:00Z") }), // te oud
      ],
      NOW,
    );
    expect(summary.inflowByMonth).toEqual([
      { month: "2026-03", count: 0 },
      { month: "2026-04", count: 0 },
      { month: "2026-05", count: 0 },
      { month: "2026-06", count: 0 },
      { month: "2026-07", count: 1 },
      { month: "2026-08", count: 2 },
    ]);
  });

  it("sommeert eu_total_reach als ruwe budget-indicatie", () => {
    const summary = summarizeCompetitorAds(
      [fakeAd({ euTotalReach: 1000 }), fakeAd({ euTotalReach: 2500 }), fakeAd({ euTotalReach: null })],
      NOW,
    );
    expect(summary.totalReach).toBe(3500);
  });

  it("geeft een lege samenvatting bij nul advertenties", () => {
    const summary = summarizeCompetitorAds([], NOW);
    expect(summary.longRunners).toEqual([]);
    expect(summary.totalReach).toBe(0);
    expect(summary.inflowByMonth).toHaveLength(6);
  });
});
