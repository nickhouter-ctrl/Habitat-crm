import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createFollowupDownloadToken, resolveFollowupDownloadToken } from "../followup-download-link";

describe("blijvende privé-downloadlinks", () => {
  beforeEach(() => vi.stubEnv("AUTH_SECRET", "test-secret-for-download-links-which-is-long-enough"));
  afterEach(() => vi.unstubAllEnvs());

  it("maakt een stabiele ondoorzichtige link die alleen naar een bestaand gekozen bestand verwijst", () => {
    const path = "followup:Flexible-Stone-Book-a1b2c3d4.pdf";
    const token = createFollowupDownloadToken(path);
    expect(token).toHaveLength(43);
    expect(token).not.toContain("Flexible-Stone");
    expect(createFollowupDownloadToken(path)).toBe(token);
    expect(resolveFollowupDownloadToken(token, [path])).toBe(path);
    expect(resolveFollowupDownloadToken(token, ["followup:other-a1b2c3d4.pdf"])).toBeNull();
    expect(resolveFollowupDownloadToken(`${token.slice(0, -1)}x`, [path])).toBeNull();
  });
});
