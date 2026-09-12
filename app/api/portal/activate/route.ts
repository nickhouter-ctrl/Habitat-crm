import { hasPortalAccess } from "@/lib/portal/access";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db";
import { customerAccounts } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { jsonCors, portalCors } from "@/lib/portal/api";
import { signPortalToken } from "@/lib/portal/token";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const schema = z.object({ token: z.string().min(10), password: z.string().min(8).max(200), scope: z.enum(["website", "windows"]).default("website") });

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: portalCors(req.headers.get("origin")) });
}

/** GET ?token= — controleert of een activatietoken (nog) geldig is (voor de UI). */
export async function GET(req: Request) {
  const origin = req.headers.get("origin");
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!(await rateLimit(`portal-activate:ip:${clientIp(req)}`, 20, 900, { strikt: true }))) return jsonCors({ ok: false, error: "too-many-requests" }, 429, origin);
  const acc = token ? await db.query.customerAccounts.findFirst({ where: eq(customerAccounts.activationToken, token) }) : null;
  const scope = new URL(req.url).searchParams.get("scope") === "windows" ? "windows" : "website";
  const valid = !!acc && acc.status !== "suspended" && (!acc.activationExpires || acc.activationExpires > new Date()) && await hasPortalAccess(acc, scope);
  return jsonCors({ ok: valid, email: valid ? acc!.email : undefined }, valid ? 200 : 404, origin);
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return jsonCors({ ok: false, error: "invalid-json" }, 400, origin);
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return jsonCors({ ok: false, error: "validation", issues: parsed.error.issues.map((i) => i.message) }, 400, origin);
  if (!(await rateLimit(`portal-activate:ip:${clientIp(req)}`, 20, 900, { strikt: true }))) return jsonCors({ ok: false, error: "too-many-requests" }, 429, origin);

  const acc = await db.query.customerAccounts.findFirst({ where: eq(customerAccounts.activationToken, parsed.data.token) });
  if (!acc || (acc.activationExpires && acc.activationExpires <= new Date())) {
    return jsonCors({ ok: false, error: "invalid-token" }, 400, origin);
  }

  if (acc.status === "suspended" || !await hasPortalAccess(acc, parsed.data.scope)) return jsonCors({ok:false,error:"access-not-approved"},403,origin);

  await db
    .update(customerAccounts)
    .set({
      passwordHash: await hashPassword(parsed.data.password),
      status: "active",
      verifiedAt: new Date(),
      activationToken: null,
      activationExpires: null,
      lastLoginAt: new Date(),
    })
    .where(eq(customerAccounts.id, acc.id));

  const sessionToken = signPortalToken({ scope: parsed.data.scope, sub: acc.id, email: acc.email, tier: acc.priceTier, contactId: acc.contactId });
  return jsonCors({ ok: true, token: sessionToken, account: { email: acc.email, tier: acc.priceTier } }, 200, origin);
}
