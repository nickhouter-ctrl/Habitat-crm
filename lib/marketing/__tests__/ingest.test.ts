/**
 * Unit tests for the marketing asset-ingest pipeline (lib/marketing/ingest.ts).
 *
 * The pipeline is dependency-injected: these tests use the in-memory storage
 * and a fake repo/decoder, so they run without Supabase, Postgres or sharp.
 * A separate suite at the bottom exercises the real sharp decoder when the
 * dependency is installed (skipped otherwise).
 */
import { describe, expect, it } from "vitest";

import {
  MemoryMarketingStorage,
} from "../storage";
import {
  computePhashFromPixels,
  dominantColorsFromPixels,
  findNearestPhash,
  hammingDistance,
  ingestAsset,
  readImageDimensions,
  sha256Hex,
  type AssetIngestRepo,
  type DecodedImage,
  type IngestInput,
  type NewAssetRecord,
} from "../ingest";

/* ------------------------------------------------------------- test helpers */

/** Solid/gradient RGBA generators — deterministic, geen Math.random. */
function makeImage(
  width: number,
  height: number,
  pixel: (x: number, y: number) => [number, number, number, number],
): DecodedImage {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixel(x, y);
      const i = (y * width + x) * 4;
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = a;
    }
  }
  return { width, height, rgba };
}

const gradient = (w = 64, h = 64, shift = 0) =>
  makeImage(w, h, (x, y) => {
    const v = Math.min(255, Math.round(((x + y) / (w + h - 2)) * 255) + shift);
    return [v, v, v, 255];
  });

/**
 * "Foto-achtig" testbeeld met echte 2D-structuur (incl. een productterm zodat
 * ook de binnenste DCT-coëfficiënten energie hebben), in genormaliseerde
 * coördinaten zodat het patroon resolutie-onafhankelijk is. Een puur lineair
 * of separabel patroon is voor een DCT-pHash gedegenereerd (veel
 * AC-coëfficiënten ~0 → instabiele bits). Waarden blijven ruim binnen 0–255
 * zodat een helderheidsverschuiving niet clipt.
 */
const photoLike = (w = 64, h = 64, shift = 0) =>
  makeImage(w, h, (x, y) => {
    const fx = x / w;
    const fy = y / h;
    const v =
      Math.round(
        128 +
          40 * Math.sin(2 * Math.PI * 2.3 * fx) +
          30 * Math.cos(2 * Math.PI * 1.7 * fy) +
          35 * Math.sin(2 * Math.PI * 1.3 * fx) * Math.cos(2 * Math.PI * 2.1 * fy),
      ) + shift;
    return [v, v, v, 255];
  });

const checkerboard = (w = 64, h = 64) =>
  makeImage(w, h, (x, y) => ((x >> 3) + (y >> 3)) % 2 === 0
    ? [255, 255, 255, 255]
    : [0, 0, 0, 255]);

/** Fake decoder: leest een JSON-"beeld" terug dat encodeImage() maakte. */
function encodeImage(img: DecodedImage): Uint8Array {
  const json = JSON.stringify({
    width: img.width,
    height: img.height,
    rgba: Array.from(img.rgba),
  });
  return new TextEncoder().encode(json);
}

async function fakeDecode(bytes: Uint8Array): Promise<DecodedImage> {
  const parsed = JSON.parse(new TextDecoder().decode(bytes)) as {
    width: number;
    height: number;
    rgba: number[];
  };
  return {
    width: parsed.width,
    height: parsed.height,
    rgba: new Uint8ClampedArray(parsed.rgba),
  };
}

/** In-memory AssetIngestRepo die insert/merge-aanroepen vastlegt. */
function makeFakeRepo() {
  const rows: Array<{ id: string; phash: string; record: NewAssetRecord }> = [];
  const merges: Array<{ assetId: string; input: IngestInput }> = [];
  let seq = 0;
  const repo: AssetIngestRepo = {
    async listPhashes() {
      return rows.map((r) => ({ id: r.id, phash: r.phash }));
    },
    async insertAsset(record) {
      const id = `asset-${++seq}`;
      rows.push({ id, phash: record.phash, record });
      return { id };
    },
    async mergeSource(assetId, input) {
      merges.push({ assetId, input });
    },
  };
  return { repo, rows, merges };
}

function uploadInput(img: DecodedImage, overrides: Partial<IngestInput> = {}): IngestInput {
  return {
    bytes: encodeImage(img),
    contentType: "image/png",
    source: "upload",
    sourceRef: "test.png",
    ...overrides,
  };
}

/* ---------------------------------------------------------- hammingDistance */

describe("hammingDistance", () => {
  it("is 0 voor identieke hashes", () => {
    expect(hammingDistance("0123456789abcdef", "0123456789abcdef")).toBe(0);
  });

  it("is 64 voor volledig tegengestelde hashes", () => {
    expect(hammingDistance("0000000000000000", "ffffffffffffffff")).toBe(64);
  });

  it("telt losse bits", () => {
    expect(hammingDistance("8000000000000000", "0000000000000000")).toBe(1);
    expect(hammingDistance("8000000000000001", "0000000000000000")).toBe(2);
  });

  it("weigert hashes van ongelijke lengte", () => {
    expect(() => hammingDistance("00", "0000")).toThrow();
  });
});

/* ------------------------------------------------------------ perceptual hash */

describe("computePhashFromPixels", () => {
  it("geeft een 64-bits hash als 16 hex-tekens", () => {
    const hash = computePhashFromPixels(gradient());
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is deterministisch voor hetzelfde beeld", () => {
    expect(computePhashFromPixels(gradient())).toBe(computePhashFromPixels(gradient()));
  });

  it("is (vrijwel) ongevoelig voor een helderheidsverschuiving", () => {
    const a = computePhashFromPixels(photoLike(64, 64, 0));
    const b = computePhashFromPixels(photoLike(64, 64, 10));
    expect(hammingDistance(a, b)).toBeLessThanOrEqual(2);
  });

  it("is stabiel over schaling van hetzelfde beeld", () => {
    const a = computePhashFromPixels(photoLike(64, 64));
    const b = computePhashFromPixels(photoLike(128, 128));
    expect(hammingDistance(a, b)).toBeLessThanOrEqual(6);
  });

  it("verschilt duidelijk voor structureel andere beelden", () => {
    const a = computePhashFromPixels(gradient());
    const b = computePhashFromPixels(checkerboard());
    expect(hammingDistance(a, b)).toBeGreaterThan(10);
  });
});

/* ---------------------------------------------------------- dominant colors */

describe("dominantColorsFromPixels", () => {
  it("vindt drie kleurbanden terug", () => {
    const banded = makeImage(90, 30, (x) => {
      if (x < 30) return [255, 0, 0, 255];
      if (x < 60) return [0, 255, 0, 255];
      return [0, 0, 255, 255];
    });
    const colors = dominantColorsFromPixels(banded);
    expect(colors).toHaveLength(3);
    expect(colors).toEqual(expect.arrayContaining(["#ff0000", "#00ff00", "#0000ff"]));
  });

  it("vult aan bij een egaal beeld", () => {
    const solid = makeImage(16, 16, () => [16, 32, 48, 255]);
    const colors = dominantColorsFromPixels(solid);
    expect(colors).toEqual(["#102030", "#102030", "#102030"]);
  });

  it("negeert transparante pixels", () => {
    const halfTransparent = makeImage(20, 20, (x) =>
      x < 10 ? [255, 0, 0, 255] : [0, 255, 0, 0],
    );
    const colors = dominantColorsFromPixels(halfTransparent);
    expect(colors[0]).toBe("#ff0000");
  });
});

/* ------------------------------------------------------- header dimensions */

describe("readImageDimensions", () => {
  it("leest PNG-afmetingen uit de IHDR", () => {
    const bytes = new Uint8Array(26);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const view = new DataView(bytes.buffer);
    view.setUint32(8, 13); // IHDR length
    bytes.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
    view.setUint32(16, 800);
    view.setUint32(20, 600);
    expect(readImageDimensions(bytes)).toEqual({ width: 800, height: 600 });
  });

  it("leest JPEG-afmetingen uit een SOF0-marker", () => {
    // SOI, APP0 (lengte 4, leeg), SOF0 met hoogte 480 / breedte 640
    const bytes = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
      0xff, 0xc0, 0x00, 0x0b, 0x08, 0x01, 0xe0, 0x02, 0x80, 0x01, 0x01, 0x11, 0x00,
    ]);
    expect(readImageDimensions(bytes)).toEqual({ width: 640, height: 480 });
  });

  it("leest GIF-afmetingen", () => {
    const bytes = new Uint8Array(13);
    bytes.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]); // GIF89a
    bytes[6] = 320 & 0xff;
    bytes[7] = 320 >> 8;
    bytes[8] = 200 & 0xff;
    bytes[9] = 200 >> 8;
    expect(readImageDimensions(bytes)).toEqual({ width: 320, height: 200 });
  });

  it("leest WebP (VP8X) afmetingen", () => {
    const bytes = new Uint8Array(30);
    bytes.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
    bytes.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
    bytes.set([0x56, 0x50, 0x38, 0x58], 12); // VP8X
    // canvas 1080x1350 → minus one, little-endian 24-bit op offset 24/27
    const w = 1080 - 1;
    const h = 1350 - 1;
    bytes[24] = w & 0xff;
    bytes[25] = (w >> 8) & 0xff;
    bytes[26] = (w >> 16) & 0xff;
    bytes[27] = h & 0xff;
    bytes[28] = (h >> 8) & 0xff;
    bytes[29] = (h >> 16) & 0xff;
    expect(readImageDimensions(bytes)).toEqual({ width: 1080, height: 1350 });
  });

  it("geeft null voor onbekende bytes", () => {
    expect(readImageDimensions(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toBeNull();
  });
});

/* ------------------------------------------------------------ near-dup zoek */

describe("findNearestPhash", () => {
  it("vindt de dichtstbijzijnde hash binnen de drempel", () => {
    const candidates = [
      { id: "a", phash: "0000000000000000" },
      { id: "b", phash: "000000000000000f" },
    ];
    expect(findNearestPhash(candidates, "0000000000000007", 5)?.id).toBe("b");
  });

  it("geeft null als niets binnen de drempel valt", () => {
    const candidates = [{ id: "a", phash: "ffffffffffffffff" }];
    expect(findNearestPhash(candidates, "0000000000000000", 5)).toBeNull();
  });
});

/* ------------------------------------------------------------- ingestAsset */

describe("ingestAsset", () => {
  it("slaat een nieuw beeld op met afmetingen, phash en kleuren", async () => {
    const storage = new MemoryMarketingStorage();
    const { repo, rows } = makeFakeRepo();

    const result = await ingestAsset(uploadInput(gradient()), {
      storage,
      repo,
      decode: fakeDecode,
    });

    expect(result.status).toBe("stored");
    expect(result.width).toBe(64);
    expect(result.height).toBe(64);
    expect(result.phash).toMatch(/^[0-9a-f]{16}$/);
    expect(result.dominantColors).toHaveLength(3);
    expect(result.storagePath).toMatch(/^upload\//);
    expect(storage.size).toBe(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].record.storagePath).toBe(result.storagePath);
  });

  it("herkent een duplicaat en voegt bronnen samen zonder opnieuw op te slaan", async () => {
    const storage = new MemoryMarketingStorage();
    const { repo, rows, merges } = makeFakeRepo();
    const deps = { storage, repo, decode: fakeDecode };

    const first = await ingestAsset(uploadInput(gradient()), deps);
    const second = await ingestAsset(
      uploadInput(gradient(), { source: "instagram", sourceRef: "ig-123" }),
      deps,
    );

    expect(second.status).toBe("duplicate");
    expect(second.assetId).toBe(first.assetId);
    expect(storage.size).toBe(1);
    expect(rows).toHaveLength(1);
    expect(merges).toHaveLength(1);
    expect(merges[0].assetId).toBe(first.assetId);
    expect(merges[0].input.source).toBe("instagram");
  });

  it("slaat verschillende beelden apart op", async () => {
    const storage = new MemoryMarketingStorage();
    const { repo, rows } = makeFakeRepo();
    const deps = { storage, repo, decode: fakeDecode };

    await ingestAsset(uploadInput(gradient()), deps);
    await ingestAsset(uploadInput(checkerboard()), deps);

    expect(rows).toHaveLength(2);
    expect(storage.size).toBe(2);
  });

  it("weigert lege bestanden", async () => {
    const storage = new MemoryMarketingStorage();
    const { repo } = makeFakeRepo();
    await expect(
      ingestAsset(uploadInput(gradient(), { bytes: new Uint8Array(0) }), {
        storage,
        repo,
        decode: fakeDecode,
      }),
    ).rejects.toThrow(/leeg/i);
  });

  it("weigert niet-ondersteunde bestandstypen", async () => {
    const storage = new MemoryMarketingStorage();
    const { repo } = makeFakeRepo();
    await expect(
      ingestAsset(uploadInput(gradient(), { contentType: "application/pdf" }), {
        storage,
        repo,
        decode: fakeDecode,
      }),
    ).rejects.toThrow(/bestandstype/i);
  });

  it("weigert te grote bestanden", async () => {
    const storage = new MemoryMarketingStorage();
    const { repo } = makeFakeRepo();
    const big = new Uint8Array(26 * 1024 * 1024);
    await expect(
      ingestAsset(uploadInput(gradient(), { bytes: big }), {
        storage,
        repo,
        decode: fakeDecode,
      }),
    ).rejects.toThrow(/te groot/i);
  });
});

/* ---------------------------------------------------------------- sha256Hex */

describe("sha256Hex", () => {
  it("komt overeen met de bekende SHA-256 van 'abc'", () => {
    expect(sha256Hex(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

/* ----------------------------------------------- sharp decoder (integratie) */

async function sharpAvailable(): Promise<boolean> {
  try {
    await import("sharp");
    return true;
  } catch {
    return false;
  }
}

describe("sharpDecoder (integratie)", async () => {
  const available = await sharpAvailable();

  it.skipIf(!available)("decodeert een echte PNG en draait de hele pijplijn", async () => {
    const sharp = (await import("sharp")).default;
    const png = await sharp({
      create: {
        width: 40,
        height: 20,
        channels: 3,
        background: { r: 200, g: 50, b: 25 },
      },
    })
      .png()
      .toBuffer();

    const { sharpDecoder } = await import("../ingest");
    const decoded = await sharpDecoder(new Uint8Array(png));
    expect(decoded.width).toBe(40);
    expect(decoded.height).toBe(20);
    expect(decoded.rgba.length).toBe(40 * 20 * 4);

    const storage = new MemoryMarketingStorage();
    const { repo } = makeFakeRepo();
    const result = await ingestAsset(
      {
        bytes: new Uint8Array(png),
        contentType: "image/png",
        source: "upload",
        sourceRef: "sharp.png",
      },
      { storage, repo },
    );
    expect(result.status).toBe("stored");
    expect(result.width).toBe(40);
    expect(result.height).toBe(20);
    expect(result.dominantColors[0]).toBe("#c83219");
  });
});
