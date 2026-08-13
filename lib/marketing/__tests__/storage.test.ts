/**
 * Unit tests for the marketing storage abstraction (lib/marketing/storage.ts).
 * Alleen de in-memory implementatie wordt hier getest; de Supabase-implementatie
 * deelt dezelfde interface en padvalidatie.
 */
import { describe, expect, it } from "vitest";

import { MemoryMarketingStorage, sanitizeStoragePath } from "../storage";

describe("sanitizeStoragePath", () => {
  it("laat een normaal pad ongemoeid", () => {
    expect(sanitizeStoragePath("upload/abc123.png")).toBe("upload/abc123.png");
  });

  it("strip leidende slashes", () => {
    expect(sanitizeStoragePath("/upload/abc.png")).toBe("upload/abc.png");
  });

  it("weigert path traversal", () => {
    expect(() => sanitizeStoragePath("../etc/passwd")).toThrow();
    expect(() => sanitizeStoragePath("upload/../../x.png")).toThrow();
  });

  it("weigert lege paden", () => {
    expect(() => sanitizeStoragePath("")).toThrow();
    expect(() => sanitizeStoragePath("///")).toThrow();
  });

  it("vervangt rare tekens per padsegment", () => {
    expect(sanitizeStoragePath("upload/foo bar?.png")).toBe("upload/foo_bar_.png");
  });
});

describe("MemoryMarketingStorage", () => {
  it("slaat bytes op als kopie (mutatie van de bron verandert niets)", async () => {
    const storage = new MemoryMarketingStorage();
    const bytes = new Uint8Array([1, 2, 3]);
    await storage.put("upload/a.png", bytes, "image/png");
    bytes[0] = 99;
    const stored = storage.get("upload/a.png");
    expect(stored?.bytes[0]).toBe(1);
    expect(stored?.contentType).toBe("image/png");
  });

  it("meldt bestaan van objecten", async () => {
    const storage = new MemoryMarketingStorage();
    expect(await storage.exists("upload/a.png")).toBe(false);
    await storage.put("upload/a.png", new Uint8Array([1]), "image/png");
    expect(await storage.exists("upload/a.png")).toBe(true);
  });

  it("is idempotent voor hetzelfde pad (content-addressed paden)", async () => {
    const storage = new MemoryMarketingStorage();
    const p1 = await storage.put("upload/a.png", new Uint8Array([1]), "image/png");
    const p2 = await storage.put("upload/a.png", new Uint8Array([2]), "image/png");
    expect(p1).toBe(p2);
    // eerste schrijf wint — zelfde pad betekent zelfde inhoud (sha256-pad)
    expect(storage.get("upload/a.png")?.bytes[0]).toBe(1);
    expect(storage.size).toBe(1);
  });

  it("geeft een deterministische publieke URL", () => {
    const storage = new MemoryMarketingStorage();
    expect(storage.publicUrl("upload/a.png")).toBe("memory://marketing-assets/upload/a.png");
  });
});
