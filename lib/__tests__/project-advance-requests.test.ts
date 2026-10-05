import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => {
  const { drizzle } = await import("drizzle-orm/postgres-js");
  return { db: drizzle.mock({ casing: "snake_case" }) };
});

import { loadProjectAdvanceRequests } from "../project-advance-requests";

describe("advance receipt lookup", () => {
  it("keeps both request IDs qualified instead of comparing the receipt with its own ID", () => {
    const { sql, params } = loadProjectAdvanceRequests("project-under-test").toSQL();
    expect(sql).toContain('"project_payments"."advance_request_id" = "sent_emails"."id"');
    expect(sql).toContain('"project_payments"."project_id" = "sent_emails"."project_id"');
    expect(sql).toContain('"sent_emails"."project_id" = $1');
    expect(params).toEqual(["project-under-test", "Voorschot: %", 10]);
  });

  it("sums all partial receipts while retaining requests with no receipt", () => {
    const { sql, params } = loadProjectAdvanceRequests("project-under-test", 20).toSQL();
    expect(sql).toContain('left join "project_payments"');
    expect(sql).toContain('coalesce(sum("project_payments"."amount_eur"), 0)::float8');
    expect(sql).toContain('group by "sent_emails"."id"');
    expect(params.at(-1)).toBe(20);
  });
});
