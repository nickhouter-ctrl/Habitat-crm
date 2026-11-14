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

import { parsePeriod, toMetrics } from "@/lib/meta/live-stats";

describe("live ad stats", () => {
  it("falls back to last 7 days for unknown periods", () => {
    expect(parsePeriod("today")).toBe("today");
    expect(parsePeriod("nonsense")).toBe("last_7d");
    expect(parsePeriod(undefined)).toBe("last_7d");
  });
  it("maps a Meta row to numbers", () => {
    expect(toMetrics({ reach: "28", impressions: "30", inline_link_clicks: "2", spend: "0.15", actions: [{ action_type: "lead", value: "1" }] }))
      .toEqual({ reach: 28, impressions: 30, clicks: 2, leads: 1, spend: 0.15 });
    expect(toMetrics({})).toEqual({ reach: 0, impressions: 0, clicks: 0, leads: 0, spend: 0 });
  });
});

import { periodQuery } from "@/lib/meta/live-stats";

describe("periodQuery", () => {
  it("includes today in the last 7 days", () => {
    const q = periodQuery("last_7d", new Date("2026-11-14T15:00:00Z"));
    expect(JSON.parse(q.time_range)).toEqual({ since: "2026-11-08", until: "2026-11-14" });
    expect(periodQuery("today")).toEqual({ date_preset: "today" });
  });
});

import { mediaImages, splitAds } from "@/lib/meta/live-stats";

describe("ad cards", () => {
  it("splits running and past ads", () => {
    const r = splitAds([{ status: "ACTIVE" }, { status: "PAUSED" }, { status: "PENDING_REVIEW" }, { status: "ADSET_PAUSED" }]);
    expect(r.active.map((a) => a.status)).toEqual(["ACTIVE", "PENDING_REVIEW"]);
    expect(r.past.map((a) => a.status)).toEqual(["PAUSED", "ADSET_PAUSED"]);
  });
  it("uses carousel children and video thumbnails", () => {
    expect(mediaImages({ media_type: "CAROUSEL_ALBUM", children: { data: [{ media_type: "IMAGE", media_url: "a" }, { media_type: "VIDEO", thumbnail_url: "b" }] } })).toEqual(["a", "b"]);
    expect(mediaImages({ media_type: "VIDEO", thumbnail_url: "t" })).toEqual(["t"]);
  });
});

import { postImageList } from "@/lib/meta/live-stats";

describe("postImageList", () => {
  it("prefers carousel subattachments", () => {
    expect(postImageList({ attachments: { data: [{ subattachments: { data: [{ media: { image: { src: "1" } } }, { media: { image: { src: "2" } } }] } }] } })).toEqual(["1", "2"]);
    expect(postImageList({ full_picture: "f" })).toEqual(["f"]);
  });
});

import { pickPromotion } from "@/lib/meta/boost";

describe("pickPromotion", () => {
  const now = new Date("2026-11-21T12:00:00Z");
  const perf = [
    { adId: "a", objectStoryId: "p_1", impressions: 1000, clicks: 5, engagements: 10 },
    { adId: "b", objectStoryId: "p_2", impressions: 800, clicks: 20, engagements: 30 },
    { adId: "c", objectStoryId: "p_3", impressions: 100, clicks: 50, engagements: 50 }, // te weinig data
  ];
  it("promotes the best proven post when the customer ad is a week old", () => {
    const customer = [{ id: "x", created_time: "2026-11-14T10:00:00+0000", status: "ACTIVE", objectStoryId: "p_0" }];
    expect(pickPromotion(perf, customer, now)?.objectStoryId).toBe("p_2");
  });
  it("waits while the customer ad is fresh and skips posts already used", () => {
    expect(pickPromotion(perf, [{ id: "x", created_time: "2026-11-18T10:00:00+0000", status: "ACTIVE", objectStoryId: "p_0" }], now)).toBeNull();
    const used = [{ id: "y", created_time: "2026-11-01T00:00:00+0000", status: "PAUSED", objectStoryId: "p_2" }];
    expect(pickPromotion(perf, used, now)?.objectStoryId).toBe("p_1");
  });
});
