import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => ({ db: (await import("drizzle-orm/pg-proxy")).drizzle(mocks.query, { casing: "snake_case" }) }));
import { actielijstLinkUrl, actielijstLinkVoorToken, nieuwActielijstToken } from "../actielijst-link";
import { isLid, magModuleAls, magPadAls } from "../auth/modules";

const linkId = "00000000-0000-4000-8000-00000000000a";
const userId = "00000000-0000-4000-8000-00000000000b";
const token = "Zm9vYmFyLXRva2VuLTEyMzQ1Njc4OTAxMjM0NTY";
const rij = (over: { email?: string; role?: string } = {}) => [[linkId, token, userId, "Hans van Dalen", over.email ?? "hans@habitat-one.com", over.role ?? "admin"]];

beforeEach(() => { vi.clearAllMocks(); mocks.query.mockResolvedValue({ rows: [] }); });

it("laat een token van een lid door", async () => {
  mocks.query.mockResolvedValueOnce({ rows: rij() });
  const lid = await actielijstLinkVoorToken(token);
  expect(lid?.userId).toBe(userId);
  expect(mocks.query.mock.calls[0][1]).toContain(token);
});

it("weigert iemand die niet (meer) op de ledenlijst staat", async () => {
  for (const email of ["teresa@habitat-one.com", "mourad.h@habitat-one.com", "info@danieldalen.com"]) {
    mocks.query.mockResolvedValueOnce({ rows: rij({ email }) });
    expect(await actielijstLinkVoorToken(token)).toBeNull();
  }
});

it("weigert een alleen-lezen account, ook als het adres klopt", async () => {
  mocks.query.mockResolvedValueOnce({ rows: rij({ role: "viewer" }) });
  expect(await actielijstLinkVoorToken(token)).toBeNull();
});

it("kijkt niet eens in de database bij een onmogelijk token", async () => {
  for (const kapot of ["", "kort", "../../etc/passwd", "a".repeat(200), "met spatie erin maar lang genoeg"]) {
    expect(await actielijstLinkVoorToken(kapot)).toBeNull();
  }
  expect(mocks.query).not.toHaveBeenCalled();
});

it("maakt tokens die niet te raden en niet te verwarren zijn", () => {
  const tokens = Array.from({ length: 50 }, nieuwActielijstToken);
  expect(new Set(tokens).size).toBe(50);
  for (const t of tokens) expect(t).toMatch(/^[A-Za-z0-9_-]{40,}$/);
  expect(actielijstLinkUrl(tokens[0])).toMatch(/^https:\/\/[^/]+\/lijst\/[A-Za-z0-9_-]+$/);
});

it("houdt de ledenlijst buiten de rest van het CRM", () => {
  // De actielijst heeft een ledenlijst; andere modules werken ongewijzigd op rol.
  expect(isLid("actielijst", "hans@habitat-one.com")).toBe(true);
  expect(isLid("actielijst", "HANS@habitat-one.com")).toBe(true);
  expect(isLid("actielijst", "teresa@habitat-one.com")).toBe(false);
  expect(isLid("actielijst", null)).toBe(false);
  expect(isLid("agenda", "teresa@habitat-one.com")).toBe(true);
  expect(isLid("agenda", null)).toBe(true);

  // Beheerder zijn is niet genoeg voor de actielijst, en wel voor de rest.
  expect(magModuleAls("admin", "teresa@habitat-one.com", "actielijst")).toBe(false);
  expect(magPadAls("admin", "teresa@habitat-one.com", "/actielijst")).toBe(false);
  expect(magPadAls("admin", "teresa@habitat-one.com", "/agenda")).toBe(true);
  expect(magPadAls("admin", "hi@habitat-one.com", "/actielijst")).toBe(true);
  expect(magPadAls("sales", "mourad.h@habitat-one.com", "/actielijst")).toBe(false);
});
