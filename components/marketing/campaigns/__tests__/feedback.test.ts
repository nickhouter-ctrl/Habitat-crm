import { describe, expect, it } from "vitest";

import { describeReviewFeedback, PROBLEM_STATUSES } from "../feedback";

describe("describeReviewFeedback", () => {
  it("slaat Meta's ad_review_feedback plat", () => {
    const fb = {
      global: { "Onacceptabele bewering": "De advertentie belooft een resultaat." },
    };
    expect(describeReviewFeedback(fb)).toEqual([
      "global · Onacceptabele bewering: De advertentie belooft een resultaat.",
    ]);
  });

  it("toont onze eigen publicatiefout met NL-label", () => {
    expect(describeReviewFeedback({ publishError: "Token verlopen." })).toEqual([
      "Publicatie mislukt: Token verlopen.",
    ]);
  });

  it("is leeg bij null of leeg object", () => {
    expect(describeReviewFeedback(null)).toEqual([]);
    expect(describeReviewFeedback({})).toEqual([]);
  });
});

describe("PROBLEM_STATUSES", () => {
  it("markeert afkeuringen en publicatiefouten", () => {
    expect(PROBLEM_STATUSES.has("DISAPPROVED")).toBe(true);
    expect(PROBLEM_STATUSES.has("PUBLISH_FAILED")).toBe(true);
    expect(PROBLEM_STATUSES.has("ACTIVE")).toBe(false);
  });
});
