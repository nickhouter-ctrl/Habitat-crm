import { and, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { commissionEntries, contacts, customerAccounts, referrals } from "@/lib/db/schema";
import { ensureCommissions } from "@/lib/commission";
import { jsonCors, portalAuth, portalCors } from "@/lib/portal/api";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: portalCors(req.headers.get("origin")) });
}

export async function GET(req: Request) {
  const origin = req.headers.get("origin");
  const tok = portalAuth(req);
  if (!tok) return jsonCors({ ok: false, error: "unauthorized" }, 401, origin);

  const acc = await db.query.customerAccounts.findFirst({ where: eq(customerAccounts.id, tok.sub) });
  if (!acc || acc.status !== "active") return jsonCors({ ok: false, error: "unauthorized" }, 401, origin);

  // Commissies waar deze klant de AANBRENGER is.
  if (acc.contactId) await ensureCommissions(acc.contactId);
  const rows = acc.contactId
    ? await db
        .select({
          amount: commissionEntries.amountEur,
          base: commissionEntries.baseAmountEur,
          pct: commissionEntries.pct,
          status: commissionEntries.status,
          date: commissionEntries.createdAt,
          referee: contacts.name,
        })
        .from(commissionEntries)
        .innerJoin(referrals, eq(commissionEntries.referralId, referrals.id))
        .innerJoin(contacts, eq(referrals.refereeContactId, contacts.id))
        .where(and(eq(referrals.referrerContactId, acc.contactId), eq(referrals.active, true)))
        .orderBy(desc(commissionEntries.createdAt))
    : [];

  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  return jsonCors(
    {
      ok: true,
      account: { email: acc.email, tier: acc.priceTier, businessName: acc.businessName },
      commissionTotal: Math.round(total * 100) / 100,
      commissions: rows.map((r) => ({
        referee: r.referee,
        base: Number(r.base),
        pct: Number(r.pct),
        amount: Number(r.amount),
        status: r.status,
        date: r.date,
      })),
    },
    200,
    origin,
  );
}
