import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => ({ db: (await import("drizzle-orm/pg-proxy")).drizzle(mocks.query, { casing: "snake_case" }) }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(), brandedEmail: (x: string) => x, escapeHtml: (x: string) => x }));
import { queueOverdueActionItems } from "../staff-notifications";

const id = "00000000-0000-4000-8000-000000000001";
const mourad = "00000000-0000-4000-8000-000000000002";
// 18 november 2026, 08:30 in Madrid (winter: UTC+1).
const achtUurMadrid = new Date("2026-11-18T07:30:00Z");
const punt = (over: Partial<Record<string, unknown>> = {}) => [{ id, dueDate: "2026-11-10", status: "open", assigneeId: mourad, role: "admin", email: "hans@habitat-one.com", ...over }].map(r => [r.id, r.dueDate, r.status, r.assigneeId, r.role, r.email]);

beforeEach(() => { vi.clearAllMocks(); mocks.query.mockResolvedValue({ rows: [] }); });

it("zet de herinnering één keer klaar, met de deadline en de week in de sleutel", async () => {
  mocks.query.mockResolvedValueOnce({ rows: punt() }).mockResolvedValueOnce({ rows: [["melding-1"]] });
  expect(await queueOverdueActionItems(achtUurMadrid)).toBe(1);
  const [selectSql, selectParams] = mocks.query.mock.calls[0];
  expect(selectSql).toContain('from "action_items"');
  expect(selectSql).toContain('"status" <> $');
  expect(selectParams).toContain("2026-11-18");
  const [insertSql, insertParams] = mocks.query.mock.calls[1];
  expect(insertSql).toContain('insert into "staff_notifications"');
  expect(insertSql).toContain("on conflict do nothing");
  // 8 dagen te laat: de tweede wekelijkse herinnering.
  expect(insertParams).toContain("actie:00000000-0000-4000-8000-000000000001:2026-11-10:w1");
  expect(insertParams).toContain("action_overdue");
  expect(insertParams).toContain(mourad);
});

it("draait alleen om acht uur 's ochtends in Madrid", async () => {
  expect(await queueOverdueActionItems(new Date("2026-11-18T10:30:00Z"))).toBe(0);
  expect(mocks.query).not.toHaveBeenCalled();
});

it("mailt niemand die niet op de ledenlijst van de actielijst staat", async () => {
  // Teresa en Mourad horen niet bij deze lijst, ook al kunnen ze wel mail krijgen.
  for (const email of ["teresa@habitat-one.com", "mourad.h@habitat-one.com"]) {
    vi.clearAllMocks();
    mocks.query.mockResolvedValueOnce({ rows: punt({ email }) });
    expect(await queueOverdueActionItems(achtUurMadrid)).toBe(0);
    expect(mocks.query).toHaveBeenCalledTimes(1);
  }
});

it("mailt niemand die geen systeemmeldingen ontvangt", async () => {
  mocks.query.mockResolvedValueOnce({ rows: punt({ email: "info@danieldalen.com", role: "admin" }) });
  expect(await queueOverdueActionItems(achtUurMadrid)).toBe(0);
  expect(mocks.query).toHaveBeenCalledTimes(1);
});

it("mailt niemand zonder toegang tot de actielijst", async () => {
  mocks.query.mockResolvedValueOnce({ rows: punt({ role: "viewer" }) });
  expect(await queueOverdueActionItems(achtUurMadrid)).toBe(0);
  expect(mocks.query).toHaveBeenCalledTimes(1);
});
