import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db";
import { customerAccounts } from "@/lib/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { jsonCors, portalCors } from "@/lib/portal/api";
import { clientIp, rateLimit, RATE_LIMITED } from "@/lib/rate-limit";
import { signPortalToken } from "@/lib/portal/token";

const schema = z.object({ email: z.string().trim().email(), password: z.string().min(1) });

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: portalCors(req.headers.get("origin")) });
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
  if (!parsed.success) return jsonCors({ ok: false, error: "validation" }, 400, origin);
  const { email, password } = parsed.data;

  // Brute-force-rem: per IP én per account (voorkomt onbeperkt wachtwoord-raden).
  const ipOk = await rateLimit(`portal-login:ip:${clientIp(req)}`, 10, 300);
  const mailOk = await rateLimit(`portal-login:email:${email.toLowerCase()}`, 5, 900);
  if (!ipOk || !mailOk) return jsonCors(RATE_LIMITED, 429, origin);

  const acc = await db.query.customerAccounts.findFirst({
    where: eq(customerAccounts.email, email.toLowerCase()),
  });
  // Zelfde generieke fout bij onbekend / niet-actief / verkeerd wachtwoord.
  const invalid = () => jsonCors({ ok: false, error: "invalid-credentials" }, 401, origin);
  if (!acc || acc.status !== "active" || !acc.passwordHash) return invalid();
  if (!(await verifyPassword(password, acc.passwordHash))) return invalid();

  await db.update(customerAccounts).set({ lastLoginAt: new Date() }).where(eq(customerAccounts.id, acc.id));

  const token = signPortalToken({ sub: acc.id, email: acc.email, tier: acc.priceTier, contactId: acc.contactId });
  return jsonCors(
    { ok: true, token, account: { email: acc.email, tier: acc.priceTier, businessName: acc.businessName } },
    200,
    origin,
  );
}
