import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import { authorized, requestSchema } from "./contract";
const token = "ab".repeat(32);
const digest = createHash("sha256").update(token).digest("hex");
describe("Hermes trust boundary", () => {
  it("fails closed with absent or malformed credentials", () => {
    for (const header of [null, token, `Basic ${token}`, "Bearer bad", `Bearer ${"cd".repeat(32)}`]) expect(authorized(header, digest)).toBe(false);
    for (const hash of [undefined, "", "xyz", "ab"]) expect(authorized(`Bearer ${token}`, hash)).toBe(false);
    expect(authorized(`Bearer ${token}`, digest)).toBe(true);
  });
  it("rejects arbitrary operations, extra fields, unbounded queries and malformed ids", () => {
    for (const request of [
      {action:"sql",query:"delete from contacts"},
      {action:"search",resource:"users_passwords"},
      {action:"search",resource:"contacts",limit:1000},
      {action:"search",resource:"contacts",sql:"select *"},
      {action:"search",resource:"contacts",id:"';--"},
    ]) expect(requestSchema.safeParse(request).success).toBe(false);
  });
  it("requires replay protection and optimistic concurrency for drafts", () => {
    const draft = {action:"email_draft",emailId:crypto.randomUUID(),subject:"Test",body:"Concept"};
    expect(requestSchema.safeParse(draft).success).toBe(false);
    expect(requestSchema.safeParse({...draft,requestId:crypto.randomUUID()}).success).toBe(false);
    expect(requestSchema.safeParse({...draft,requestId:crypto.randomUUID(),expectedDraft:null}).success).toBe(true);
  });
});
