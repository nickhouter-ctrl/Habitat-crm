/**
 * Eenmalig: push de in het CRM al-betaalde Abules-facturen naar Holded
 * (registreer de betaling op de juiste Holded-factuur), zonder dubbel.
 * Dry-run standaard; voeg `--push` toe om daadwerkelijk te boeken.
 */
import "./load-env";
import { and, eq, ilike } from "drizzle-orm";
import { db } from "@/lib/db";
import { documents, contacts } from "@/lib/db/schema";
import { holded } from "@/lib/holded/client";

const DO_PUSH = process.argv.includes("--push");

async function main() {
  const rows = await db
    .select({
      id: documents.id,
      number: documents.docNumber,
      kind: documents.kind,
      status: documents.status,
      totalEur: documents.totalEur,
      paidEur: documents.paidEur,
      holdedId: documents.holdedId,
      contact: contacts.name,
    })
    .from(documents)
    .leftJoin(contacts, eq(documents.contactId, contacts.id))
    .where(and(eq(documents.kind, "invoice"), ilike(contacts.name, "%abules%")));

  console.log(`\nGevonden Abules-facturen (kind=invoice): ${rows.length}\n`);
  if (rows.length === 0) {
    console.log("Geen match op contactnaam '%abules%'. Check de exacte naam in het CRM.");
    return;
  }

  for (const r of rows) {
    const tag = `${r.number ?? r.id.slice(0, 8)} · ${r.contact ?? "?"} · status=${r.status} · totaal=€${r.totalEur} · crmBetaald=€${r.paidEur ?? 0}`;
    if (!r.holdedId) {
      console.log(`SKIP  ${tag}  → geen Holded-koppeling (holdedId leeg)`);
      continue;
    }
    let h;
    try {
      h = await holded.documents.get("invoice", r.holdedId);
    } catch (e) {
      console.log(`ERR   ${tag}  → Holded GET faalde: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    const alreadyPaid = Number(h.paymentsTotal ?? 0);
    const holdedTotal = Number(h.total ?? r.totalEur ?? 0);
    const open = Math.round((holdedTotal - alreadyPaid) * 100) / 100;
    const holdedPaidFull = h.status === 1;

    if (holdedPaidFull || open <= 0.01) {
      console.log(`OK    ${tag}  → Holded al betaald (status=${h.status}, betaald=€${alreadyPaid}) — niets doen`);
      continue;
    }

    if (!DO_PUSH) {
      console.log(`PUSH? ${tag}  → zou €${open} in Holden boeken (Holded total=€${holdedTotal}, al betaald=€${alreadyPaid})`);
      continue;
    }

    try {
      await holded.documents.pay("invoice", r.holdedId, {
        date: Math.floor(Date.now() / 1000),
        amount: open,
        desc: "Betaald via Habitat CRM (handmatige nasync)",
      });
      console.log(`PUSHED ${tag}  → €${open} geboekt in Holded ✓`);
    } catch (e) {
      console.log(`FAIL  ${tag}  → pay faalde: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log(DO_PUSH ? "\nKlaar (push uitgevoerd)." : "\nDit was een DRY-RUN. Voeg --push toe om te boeken.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
