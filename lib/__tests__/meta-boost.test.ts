import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { adsToPause, postsToBoost } from "@/lib/meta/boost";

const now = new Date("2026-11-20T12:00:00Z");

describe("postsToBoost", () => {
  it("picks recent, unboosted, promotable posts oldest first", () => {
    const posts = [
      { id: "p_3", created_time: "2026-11-19T10:00:00+0000" },
      { id: "p_1", created_time: "2026-11-01T10:00:00+0000" }, // te oud
      { id: "p_2", created_time: "2026-11-18T10:00:00+0000" },
      { id: "p_4", created_time: "2026-11-19T11:00:00+0000", is_eligible_for_promotion: false },
      { id: "p_5", created_time: "2026-11-17T10:00:00+0000" }, // al geboost
    ];
    const ads = [{ id: "a", created_time: "2026-11-17T12:00:00+0000", status: "ACTIVE", objectStoryId: "p_5" }];
    expect(postsToBoost(posts, ads, now).map((p) => p.id)).toEqual(["p_2", "p_3"]);
  });
});

describe("adsToPause", () => {
  it("pauses only active ads older than 21 days", () => {
    const ads = [
      { id: "old", created_time: "2026-10-25T00:00:00+0000", status: "ACTIVE", objectStoryId: "x" },
      { id: "oldPaused", created_time: "2026-10-25T00:00:00+0000", status: "PAUSED", objectStoryId: "y" },
      { id: "new", created_time: "2026-11-10T00:00:00+0000", status: "ACTIVE", objectStoryId: "z" },
    ];
    expect(adsToPause(ads, now).map((a) => a.id)).toEqual(["old"]);
  });
});

import { leadCount, renderReport } from "@/lib/meta/weekly-report";

vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));

describe("weekly ad report", () => {
  it("counts pixel leads and totals spend", () => {
    const rows = [
      { campaign_name: "A & B", reach: "1000", impressions: "2500", inline_link_clicks: "30", spend: "41.5",
        actions: [{ action_type: "offsite_conversion.fb_pixel_lead", value: "2" }, { action_type: "link_click", value: "30" }] },
      { campaign_name: "C", reach: "500", impressions: "900", inline_link_clicks: "5", spend: "10" },
    ];
    expect(leadCount(rows[0].actions)).toBe(2);
    const r = renderReport(rows, 140);
    expect(r.total).toEqual({ reach: 1500, clicks: 35, leads: 2, spend: 51.5 });
    expect(r.html).toContain("A &amp; B");
    expect(r.text).toContain("Instagram-volgers nu: 140");
  });
});
