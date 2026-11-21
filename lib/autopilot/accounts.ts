/**
 * Autopilot accountaanvragen (afspraak Nick 21-11-2026): kloppen alle gegevens
 * en zijn ze niet nep, dan meteen goedkeuren. Particulier → particulier-prijzen;
 * zakelijk alleen met een btw-nummer dat in het EU-register (VIES) bestaat →
 * aannemersprijzen. Twijfel → blijft staan voor handmatige beoordeling, met de
 * reden erbij (zichtbaar in de ochtendbriefing en op /autopilot).
 */
import "server-only";

import { and, eq, gt, lt, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { accountRequests, activities } from "@/lib/db/schema";
import { approveAccountRequestCore } from "@/lib/portal/approve-account";
import { checkAccountRequest } from "./account-check";
import { AUTOPILOT_START } from "./quotes";

export type AccountDecision = {
  requestId: string;
  name: string;
  email: string;
  kind: string;
  approved: boolean;
  reasons: string[];
  at: string;
};

const key = (id: string) => `autopilot:account:${id}`;

export async function runAccountAutopilot(): Promise<{ checked: number; approved: number; manual: number }> {
  const pending = await db
    .select()
    .from(accountRequests)
    .where(and(
      eq(accountRequests.status, "pending"),
      lt(accountRequests.createdAt, sql`now() - interval '2 minutes'`),
      gt(accountRequests.createdAt, sql`greatest(now() - interval '30 days', ${AUTOPILOT_START}::timestamptz)`),
      sql`not exists (select 1 from kv_cache k where k.key = 'autopilot:account:' || ${accountRequests.id}::text)`,
    ))
    .limit(10);

  let approved = 0;
  let manual = 0;
  for (const req of pending) {
    const check = await checkAccountRequest({
      name: req.name,
      email: req.email,
      phone: req.phone,
      kind: req.kind,
      source: req.source,
      businessName: req.businessName,
      vatNumber: req.vatNumber,
      message: req.message,
    });
    // Eerder geweigerd met hetzelfde adres → altijd mens.
    const earlierRejected = await db.query.accountRequests.findFirst({
      where: and(sql`lower(${accountRequests.email}) = ${req.email.toLowerCase()}`, eq(accountRequests.status, "rejected"), ne(accountRequests.id, req.id)),
      columns: { id: true },
    });
    if (earlierRejected) check.reasons.push("Eerder geweigerde aanvraag met hetzelfde e-mailadres");
    const ok = check.ok && !earlierRejected;

    let done = false;
    let reasons = check.reasons;
    if (ok) {
      try {
        const res = await approveAccountRequestCore(req.id, req.kind === "zakelijk" ? "aannemer" : "particulier");
        done = res.ok;
        if (res.ok && res.contactId) {
          await db.insert(activities).values({
            type: "note",
            subject: "Account automatisch goedgekeurd",
            body: `Autopilot: gegevens gecontroleerd (e-maildomein${req.kind === "zakelijk" ? `, btw-nummer ${check.vies?.country}${check.vies?.number} geldig in VIES` : ""}). Prijsniveau: ${req.kind === "zakelijk" ? "aannemer" : "particulier"}. Activatiemail verstuurd.`,
            contactId: res.contactId,
          });
        }
      } catch (err) {
        reasons = [`Automatisch goedkeuren mislukt: ${err instanceof Error ? err.message : String(err)}`];
      }
    }
    if (done) approved++;
    else manual++;
    const decision: AccountDecision = { requestId: req.id, name: req.name, email: req.email, kind: req.kind, approved: done, reasons, at: new Date().toISOString() };
    await db.execute(sql`insert into kv_cache(key, value) values (${key(req.id)}, ${JSON.stringify(decision)}::jsonb)
      on conflict (key) do update set value = excluded.value, updated_at = now()`);
  }
  return { checked: pending.length, approved, manual };
}

/** Beslissingen van de laatste dagen, voor briefing en overzicht. */
export async function recentAccountDecisions(days = 7): Promise<AccountDecision[]> {
  const rows = await db.execute(sql`select value from kv_cache where key like 'autopilot:account:%'
    and updated_at > now() - make_interval(days => ${days}) order by updated_at desc limit 50`);
  return rows.map((r) => (r as { value: AccountDecision }).value);
}
