import { describe, expect, it } from "vitest";

import { heuristicPostChange, parsePostChange } from "../caption";
import { pickAssets, type PlannerAsset } from "../planner";

describe("heuristicPostChange", () => {
  it("herkent foto-verzoeken", () => {
    expect(heuristicPostChange("voeg meer fotos toe").photos).toBe("more");
    expect(heuristicPostChange("andere post met andere fotos").photos).toBe("replace");
    expect(heuristicPostChange("minder foto's, 2 is genoeg")).toMatchObject({ photos: "fewer", count: 2 });
    expect(heuristicPostChange("maak de tekst korter")).toMatchObject({ photos: "keep", captionInstruction: "maak de tekst korter" });
  });
});

describe("parsePostChange", () => {
  it("valideert het AI-antwoord", () => {
    expect(parsePostChange('{"photos":"more","count":4,"theme":"outdoor","captionInstruction":null}', "x")).toEqual({
      photos: "more",
      count: 4,
      theme: "outdoor",
      captionInstruction: null,
    });
    expect(parsePostChange('{"photos":"zap","count":9,"theme":"moon"}', "korter")).toEqual({
      photos: "keep",
      count: null,
      theme: null,
      captionInstruction: "korter",
    });
    expect(parsePostChange("geen json", "x")).toBeNull();
  });
});

describe("pickAssets", () => {
  const assets: PlannerAsset[] = [
    { id: "t1", name: "MS-001-texture-closeup.jpg", tags: [] },
    { id: "o1", name: "villa-pool-exterieur-1.jpg", tags: [] },
    { id: "o2", name: "villa-pool-exterieur-2.jpg", tags: [] },
    { id: "o3", name: "villa-pool-exterieur-3.jpg", tags: [] },
    { id: "b1", name: "MS-020-black-marble-bathroom.jpg", tags: [] },
  ];
  const base = { assets, excludeKeywords: ["black"], reuseCutoff: "2026-10-01", seed: "s" };

  it("kiest andere beelden en slaat uitgesloten over", () => {
    const r = pickAssets({ ...base, count: 3, avoidIds: ["t1"] });
    expect(r.ids).toHaveLength(3);
    expect(r.ids).not.toContain("t1");
    expect(r.ids).not.toContain("b1");
  });

  it("losse foto: liever een sfeerbeeld dan een close-up", () => {
    const r = pickAssets({ ...base, count: 1, avoidIds: [] });
    expect(r.ids[0]).not.toBe("t1");
  });
});
