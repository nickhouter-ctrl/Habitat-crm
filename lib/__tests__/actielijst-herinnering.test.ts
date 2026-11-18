import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => ({ db: (await import("drizzle-orm/pg-proxy")).drizzle(mocks.query, { casing: "snake_case" }) }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(), brandedEmail: (x: string) => x, escapeHtml: (x: string) => x }));
import { queueOverdueActionItems } from "../staff-notifications";

const id = "00000000-0000-4000-8000-000000000001";
const nick = "00000000-0000-4000-8000-00000000000n".replace("n", "1");
const hans = "00000000-0000-4000-8000-00000000000h".replace("h", "2");
const frederique = "00000000-0000-4000-8000-00000000000f".replace("f", "3");
const elles = "00000000-0000-4000-8000-00000000000e".replace("e", "4");
const teresa = "00000000-0000-4000-8000-00000000000t".replace("t", "5");

// 18 november 2026, 08:30 in Madrid (winter: UTC+1).
const achtUurMadrid = new Date("2026-11-18T07:30:00Z");

/** Zoals de wachtrij het punt uitleest: id, deadline, verantwoordelijke, team. */
const punten = (over: { assigneeId?: string | null; teamwide?: boolean; dueDate?: string } = {}) =>
  [[id, over.dueDate ?? "2026-11-10", over.assigneeId === undefined ? hans : over.assigneeId, over.teamwide ?? false]];

/** Het team zoals het in de database staat: id, rol, adres. */
const team = [
  [nick, "admin", "nick@habitat-one.com"],
  [hans, "admin", "hans@habitat-one.com"],
  [frederique, "admin", "frederique@habitat-one.com"],
  // Elles houdt de lijst bij maar krijgt geen systeemmail (zie lib/mail-bcc.ts).
  [elles, "admin", "hi@habitat-one.com"],
  // Teresa mag de lijst niet in.
  [teresa, "admin", "teresa@habitat-one.com"],
];

const sleutels = () => mocks.query.mock.calls.filter(c => String(c[0]).includes('insert into "staff_notifications"')).map(c => (c[1] as unknown[]).find(p => String(p).startsWith("actie:")) as string);

beforeEach(() => { vi.clearAllMocks(); mocks.query.mockResolvedValue({ rows: [["melding"]] }); });

it("zet de herinnering klaar voor de verantwoordelijke, met deadline en week in de sleutel", async () => {
  mocks.query.mockResolvedValueOnce({ rows: punten() }).mockResolvedValueOnce({ rows: team });
  expect(await queueOverdueActionItems(achtUurMadrid)).toBe(1);
  const [selectSql, selectParams] = mocks.query.mock.calls[0];
  expect(selectSql).toContain('from "action_items"');
  expect(selectParams).toContain("2026-11-18");
  // 8 dagen te laat: de tweede wekelijkse herinnering, op naam van Hans.
  expect(sleutels()).toEqual([`actie:${id}:2026-11-10:w1:${hans}`]);
  expect(mocks.query.mock.calls[2][0]).toContain("on conflict do nothing");
});

it("stuurt een punt van het hele team naar iedereen die de lijst bijhoudt", async () => {
  mocks.query.mockResolvedValueOnce({ rows: punten({ assigneeId: null, teamwide: true }) }).mockResolvedValueOnce({ rows: team });
  expect(await queueOverdueActionItems(achtUurMadrid)).toBe(3);
  // Iedereen een eigen sleutel, anders drukt de eerste de rest weg.
  expect(sleutels()).toEqual([nick, hans, frederique].map(u => `actie:${id}:2026-11-10:w1:${u}`));
  // Teresa hoort niet bij de lijst; Elles krijgt geen systeemmail.
  expect(sleutels().some(s => s.endsWith(teresa) || s.endsWith(elles))).toBe(false);
});

it("mailt niemand als de verantwoordelijke de lijst niet (meer) bijhoudt", async () => {
  mocks.query.mockResolvedValueOnce({ rows: punten({ assigneeId: teresa }) }).mockResolvedValueOnce({ rows: team });
  expect(await queueOverdueActionItems(achtUurMadrid)).toBe(0);
  expect(sleutels()).toEqual([]);
});

it("mailt niemand die geen systeemmeldingen ontvangt", async () => {
  mocks.query.mockResolvedValueOnce({ rows: punten({ assigneeId: elles }) }).mockResolvedValueOnce({ rows: team });
  expect(await queueOverdueActionItems(achtUurMadrid)).toBe(0);
});

it("mailt geen alleen-lezen account, dat kan niets afvinken", async () => {
  const alleenLezen = team.map(r => r[0] === hans ? [hans, "viewer", "hans@habitat-one.com"] : r);
  mocks.query.mockResolvedValueOnce({ rows: punten() }).mockResolvedValueOnce({ rows: alleenLezen });
  expect(await queueOverdueActionItems(achtUurMadrid)).toBe(0);
});

it("draait alleen om acht uur 's ochtends in Madrid", async () => {
  expect(await queueOverdueActionItems(new Date("2026-11-18T10:30:00Z"))).toBe(0);
  expect(mocks.query).not.toHaveBeenCalled();
});

it("kijkt niet naar het team als er niets te laat is", async () => {
  mocks.query.mockResolvedValueOnce({ rows: [] });
  expect(await queueOverdueActionItems(achtUurMadrid)).toBe(0);
  expect(mocks.query).toHaveBeenCalledTimes(1);
});
