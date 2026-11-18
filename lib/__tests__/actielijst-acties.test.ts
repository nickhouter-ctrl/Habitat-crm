import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), auth: vi.fn(), invalidate: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => ({ db: (await import("drizzle-orm/pg-proxy")).drizzle(mocks.query, { casing: "snake_case" }) }));
vi.mock("@/lib/auth/guards", () => ({ requireModuleRead: mocks.auth, requireModule: mocks.auth }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.invalidate }));
import { bewaarActiepunt, plaatsOpmerking, zetActieArchief, zetActieKlaar } from "../../app/(app)/actielijst/actions";

const id = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const collega = "00000000-0000-4000-8000-000000000003";
const velden = (over: Record<string, string> = {}) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ id, nieuw: "1", groupName: "Showroom", subgroup: "Stalen", title: "Stalenkast opruimen", description: "", assigneeId: "", helpers: "", dueDate: "", status: "open", ...over })) fd.set(k, v);
  return fd;
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ id: userId });
  mocks.query.mockResolvedValue({ rows: [[id]] });
});

it("bewaart een nieuw punt met het formulier-id, zodat twee keer versturen één punt geeft", async () => {
  const result = await bewaarActiepunt({}, velden());
  expect(result.itemId).toBe(id);
  const [sql, params] = mocks.query.mock.calls[0];
  expect(sql).toContain('insert into "action_items"');
  expect(sql).toContain("on conflict do nothing");
  expect(params).toContain(id);
  expect(params).toContain("Showroom");
  expect(mocks.invalidate).toHaveBeenCalledWith("/actielijst");
});

it("weigert een verantwoordelijke die de actielijst niet mag bijwerken", async () => {
  mocks.query.mockResolvedValueOnce({ rows: [["viewer", "hans@habitat-one.com"]] });
  const result = await bewaarActiepunt({}, velden({ assigneeId: collega }));
  expect(result.error).toContain("Kies een andere verantwoordelijke");
  expect(mocks.query).toHaveBeenCalledTimes(1);
  expect(mocks.invalidate).not.toHaveBeenCalled();
});

it("accepteert een verantwoordelijke die op de ledenlijst staat", async () => {
  mocks.query.mockResolvedValueOnce({ rows: [["admin", "hans@habitat-one.com"]] });
  const result = await bewaarActiepunt({}, velden({ assigneeId: collega, dueDate: "2026-12-01" }));
  expect(result.error).toBeUndefined();
  expect(mocks.query.mock.calls[1][1]).toContain(collega);
  expect(mocks.query.mock.calls[1][1]).toContain("2026-12-01");
});

it("weigert een beheerder die niet op de ledenlijst van de actielijst staat", async () => {
  // Teresa is beheerder, maar de actielijst is niet van haar.
  mocks.query.mockResolvedValueOnce({ rows: [["admin", "teresa@habitat-one.com"]] });
  const result = await bewaarActiepunt({}, velden({ assigneeId: collega }));
  expect(result.error).toContain("Kies een andere verantwoordelijke");
  expect(mocks.query).toHaveBeenCalledTimes(1);
});

it("wijst een onmogelijke deadline af voordat er iets wordt opgeslagen", async () => {
  expect((await bewaarActiepunt({}, velden({ dueDate: "2026-02-31" }))).error).toBe("Kies een geldige deadline.");
  expect(mocks.query).not.toHaveBeenCalled();
});

it("legt bij afvinken vast wie het deed, en wist dat bij terugzetten", async () => {
  expect(await zetActieKlaar({ id, klaar: true })).toEqual({});
  const [klaarSql, klaarParams] = mocks.query.mock.calls[0];
  expect(klaarSql).toContain('"status" = $1');
  expect(klaarParams[0]).toBe("done");
  expect(klaarParams).toContain(userId);

  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ id: userId });
  mocks.query.mockResolvedValue({ rows: [[id]] });
  expect(await zetActieKlaar({ id, klaar: false })).toEqual({});
  const [terugSql, terugParams] = mocks.query.mock.calls[0];
  expect(terugParams[0]).toBe("open");
  expect(terugSql).toContain('"done_by_id" = $3');
  expect(terugParams[2]).toBeNull();
});

it("meldt niets gevonden in plaats van stil succes", async () => {
  mocks.query.mockResolvedValueOnce({ rows: [] });
  expect((await zetActieKlaar({ id, klaar: true })).error).toBeTruthy();
  expect(mocks.invalidate).not.toHaveBeenCalled();
});

it("haalt bij archiveren de nog niet verzonden herinnering weg", async () => {
  expect(await zetActieArchief({ id, archief: true })).toEqual({});
  const sqls = mocks.query.mock.calls.map(c => c[0] as string);
  expect(sqls[0]).toContain('"archived_at" = $1');
  expect(sqls[1]).toContain('delete from "staff_notifications"');
  expect(mocks.query.mock.calls[1][1]).toEqual([id, "action_overdue", "pending"]);
});

it("laat de herinnering staan als het punt terugkomt in de lijst", async () => {
  expect(await zetActieArchief({ id, archief: false })).toEqual({});
  expect(mocks.query.mock.calls[0][1][0]).toBeNull();
  expect(mocks.query.mock.calls.map(c => c[0] as string).some(s => s.includes('delete from "staff_notifications"'))).toBe(false);
});

/* ------------------------------------------- het punt in de teamagenda */

// De rij zoals stemTaakAf hem uitleest: id, titel, toelichting, groep,
// subgroep, deadline, status, verantwoordelijke, aangemaakt door, gearchiveerd,
// taak-id.
const puntRij = (over: Partial<{ dueDate: string | null; status: string; taskId: string | null; archivedAt: Date | null }> = {}) => {
  const r = { id, title: "Stalenkast opruimen", description: null, groupName: "Showroom", subgroup: "Stalen", dueDate: "2026-12-01", status: "open", assigneeId: collega, createdById: userId, archivedAt: null, taskId: taak, ...over };
  return [[r.id, r.title, r.description, r.groupName, r.subgroup, r.dueDate, r.status, r.assigneeId, r.createdById, r.archivedAt, r.taskId]];
};
const taak = "00000000-0000-4000-8000-000000000009";

it("zet de agendataak op afgerond bij afvinken", async () => {
  mocks.query.mockResolvedValueOnce({ rows: [[id]] }).mockResolvedValueOnce({ rows: puntRij({ status: "done" }) }).mockResolvedValueOnce({ rows: [[taak]] });
  expect(await zetActieKlaar({ id, klaar: true })).toEqual({});
  const [agendaSql, agendaParams] = mocks.query.mock.calls[2];
  expect(agendaSql).toContain('update "activities"');
  expect(agendaSql).toContain('"completed_at"');
  expect(agendaParams).toContain("Stalenkast opruimen");
  // Deadline om 17:00 in Madrid, dus 16:00 UTC in de winter.
  expect(agendaParams.some((p: unknown) => String(p).startsWith("2026-12-01T16:00:00"))).toBe(true);
  // De agenda krijgt de groep en een link terug naar het punt.
  expect(agendaParams.some((p: unknown) => String(p).includes("Showroom · Stalen") && String(p).includes(`/actielijst?taak=${id}`))).toBe(true);
});

it("maakt een agendataak aan voor een punt dat er nog geen heeft", async () => {
  mocks.query.mockResolvedValueOnce({ rows: [[id]] }).mockResolvedValueOnce({ rows: puntRij({ taskId: null }) }).mockResolvedValueOnce({ rows: [[taak]] }).mockResolvedValueOnce({ rows: [[id]] });
  expect(await zetActieKlaar({ id, klaar: false })).toEqual({});
  const sqls = mocks.query.mock.calls.map(c => c[0] as string);
  expect(sqls[2]).toContain('insert into "activities"');
  expect(sqls[3]).toContain('"task_id" = $1');
  expect(mocks.query.mock.calls[3][1][0]).toBe(taak);
});

it("haalt de agendataak weg als de deadline eraf gaat", async () => {
  mocks.query.mockResolvedValueOnce({ rows: [[id]] }).mockResolvedValueOnce({ rows: puntRij({ dueDate: null }) }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [[id]] });
  expect(await zetActieKlaar({ id, klaar: false })).toEqual({});
  const sqls = mocks.query.mock.calls.map(c => c[0] as string);
  expect(sqls[2]).toContain('delete from "activities"');
  expect(sqls[3]).toContain('"task_id" = $1');
  expect(mocks.query.mock.calls[3][1][0]).toBeNull();
});

it("plaatst een opmerking alleen bij een bestaand punt", async () => {
  const fd = new FormData(); fd.set("itemId", id); fd.set("body", "Teresa heeft de kast al half gedaan.");
  mocks.query.mockResolvedValueOnce({ rows: [] });
  expect((await plaatsOpmerking({}, fd)).error).toBe("Actiepunt niet gevonden.");
  expect(mocks.query).toHaveBeenCalledTimes(1);
});

it("faalt dicht als de module geweigerd wordt", async () => {
  mocks.auth.mockRejectedValueOnce(new Error("Geen toegang"));
  await expect(zetActieKlaar({ id, klaar: true })).rejects.toThrow("Geen toegang");
  expect(mocks.query).not.toHaveBeenCalled();
});

it("wijst rommel af voordat er SQL draait", async () => {
  for (const input of [{ id: "bad", klaar: true }, { id, klaar: "ja" }, { id }]) expect((await zetActieKlaar(input)).error).toBeTruthy();
  expect(mocks.query).not.toHaveBeenCalled();
});
