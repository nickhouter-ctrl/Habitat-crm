import { describe, expect, it } from "vitest";

import { FORMAT_SIZE, SCRIM_MAX_OPACITY, coverCrop, lockupPlacement, prepareSocialImage, scrimGeometry, scrimSvg } from "../image-prep";

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
  it("~48% breed, 5% marge, linksonder", () => {
    const p = lockupPlacement(1080, 1350, 1422, 246);
    expect(p.width).toBe(518);
    expect(p.left).toBe(54);
    expect(p.top + p.height).toBe(1350 - 54);
    expect(Math.abs(p.height / p.width - 246 / 1422)).toBeLessThan(0.01);
  });
});

describe("scrim", () => {
  it("~75% breed × 30% hoog, max 45% dekking, verlopend naar transparant", () => {
    expect(scrimGeometry(1080, 1350)).toEqual({ rx: 810, ry: 405 });
    const { svg } = scrimSvg(1080, 1350);
    expect(svg).toContain(`fill-opacity="${SCRIM_MAX_OPACITY}"`);
    expect(svg).toContain('rx="810" ry="405"');
    expect(svg).toContain("feGaussianBlur");
    expect(svg).not.toContain("<text");
  });
});

describe("prepareSocialImage", () => {
  async function pixel(buf: Buffer, left: number, top: number): Promise<number> {
    const sharp = (await import("sharp")).default;
    const { data } = await sharp(buf).extract({ left, top, width: 1, height: 1 }).greyscale().raw().toBuffer({ resolveWithObject: true });
    return data[0];
  }

  it("levert een JPEG op het juiste formaat, met merk en donkere hoek", async () => {
    const sharp = (await import("sharp")).default;
    // Lichte steen: het lastigste geval voor een wit merk.
    const src = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#e8e0d2" } }).jpeg().toBuffer();
    const out = await prepareSocialImage(src, "portrait");
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("jpeg");
    expect([meta.width, meta.height]).toEqual([FORMAT_SIZE.portrait.width, FORMAT_SIZE.portrait.height]);
    // Linksonder (naast het merk) donkerder dan rechtsboven; rechtsboven onaangetast.
    const corner = await pixel(out, 10, 1340);
    const far = await pixel(out, 1070, 10);
    expect(far - corner).toBeGreaterThan(40);
    // Het witte merk zelf is er nog.
    const { data } = await sharp(out).extract({ left: 54, top: 1350 - 54 - 90, width: 518, height: 90 }).greyscale().raw().toBuffer({ resolveWithObject: true });
    expect(Math.max(...data)).toBeGreaterThan(230);
  });
});

describe("parseFfmpegInfo", () => {
  it("leest formaat en duur", async () => {
    const { parseFfmpegInfo } = await import("../image-prep");
    const err = "  Duration: 00:00:10.04, start: 0.000000, bitrate: 2000 kb/s\n    Stream #0:0(und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 720x1280 [SAR 1:1 DAR 9:16], 24 fps";
    expect(parseFfmpegInfo(err)).toEqual({ width: 720, height: 1280, seconds: 10.04 });
    expect(parseFfmpegInfo("garbage")).toBeNull();
  });
});
