import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ admin: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), sync: vi.fn(), find: vi.fn(), rateLimit: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireAdmin: m.admin }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: m.rateLimit }));
vi.mock("@/lib/db", () => ({ db: { query: { appleCalendarConnections: { findFirst: m.find } } } }));
vi.mock("@/lib/apple-calendar/sync", () => ({ connectApple: m.connect, disconnectApple: m.disconnect, syncAppleCalendar: m.sync }));
import { connectAppleAction, disconnectAppleAction, resolveAppleConflict, syncAppleAction } from "../../app/(app)/agenda/apple/actions";
import { GET } from "../../app/api/cron/apple-calendar/route";

beforeEach(() => { vi.resetAllMocks(); });
afterEach(() => vi.unstubAllEnvs());
describe("Apple calendar access boundaries", () => {
  it("requires admin access before all configuration, sync and conflict operations", async () => {
    m.admin.mockRejectedValue(new Error("denied"));
    await expect(connectAppleAction({}, new FormData())).rejects.toThrow("denied");
    await expect(disconnectAppleAction()).rejects.toThrow("denied");
    await expect(syncAppleAction()).rejects.toThrow("denied");
    await expect(resolveAppleConflict("invalid", "apple")).rejects.toThrow("denied");
    expect(m.connect).not.toHaveBeenCalled(); expect(m.disconnect).not.toHaveBeenCalled(); expect(m.sync).not.toHaveBeenCalled(); expect(m.rateLimit).not.toHaveBeenCalled();
  });
  it("requires explicit sharing consent and an app-specific password", async () => {
    m.admin.mockResolvedValue({ id: "admin" });
    const form = new FormData(); form.set("account", "admin@example.com"); form.set("password", "ordinary-password");
    expect((await connectAppleAction({}, form)).error).toBeTruthy();
    form.set("password", "aaaa-bbbb-cccc-dddd");
    expect((await connectAppleAction({}, form)).error).toBeTruthy();
    expect(m.connect).not.toHaveBeenCalled();
    form.set("consent", "on"); m.rateLimit.mockResolvedValue(true);
    expect((await connectAppleAction({}, form)).success).toBeTruthy();
    expect(m.connect).toHaveBeenCalledWith("admin", "admin@example.com", "aaaa-bbbb-cccc-dddd");
  });
  it("does not return provider errors or credentials to the browser", async () => {
    m.admin.mockResolvedValue({ id: "admin" }); m.rateLimit.mockResolvedValue(true);
    m.sync.mockRejectedValue(new Error("secret-provider-response"));
    expect(JSON.stringify(await syncAppleAction())).not.toContain("secret-provider-response");
  });
  it("denies cron requests with missing or incorrect credentials before any DB read", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(new Request("https://crm.example/api/cron/apple-calendar"))).status).toBe(503);
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    expect((await GET(new Request("https://crm.example/api/cron/apple-calendar"))).status).toBe(401);
    expect((await GET(new Request("https://crm.example/api/cron/apple-calendar", { headers: { authorization: "Bearer invalid" } }))).status).toBe(401);
    expect(m.find).not.toHaveBeenCalled(); expect(m.sync).not.toHaveBeenCalled();
  });
  it("skips inactive connections and runs only after cron authentication", async () => {
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    const request = new Request("https://crm.example/api/cron/apple-calendar", { headers: { authorization: "Bearer test-cron-secret" } });
    m.find.mockResolvedValue({ enabled: false });
    expect(await (await GET(request)).json()).toEqual({ skipped: true }); expect(m.sync).not.toHaveBeenCalled();
    m.find.mockResolvedValue({ enabled: true }); m.sync.mockResolvedValue({ imported: 1 });
    expect(await (await GET(request)).json()).toEqual({ imported: 1 }); expect(m.sync).toHaveBeenCalledTimes(1);
  });
});
