import { describe, expect, it } from "vitest";
import { projectProgress } from "../project-progress";

describe("recorded project progress", () => {
  it("does not pretend an unplanned project has recorded progress", () => {
    expect(projectProgress([], [])).toMatchObject({ percent: null, total: 0, current: null });
  });
  it("weights phases by the budget and includes unstarted budget phases", () => {
    expect(projectProgress([{ name: "Structure", progressPct: 100 }], [
      { phase: "Structure", amountEur: "30000" }, { phase: "Finish", amountEur: "10000" },
    ])).toMatchObject({ percent: 75, completed: 1, total: 2, current: "Finish", weighted: true });
  });
  it("averages recorded phases if no amounts exist", () => {
    expect(projectProgress([{ name: "A", progressPct: 100 }, { name: "B", progressPct: 50 }], []))
      .toMatchObject({ percent: 75, current: "B", weighted: false });
  });
  it("clamps phase progress and ignores negative budget amounts", () => {
    expect(projectProgress([{ name: "A", progressPct: 150 }, { name: "B", progressPct: -20 }], [
      { phase: "A", amountEur: -10 }, { phase: "B", amountEur: 0 },
    ])).toMatchObject({ percent: 50, completed: 1 });
  });
});
