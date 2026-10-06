import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ guard: vi.fn(), render: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ weigerRoute: mocks.guard }));
vi.mock("@/lib/client-funding-pdf", () => ({ renderClientFundingPdf: mocks.render }));
import { GET } from "@/app/(app)/projects/[id]/voorschotoverzicht/pdf/route";
const id = "7b06cf54-d07e-420e-aa6a-bb6e85628e0a";
const get = (projectId = id, query = "") => GET(new Request(`http://localhost/projects/${projectId}/voorschotoverzicht/pdf${query}`), { params: Promise.resolve({ id: projectId }) });
beforeEach(() => { vi.resetAllMocks(); mocks.guard.mockResolvedValue(null); });
describe("client statement download boundary", () => {
  it.each([401, 403])("denies %s before accessing project data", async status => {
    mocks.guard.mockResolvedValue(new Response("Denied", { status }));
    expect((await get()).status).toBe(status);
    expect(mocks.guard).toHaveBeenCalledWith("projects");
    expect(mocks.render).not.toHaveBeenCalled();
  });
  it("rejects malformed ids and unsupported languages before loading data", async () => {
    expect((await get("invalid")).status).toBe(404);
    expect((await get(id, "?lang=unknown")).status).toBe(400);
    expect(mocks.render).not.toHaveBeenCalled();
  });
  it("returns a private PDF attachment in the requested language", async () => {
    mocks.render.mockResolvedValue({ buffer: Buffer.from("%PDF-1.7"), filename: "statement.pdf" });
    const response = await get(id, "?lang=es");
    expect(response.status).toBe(200);
    expect(mocks.render).toHaveBeenCalledWith(id, "es");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="statement.pdf"');
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("content-type")).toBe("application/pdf");
  });
  it("returns 404 for missing projects", async () => {
    mocks.render.mockResolvedValue(null);
    expect((await get()).status).toBe(404);
  });
});
