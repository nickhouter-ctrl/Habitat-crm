import { describe, expect, it } from "vitest";

import { kindsForWeek, nextWeekStart, planWeek, shiftDate, stepNumber, weekStartOf, type PlannerAsset } from "../planner";

const NAMES = [
  ...["install-adhesive-1", "install-adhesive-2", "install-cut-3", "install-press-4", "install-finish-5"],
  ...["curved-shower-1", "curved-shower-2", "shower-villa-3", "shower-detail-4"],
  ...["column-wrapped-1", "column-wrapped-2", "column-wrapped-3"],
  ...["kitchen-ibiza-1", "kitchen-2", "kitchen-3", "kitchen-4"],
  ...["texture-hand-touch-1", "texture-closeup-2"],
  ...["MS-033-travertine-interieur", "MS-101-interieur", "bathroom-1", "bathroom-2", "bathroom-3"],
  ...["black-marble-bathroom", "MS-200-nero-marquina-kitchen"],
];

function library(lastUsed: Record<string, string> = {}): PlannerAsset[] {
  return NAMES.map((name, i) => ({
    id: `a${i}`,
    name: `${name}.jpg`,
    tags: [],
    width: 2000,
    height: 2500,
    lastUsedOn: lastUsed[`a${i}`] ?? null,
  }));
}

const base = { weekdays: [1, 3, 5], reuseAfterDays: 90, excludeKeywords: ["black", "nero", "marquina"] };

describe("weekdatums", () => {
  it("nextWeekStart geeft de maandag van de volgende week (Madrid)", () => {
    // Donderdag 12 nov 2026, 07:00 Madrid.
    expect(nextWeekStart(new Date("2026-11-12T06:00:00Z"))).toBe("2026-11-16");
    // Zondagavond laat in Madrid is al maandag? Nee: 23:30 Madrid is nog zondag.
    expect(nextWeekStart(new Date("2026-11-15T22:30:00Z"))).toBe("2026-11-16");
    // Maandag 00:30 Madrid (= zondag 23:30 UTC) → de maandag erna.
    expect(nextWeekStart(new Date("2026-11-15T23:30:00Z"))).toBe("2026-11-23");
  });

  it("weekStartOf en shiftDate", () => {
    expect(weekStartOf("2026-11-19")).toBe("2026-11-16");
    expect(weekStartOf("2026-11-22")).toBe("2026-11-16");
    expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("kindsForWeek", () => {
  it("heeft precies één video, in het midden van ma/wo/vr", () => {
    const kinds = kindsForWeek(3, "2026-11-16");
    expect(kinds.filter((k) => k === "video")).toHaveLength(1);
    expect(kinds[1]).toBe("video");
  });

  it("wisselt de andere soorten per week", () => {
    const weeks = ["2026-11-16", "2026-11-23", "2026-11-30"].map((w) => kindsForWeek(3, w).join(","));
    expect(new Set(weeks).size).toBe(3);
  });

  it("ook bij 7 postdagen één video", () => {
    expect(kindsForWeek(7, "2026-11-16").filter((k) => k === "video")).toHaveLength(1);
  });
});

describe("planWeek", () => {
  it("plant ma/wo/vr met één video en geen beeld dubbel", () => {
    const plan = planWeek({ ...base, weekStart: "2026-11-16", assets: library() });
    expect(plan.map((p) => p.plannedDate)).toEqual(["2026-11-16", "2026-11-18", "2026-11-20"]);
    expect(plan.filter((p) => p.kind === "video")).toHaveLength(1);
    const ids = plan.flatMap((p) => [...p.assetIds, ...(p.videoSourceAssetId ? [p.videoSourceAssetId] : [])]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("geeft elke post een ander thema", () => {
    for (const weekStart of ["2026-11-16", "2026-11-23", "2026-11-30"]) {
      const plan = planWeek({ ...base, weekStart, assets: library() });
      expect(new Set(plan.map((p) => p.theme)).size).toBe(plan.length);
    }
  });

  it("carrousels hebben 3–5 beelden van hetzelfde thema; uitleg op stapvolgorde", () => {
    const weeks = ["2026-11-16", "2026-11-23", "2026-11-30"].flatMap((w) => planWeek({ ...base, weekStart: w, assets: library() }));
    const carousels = weeks.filter((p) => p.kind === "carousel" || p.kind === "howto");
    expect(carousels.length).toBeGreaterThan(0);
    for (const c of carousels) {
      expect(c.assetIds.length).toBeGreaterThanOrEqual(3);
      expect(c.assetIds.length).toBeLessThanOrEqual(5);
    }
    const howto = weeks.find((p) => p.kind === "howto");
    expect(howto?.theme).toBe("installation");
    const names = howto!.assetIds.map((id) => NAMES[Number(id.slice(1))]);
    const steps = names.map((n) => stepNumber(n));
    expect(steps).toEqual([...steps].sort((a, b) => a! - b!));
  });

  it("gebruikt nooit uitgesloten (zwart/donker marmer) beelden", () => {
    const plan = planWeek({ ...base, weekStart: "2026-11-16", assets: library() });
    const names = plan.flatMap((p) => [...p.assetIds, p.videoSourceAssetId].filter(Boolean)).map((id) => NAMES[Number(id!.slice(1))]);
    expect(names.some((n) => /black|nero|marquina/.test(n))).toBe(false);
  });

  it("slaat recent gebruikte beelden over zolang er genoeg andere zijn", () => {
    const first = planWeek({ ...base, weekStart: "2026-11-16", assets: library() });
    const used: Record<string, string> = {};
    for (const p of first) for (const id of [...p.assetIds, p.videoSourceAssetId]) if (id) used[id] = p.plannedDate;
    const second = planWeek({ ...base, weekStart: "2026-11-23", assets: library(used) });
    const again = second.flatMap((p) => [...p.assetIds, p.videoSourceAssetId]).filter((id) => id && used[id]);
    expect(again).toEqual([]);
  });

  it("is deterministisch voor dezelfde week", () => {
    const a = planWeek({ ...base, weekStart: "2026-11-16", assets: library() });
    const b = planWeek({ ...base, weekStart: "2026-11-16", assets: library() });
    expect(a).toEqual(b);
  });

  it("valt terug op een losse foto als er te weinig beelden zijn", () => {
    const plan = planWeek({ ...base, weekStart: "2026-11-16", assets: library().slice(0, 2) });
    expect(plan).toHaveLength(3);
    for (const p of plan) if (p.kind !== "video") expect(p.assetIds.length).toBeLessThanOrEqual(1);
  });

  it("volgt de ingestelde weekdagen", () => {
    const plan = planWeek({ ...base, weekdays: [2, 4], weekStart: "2026-11-16", assets: library() });
    expect(plan.map((p) => p.plannedDate)).toEqual(["2026-11-17", "2026-11-19"]);
  });
});
