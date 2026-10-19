import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ denied: vi.fn(), rate: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ weigerRoute: mocks.denied }));
vi.mock("@/lib/rate-limit", () => ({ clientIp: () => "127.0.0.1", rateLimit: mocks.rate }));
vi.mock("@/lib/ai-plan-extract", () => ({ readPlan: mocks.read }));
import { POST } from "@/app/api/calculator/read-plan/route";

function request(file: File | null = new File(["%PDF-1.7 test"], "drawing.pdf", { type: "application/pdf" }), reference: string | File = "") {
  const body = new FormData();
  if (file) body.set("file", file);
  body.set("reference", reference);
  return new Request("http://localhost/api/calculator/read-plan", { method: "POST", body });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.denied.mockResolvedValue(null);
  mocks.rate.mockResolvedValue(true);
  mocks.read.mockResolvedValue({ unit: "unknown", scale: null, rooms: [], notes: [] });
});

describe("drawing upload boundary", () => {
  it("checks access before reading uploads or calling AI", async () => {
    mocks.denied.mockResolvedValue(new Response("Denied", { status: 403 }));
    expect((await POST(request())).status).toBe(403);
    expect(mocks.denied).toHaveBeenCalledWith("calculator");
    expect(mocks.rate).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("fails closed when the rate limit denies the request", async () => {
    mocks.rate.mockResolvedValue(false);
    expect((await POST(request())).status).toBe(429);
    expect(mocks.rate).toHaveBeenCalledWith("calculator-plan:127.0.0.1", 10, 3600, { strikt: true });
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("rejects missing, empty and oversized files", async () => {
    expect((await POST(request(null))).status).toBe(400);
    expect((await POST(request(new File([], "a.pdf", { type: "application/pdf" })))).status).toBe(400);
    expect((await POST(request(new File([new Uint8Array(3_800_001)], "a.pdf", { type: "application/pdf" })))).status).toBe(413);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("rejects misleading extensions, MIME types and file signatures", async () => {
    for (const file of [
      new File(["%PDF-1.7"], "a.html", { type: "application/pdf" }),
      new File(["%PDF-1.7"], "a.pdf", { type: "image/png" }),
      new File(["<html>hello</html>"], "a.pdf", { type: "application/pdf" }),
      new File(["not a PNG"], "a.png", { type: "image/png" }),
    ]) expect((await POST(request(file))).status).toBe(415);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("rejects oversized and non-text references", async () => {
    expect((await POST(request(undefined, "x".repeat(241)))).status).toBe(400);
    expect((await POST(request(undefined, new File(["x"], "reference.txt")))).status).toBe(400);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("returns proposals without caching or writing documents", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ unit: "unknown", scale: null, rooms: [], notes: [] });
    expect(mocks.read).toHaveBeenCalledOnce();
  });
  it("does not expose provider error details", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mocks.read.mockRejectedValue(new Error("provider-private-detail"));
      const response = await POST(request());
      expect(response.status).toBe(502);
      expect(await response.text()).not.toContain("provider-private-detail");
    } finally { log.mockRestore(); }
  });
});
