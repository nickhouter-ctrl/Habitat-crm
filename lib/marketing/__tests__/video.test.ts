/**
 * Unit tests voor de video-asset-pijplijn (U7). Video's hebben geen
 * perceptuele hash — dedupe gaat op exacte inhoudshash (sha256) — en de
 * metadata (duur/afmetingen/poster) komt uit de browser bij de upload.
 */
import { describe, expect, it } from "vitest";

import { MemoryMarketingStorage } from "../storage";
import {
  formatDuration,
  ingestVideoAsset,
  isVideoContentType,
  videoStoragePath,
  type VideoIngestRepo,
} from "../video";

const MP4_BYTES = new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]);

function fakeRepo() {
  const rows: Array<{ id: string; storagePath: string }> = [];
  const repo: VideoIngestRepo = {
    async findByStoragePath(path) {
      return rows.find((r) => r.storagePath === path) ?? null;
    },
    async insertVideoAsset(record) {
      const row = { id: `asset-${rows.length + 1}`, storagePath: record.storagePath };
      rows.push(row);
      return { id: row.id };
    },
  };
  return { repo, rows };
}

describe("isVideoContentType", () => {
  it("herkent de ondersteunde videoformaten", () => {
    expect(isVideoContentType("video/mp4")).toBe(true);
    expect(isVideoContentType("video/quicktime")).toBe(true);
    expect(isVideoContentType("video/webm")).toBe(true);
  });

  it("wijst beeldformaten af", () => {
    expect(isVideoContentType("image/jpeg")).toBe(false);
    expect(isVideoContentType("application/octet-stream")).toBe(false);
  });
});

describe("videoStoragePath", () => {
  it("is content-addressed en deterministisch, met extensie per mimetype", () => {
    const a = videoStoragePath(MP4_BYTES, "video/mp4");
    expect(a).toMatch(/^video\/[0-9a-f]{64}\.mp4$/);
    expect(videoStoragePath(MP4_BYTES, "video/mp4")).toBe(a);
    expect(videoStoragePath(MP4_BYTES, "video/webm")).toMatch(/\.webm$/);
  });
});

describe("formatDuration", () => {
  it("toont minuten:seconden, seconden altijd twee cijfers", () => {
    expect(formatDuration(37.4)).toBe("0:37");
    expect(formatDuration(95)).toBe("1:35");
    expect(formatDuration(600)).toBe("10:00");
  });

  it("is defensief bij rare invoer", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(null)).toBe("—");
  });
});

describe("ingestVideoAsset", () => {
  const input = {
    bytes: MP4_BYTES,
    contentType: "video/mp4",
    sourceRef: "showroom-tour.mp4",
    durationSeconds: 37.4,
    width: 1080,
    height: 1920,
  };

  it("slaat de video en het posterframe op en registreert het asset", async () => {
    const storage = new MemoryMarketingStorage();
    const { repo, rows } = fakeRepo();
    const result = await ingestVideoAsset(
      {
        ...input,
        thumbnail: { bytes: new Uint8Array([1, 2, 3]), contentType: "image/jpeg" },
      },
      { storage, repo },
    );
    expect(result.status).toBe("stored");
    expect(result.assetId).toBe("asset-1");
    expect(rows).toHaveLength(1);
    expect(await storage.exists(result.storagePath)).toBe(true);
    expect(result.thumbnailPath).toMatch(/_poster\.jpg$/);
    expect(await storage.exists(result.thumbnailPath!)).toBe(true);
  });

  it("dedupliceert op exacte inhoud: zelfde bytes = duplicate, niets nieuws", async () => {
    const storage = new MemoryMarketingStorage();
    const { repo, rows } = fakeRepo();
    await ingestVideoAsset(input, { storage, repo });
    const second = await ingestVideoAsset(input, { storage, repo });
    expect(second.status).toBe("duplicate");
    expect(second.assetId).toBe("asset-1");
    expect(rows).toHaveLength(1);
  });

  it("weigert niet-ondersteunde formaten met een NL-fout", async () => {
    const storage = new MemoryMarketingStorage();
    const { repo } = fakeRepo();
    await expect(
      ingestVideoAsset({ ...input, contentType: "video/x-msvideo" }, { storage, repo }),
    ).rejects.toThrow(/niet ondersteund/i);
  });

  it("weigert lege bestanden", async () => {
    const storage = new MemoryMarketingStorage();
    const { repo } = fakeRepo();
    await expect(
      ingestVideoAsset({ ...input, bytes: new Uint8Array(0) }, { storage, repo }),
    ).rejects.toThrow(/leeg/i);
  });
});
