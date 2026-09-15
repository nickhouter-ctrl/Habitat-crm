import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ auth: vi.fn(), update: vi.fn(), set: vi.fn(), where: vi.fn(), returning: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireWriteUser: m.auth }));
vi.mock("next/cache", () => ({ revalidatePath: m.refresh }));
vi.mock("@/lib/db", () => ({ db: { update: m.update } }));
import { markMailRead } from "../../app/(app)/inbox/read-actions";
const id = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  vi.clearAllMocks(); m.auth.mockResolvedValue({ id: "staff" });
  m.update.mockReturnValue({ set: m.set }); m.set.mockReturnValue({ where: m.where });
  m.where.mockReturnValue({ returning: m.returning }); m.returning.mockResolvedValue([{ id }]);
});
describe("CRM mail read status", () => {
  it("only changes read status and refreshes navigation", async () => {
    await markMailRead(id);
    expect(m.set).toHaveBeenCalledWith({ readAt: expect.any(Date) });
    expect(m.refresh).toHaveBeenCalledWith("/", "layout");
  });
  it("does not refresh repeatedly for an already-read message", async () => {
    m.returning.mockResolvedValue([]); await markMailRead(id);
    expect(m.refresh).not.toHaveBeenCalled();
  });
  it("rejects unauthorised writes before accessing the database", async () => {
    m.auth.mockRejectedValue(new Error("denied"));
    await expect(markMailRead(id)).rejects.toThrow("denied"); expect(m.update).not.toHaveBeenCalled();
  });
  it("validates the message ID before writing", async () => {
    await expect(markMailRead("invalid")).rejects.toThrow(); expect(m.update).not.toHaveBeenCalled();
  });
});
