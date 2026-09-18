import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({guard:vi.fn(),find:vi.fn(),url:vi.fn()}));
vi.mock("@/lib/auth/guards",()=>({weigerRoute:mocks.guard}));
vi.mock("@/lib/db",()=>({db:{query:{purchaseOrders:{findFirst:mocks.find}}}}));
vi.mock("@/lib/storage",()=>({purchaseOrderFileUrl:mocks.url}));
import { GET } from "@/app/api/inkooporders/[id]/bijlage/route";
const id="a588b9a5-88c2-4446-937f-681a32cc1a23";
const open=(path="invoice.pdf")=>GET(new Request(`http://localhost/api/inkooporders/${id}/bijlage?path=${encodeURIComponent(path)}`),{params:Promise.resolve({id})});
beforeEach(()=>{vi.clearAllMocks();mocks.guard.mockResolvedValue(null);mocks.find.mockResolvedValue({attachments:[{name:"Factuur",path:"invoice.pdf"}]});mocks.url.mockResolvedValue("https://storage.example/signed-invoice");});
describe("private purchase attachments",()=>{
  it("requires an authenticated staff session",async()=>{mocks.guard.mockResolvedValue(new Response("Niet ingelogd.",{status:401}));expect((await open()).status).toBe(401);expect(mocks.url).not.toHaveBeenCalled();});
  it("refuses staff without the inkoop module",async()=>{mocks.guard.mockResolvedValue(new Response("Geen toegang",{status:403}));expect((await open()).status).toBe(403);expect(mocks.url).not.toHaveBeenCalled();});
  it("does not sign files belonging to another order",async()=>{expect((await open("other-order.pdf")).status).toBe(404);expect(mocks.url).not.toHaveBeenCalled();});
  it("signs a linked file on demand and prevents caching",async()=>{const r=await open();expect(r.status).toBe(307);expect(r.headers.get("location")).toBe("https://storage.example/signed-invoice");expect(r.headers.get("cache-control")).toBe("private, no-store");});
  it("returns a retryable error when Storage is unavailable",async()=>{mocks.url.mockResolvedValue(null);expect((await open()).status).toBe(503);});
});
