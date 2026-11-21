import { describe, expect, it } from "vitest";

import { FORMAT_SIZE, coverCrop, logoPlacement, logoVariantFor, prepareSocialImage } from "../image-prep";

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

describe("logoPlacement", () => {
  it("40% breed, bovenaan in het midden", () => {
    const p = logoPlacement(1080, 1350, 2022, 640);
    expect(p.width).toBe(432);
    expect(p.left).toBe(324);
    expect(p.top).toBe(41);
    expect(Math.abs(p.height / p.width - 640 / 2022)).toBeLessThan(0.01);
  });
  it("kiest de leesbare versie", () => {
    expect(logoVariantFor(220)).toBe("sub-dark");
    expect(logoVariantFor(60)).toBe("sub-cream");
  });
});

describe("prepareSocialImage", () => {
  async function pixel(buf: Buffer, left: number, top: number): Promise<number> {
    const sharp = (await import("sharp")).default;
    const { data } = await sharp(buf).extract({ left, top, width: 1, height: 1 }).greyscale().raw().toBuffer({ resolveWithObject: true });
    return data[0];
  }

  it("levert een JPEG op het juiste formaat, met het logo bovenaan in het midden", async () => {
    const sharp = (await import("sharp")).default;
    const src = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#e8e0d2" } }).jpeg().toBuffer();
    const out = await prepareSocialImage(src, "portrait");
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("jpeg");
    expect([meta.width, meta.height]).toEqual([FORMAT_SIZE.portrait.width, FORMAT_SIZE.portrait.height]);
    // Het zwarte logovlak staat bovenaan in het midden; onderin is het beeld onaangetast.
    expect(await pixel(out, 540, 41 + 40)).toBeLessThan(60);
    expect(await pixel(out, 540, 1300)).toBeGreaterThan(200);
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

describe("logoStyleFor", () => {
  it("zwarte onderregel alleen op een lichte, rustige achtergrond", async () => {
    const { logoStyleFor } = await import("../image-prep");
    expect(logoStyleFor(220, 10)).toEqual({ variant: "sub-dark", gradient: false });
    expect(logoStyleFor(200, 60)).toEqual({ variant: "sub-cream", gradient: true }); // druk: bladeren tegen de lucht
    expect(logoStyleFor(70, 10)).toEqual({ variant: "sub-cream", gradient: true });
  });
});
