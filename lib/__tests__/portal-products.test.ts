import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ auth: vi.fn(), rows: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { select: () => ({ from: () => ({ leftJoin: () => ({ where: m.rows }) }) }) } }));
vi.mock("@/lib/portal/api", async (original) => ({ ...await original<typeof import("@/lib/portal/api")>(), portalAuth: m.auth }));
import { GET } from "@/app/api/portal/products/route";
const product = { name: "Stone", sku: "STONE", collection: "Flexible Stone", priceEur: "100", tradePriceEur: "80", vatRate: 21, additionalSizes: [{ sku: "LARGE", priceEur: 200 }], brandId: null, brandTradePct: null };
beforeEach(() => { vi.clearAllMocks(); m.auth.mockResolvedValue({ tier: "aannemer" }); m.rows.mockResolvedValue([product]); });
const request = () => new Request("https://crm.habitat-one.com/api/portal/products");
describe("portal price comparison", () => {
  it("rejects unauthenticated requests before loading prices", async () => {
    m.auth.mockResolvedValue(null);
    expect((await GET(request())).status).toBe(401);
    expect(m.rows).not.toHaveBeenCalled();
  });
  it("pairs each business price with the same product's retail price", async () => {
    const data = await (await GET(request())).json();
    expect(data.prices.STONE).toEqual({ price: 80, retailPrice: 100, vat: 21 });
    expect(data.prices.LARGE).toEqual({ price: 160, retailPrice: 200, vat: 21 });
    expect(data.byName.stone).toEqual(data.prices.STONE);
    expect(JSON.stringify(data)).not.toContain("dealerPrice");
  });
  it("keeps retail pricing for private customers", async () => {
    m.auth.mockResolvedValue({ tier: "particulier" });
    const data = await (await GET(request())).json();
    expect(data.prices.STONE.price).toBe(100);
    expect(data.prices.LARGE.price).toBe(200);
  });
  it("does not invent a discount for furniture or brands without an agreement", async () => {
    m.rows.mockResolvedValue([{ ...product, collection: "Caracole" }, { ...product, name: "Tap", sku: "TAP", brandId: "brand", tradePriceEur: null, additionalSizes: [{ sku: "TAP-L", priceEur: 150 }] }]);
    const data = await (await GET(request())).json();
    expect(data.prices.STONE.price).toBe(100);
    expect(data.prices.LARGE.price).toBe(200);
    expect(data.prices['TAP-L'].price).toBe(150);
  });
});
