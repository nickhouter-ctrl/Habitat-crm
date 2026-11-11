import { describe, expect, it } from "vitest";
import { teamTaskGroups } from "../apple-calendar/tasks";

const at = new Date("2026-11-04T12:12:15.770Z");
const copy = (id: string, assigneeId: string, extra: Partial<{ completedAt: Date | null; createdAt: Date; subject: string }> = {}) => ({
  id, createdAt: at, authorId: "nick", subject: "send stock to Matías y Blanca S.L.", contactId: "matias", completedAt: null, assigneeId, ...extra,
});

describe("teamtaken in de gedeelde Apple-agenda", () => {
  it("vijf kopieën van één teambericht → één zichtbaar, met alle vijf de namen", () => {
    const rows = [copy("e", "teresa"), copy("b", "daan"), copy("d", "hans"), copy("a", "elles"), copy("c", "frederique")];
    const g = teamTaskGroups(rows, new Set(rows.map((r) => r.id)));
    expect([...g.hidden].sort()).toEqual(["b", "c", "d", "e"]);
    expect(g.assignees.get("a")).toEqual(["teresa", "daan", "hans", "elles", "frederique"]);
  });

  it("losse taken met toevallig hetzelfde onderwerp en tijdstip blijven apart (geen teambericht)", () => {
    const rows = [copy("a", "elles"), copy("b", "daan")];
    expect(teamTaskGroups(rows, new Set()).hidden.size).toBe(0);
  });

  it("andere aanmaaktijd = andere taak", () => {
    const rows = [copy("a", "elles"), copy("b", "daan", { createdAt: new Date(+at + 1000) })];
    expect(teamTaskGroups(rows, new Set(["a", "b"])).hidden.size).toBe(0);
  });

  it("is de zichtbare kopie afgevinkt en een andere niet, dan blijft de open kopie zichtbaar", () => {
    const rows = [copy("a", "elles", { completedAt: new Date() }), copy("b", "daan")];
    const g = teamTaskGroups(rows, new Set(["a", "b"]));
    expect([...g.hidden]).toEqual(["a"]);
  });
});
