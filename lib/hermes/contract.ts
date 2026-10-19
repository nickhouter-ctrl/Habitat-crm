import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export function authorized(header: string | null, digest: string | undefined): boolean {
  if (!digest || !/^[a-f0-9]{64}$/.test(digest) || !header?.startsWith("Bearer ")) return false;
  const token = header.slice(7);
  if (!/^[a-f0-9]{64}$/.test(token)) return false;
  return timingSafeEqual(createHash("sha256").update(token).digest(), Buffer.from(digest, "hex"));
}
const id = z.uuid();
const text = z.string().trim().min(1).max(10000);
const write = { requestId: id };
export const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("search"), resource: z.enum(["contacts", "projects", "tasks", "emails", "invoice_reviews", "windows_projects", "windows_orders", "staff"]), query: z.string().max(200).default(""), id: id.optional(), limit: z.number().int().min(1).max(30).default(10) }).strict(),
  z.object({ action: z.literal("create_followup"), ...write, contactId: id, subject: z.string().trim().min(1).max(250), body: text, dueAt: z.iso.datetime({ offset: true }), assigneeId: id.optional() }).strict(),
  z.object({ action: z.literal("contact_note"), ...write, contactId: id, body: text }).strict(),
  z.object({ action: z.literal("email_draft"), ...write, emailId: id, subject: z.string().trim().min(1).max(500), body: text, expectedDraft: z.string().max(30000).nullable() }).strict(),
  z.object({ action: z.literal("invoice_project"), ...write, reviewId: id, projectId: id, expectedProjectId: id.nullable() }).strict(),
  z.object({ action: z.literal("windows_note"), ...write, orderId: id, body: text }).strict(),
]);
export type AgentRequest = z.infer<typeof requestSchema>;
