import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { beursBijlagen } from "@/lib/beurs-bijlagen";

it("levert beide echte PDF-bestanden als mailbijlage", async () => {
  const bijlagen = await beursBijlagen();
  expect(bijlagen.map(b => b.filename)).toEqual([
    "flexible-stone-technical-data-sheet.pdf",
    "flexible-stone-technical-data-sheet-es.pdf",
  ]);
  for (const b of bijlagen) {
    expect(b.contentType).toBe("application/pdf");
    expect(Buffer.from(b.content).subarray(0, 5).toString()).toBe("%PDF-");
    expect(b.content.length).toBeGreaterThan(1000);
  }
});
