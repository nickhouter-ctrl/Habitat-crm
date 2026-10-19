import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { authorized, requestSchema } from "@/lib/hermes/contract";
import { AgentConflict, executeAgentRequest } from "@/lib/hermes/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(req: Request) {
  if (!authorized(req.headers.get("authorization"), process.env.HERMES_AGENT_TOKEN_SHA256)) {
    console.warn("[hermes] authentication denied");
    return reply({ error: "unauthorized" }, 401);
  }
  try {
    const owner = process.env.HERMES_AGENT_OWNER_EMAIL;
    if (!owner) return reply({ error: "integration-disabled" }, 503);
    const actors = await db.execute(sql`select id from users where lower(email)=lower(${owner}) and role='admin' limit 1`);
    if (!actors.length) return reply({ error: "forbidden" }, 403);
    if (!await rateLimit("hermes:owner", 120, 60, { strikt: true })) return reply({ error: "rate-limited" }, 429);
    if (!req.headers.get("content-type")?.startsWith("application/json")) return reply({ error: "json-required" }, 415);
    const reader = req.body?.getReader();
    if (!reader) return reply({ error: "invalid-request" }, 400);
    let body = "";
    let bytes = 0;
    const decoder = new TextDecoder();
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 65536) { await reader.cancel(); return reply({ error: "body-too-large" }, 413); }
      body += decoder.decode(chunk.value, { stream: true });
    }
    body += decoder.decode();
    let json: unknown;
    try { json = JSON.parse(body); } catch { return reply({ error: "invalid-json" }, 400); }
    const parsed = requestSchema.safeParse(json);
    if (!parsed.success) return reply({ error: "invalid-request", fields: parsed.error.issues.map(i => i.path.join(".")) }, 400);
    const data = await executeAgentRequest(parsed.data, String(actors[0].id));
    console.info("[hermes] action completed", parsed.data.action);
    return reply({ ok: true, data });
  } catch (error) {
    if (error instanceof AgentConflict) return reply({ error: error.message }, 409);
    console.error("[hermes] action failed");
    return reply({ error: "integration-failed" }, 500);
  }
}
