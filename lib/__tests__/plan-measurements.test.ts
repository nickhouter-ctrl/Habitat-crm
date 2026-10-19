import { describe, expect, it } from "vitest";
import { emptyConfig, newBathroom, postQuantity, type CalcPost } from "../calculator";
import { applyPlanMeasurements, planSchema, type PlanRead, type PlanRoom } from "../plan-measurements";

const room: PlanRoom = {
  name: "Badkamer", type: "bathroom", floorM2: 8, perimeterM: 12,
  wallHeightM: 2.5, openingsM2: 2, showers: 1, baths: 0, toilets: 1, basins: 2,
  confidence: "high", evidence: "Zichtbare maatvoering",
};
const plan = (rooms: PlanRoom[]): PlanRead => ({ unit: "m", scale: null, rooms, notes: [] });

describe("drawing proposals", () => {
  it("accepts a detailed dimension explanation without relaxing numeric validation", () => {
    const detailed = { ...room, evidence: "Visible dimensions and arithmetic. ".repeat(15) };
    expect(planSchema.safeParse(plan([detailed])).success).toBe(true);
    expect(planSchema.safeParse(plan([{ ...detailed, floorM2: -12 }])).success).toBe(false);
    expect(planSchema.safeParse(plan([{ ...room, evidence: "x".repeat(1001) }])).success).toBe(false);
  });
  it("preserves existing floor area unless staff confirms the drawing covers the whole home", () => {
    const config = { ...emptyConfig(), dimensions: { woonoppervlak_m2: 120, tegelvloer_m2: 15 } };
    expect(applyPlanMeasurements(config, plan([room])).dimensions).toEqual(config.dimensions);
    expect(applyPlanMeasurements(config, plan([room]), true).dimensions).toEqual({ woonoppervlak_m2: 8, tegelvloer_m2: 15 });
  });

  it("does not apply an incomplete total floor area", () => {
    expect(() => applyPlanMeasurements(emptyConfig(), plan([room, { ...room, floorM2: null }]), true)).toThrow("alle ruimten");
  });

  it("keeps existing bathrooms when the drawing contains only other rooms", () => {
    const config = { ...emptyConfig(), bathrooms: [newBathroom()] };
    expect(applyPlanMeasurements(config, plan([{ ...room, type: "living" }])).bathrooms).toEqual(config.bathrooms);
  });

  it("rejects unsupported bathroom counts and basin counts without truncating", () => {
    expect(() => applyPlanMeasurements(emptyConfig(), plan(Array.from({ length: 13 }, () => room)))).toThrow("12 badkamers");
    expect(() => applyPlanMeasurements(emptyConfig(), plan([{ ...room, basins: 3 }]))).toThrow("2 wasbakken");
    expect(applyPlanMeasurements(emptyConfig(), plan([room])).bathrooms[0].basins).toBe(2);
  });

  it("never invents square-room wall quantities for a drawing missing measurements", () => {
    const post = { name: "Wandtegels badkamer", id: "wall", factor: 1 } as CalcPost;
    for (const missing of [{ perimeterM: null }, { wallHeightM: null }, { openingsM2: null }]) {
      const config = applyPlanMeasurements(emptyConfig(), plan([{ ...room, ...missing }]));
      expect(config.bathrooms[0].wallTiles).toBe(false);
      expect(postQuantity(post, config)).toBe(0);
    }
    expect(postQuantity(post, applyPlanMeasurements(emptyConfig(), plan([room])))).toBe(28);
  });

  it("does not turn unknown fixture counts or floor areas into bathroom defaults", () => {
    const config = applyPlanMeasurements(emptyConfig(), plan([{ ...room, floorM2: null, showers: null, basins: null }]));
    expect(config.bathrooms[0]).toMatchObject({ m2: 0, floorTiles: false, showers: 0, basins: 0 });
  });

  it("rejects malformed AI output and totals exceeding the calculator limits", () => {
    expect(() => applyPlanMeasurements(emptyConfig(), plan([{ ...room, floorM2: -1 }]))).toThrow();
    expect(() => applyPlanMeasurements(emptyConfig(), { rooms: [] })).toThrow();
    expect(() => applyPlanMeasurements(emptyConfig(), plan(Array.from({ length: 11 }, () => ({ ...room, type: "living", floorM2: 100_000 }))), true)).toThrow();
  });
});
