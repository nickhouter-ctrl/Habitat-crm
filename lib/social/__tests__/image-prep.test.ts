import { describe, expect, it } from "vitest";

import { FORMAT_SIZE, coverCrop, lockupPlacement, prepareSocialImage } from "../image-prep";

describe("coverCrop", () => {
  it("snijdt een liggend beeld bij tot 4:5 rond het midden", () => {
    const box = coverCrop(4000, 3000, 1080, 1350);
    expect(box).toEqual({ left: 800, top: 0, width: 2400, height: 3000 });
  });

  it("snijdt een hoog beeld bij tot vierkant", () => {
    const box = coverCrop(1000, 3000, 1080, 1080);
    expect(box).toEqual({ left: 0, top: 1000, width: 1000, height: 1000 });
  });

  it("blijft binnen de randen bij een focus aan de rand", () => {
    const box = coverCrop(4000, 3000, 1080, 1350, { x: 1, y: 0 });
    expect(box.left + box.width).toBeLessThanOrEqual(4000);
    expect(box.left).toBe(1600);
    expect(box.top).toBe(0);
  });

  it("houdt de doelverhouding aan", () => {
    for (const [w, h] of [[1234, 987], [800, 2000], [1080, 1350]]) {
      const box = coverCrop(w, h, 1080, 1350);
      expect(Math.abs(box.width / box.height - 0.8)).toBeLessThan(0.01);
      expect(box.width).toBeLessThanOrEqual(w);
      expect(box.height).toBeLessThanOrEqual(h);
    }
  });

  it("weigert onzin-afmetingen", () => {
    expect(() => coverCrop(0, 10, 1080, 1080)).toThrow();
  });
});

describe("lockupPlacement", () => {
  it("~38% breed, 5% marge, linksonder", () => {
    const p = lockupPlacement(1080, 1350, 1422, 246);
    expect(p.width).toBe(410);
    expect(p.left).toBe(54);
    expect(p.top + p.height).toBe(1350 - 54);
    expect(Math.abs(p.height / p.width - 246 / 1422)).toBeLessThan(0.01);
  });
});

describe("prepareSocialImage", () => {
  it("levert een JPEG op het juiste formaat, met merk", async () => {
    const sharp = (await import("sharp")).default;
    const src = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#c8b89a" } }).jpeg().toBuffer();
    const out = await prepareSocialImage(src, "portrait");
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("jpeg");
    expect([meta.width, meta.height]).toEqual([FORMAT_SIZE.portrait.width, FORMAT_SIZE.portrait.height]);
    // Linksonder is lichter dan de achtergrond (wit woordmerk).
    const { data, info } = await sharp(out).extract({ left: 54, top: 1350 - 54 - 72, width: 410, height: 72 }).greyscale().raw().toBuffer({ resolveWithObject: true });
    const max = Math.max(...data);
    expect(info.width).toBe(410);
    expect(max).toBeGreaterThan(230);
  });
});
