import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../client", () => ({ adAccountPath: () => "act_1", meta: {} }));
import { hasChosenAd } from "../boost";

describe("hasChosenAd", () => {
  it("houdt een door Nick gekozen actieve advertentie vast", () => {
    expect(hasChosenAd([{ status: "ACTIVE", name: "Gekozen: verbouwing Finca Lisa (24-11)" }])).toBe(true);
  });
  it("negeert gepauzeerde gekozen advertenties en gewone posts", () => {
    expect(hasChosenAd([{ status: "PAUSED", name: "Gekozen: oud" }, { status: "ACTIVE", name: "Post 2026-11-25" }])).toBe(false);
  });
});
