/**
 * Backfill 08-09-2026: vroege "Mail de klant"-reacties (aanvragen) stonden
 * alleen in het activiteitenlog, niet in het mailarchief (sent_emails) — en
 * dus niet in de nieuwe Conversatie-weergave op de aanvraag-pagina.
 *
 * Kopieert activities (type=email, onderwerp "Mail naar klant — …") naar
 * sent_emails met de oorspronkelijke datum. Idempotent: bestaat er al een
 * archiefregel met dezelfde tekst naar hetzelfde adres, dan wordt 'ie
 * overgeslagen.
 *
 * Dry-run standaard; schrijf met:
 *   NODE_OPTIONS="--conditions=react-server" npx tsx --env-file=.env.local scripts/backfill-aanvraag-mails-08-09.ts --apply
 */
import { and, eq, ilike, like } from "drizzle-orm";

import { db } from "../lib/db";
import { activities, contacts, sentEmails } from "../lib/db/schema";

const APPLY = process.argv.includes("--apply");
const PREFIX = "Mail naar klant — ";

/** Logregels van vóór de contactkoppeling (mail verstuurd vóór het accepteren
 *  van de aanvraag): handmatig geverifieerd bij welk adres/contact ze horen. */
const CORRECTIES: Record<string, { email: string; contactId: string | null }> = {
  // Antwoord aan Vicente Perez (aanvraag 0c75ff52, geaccepteerd na verzending)
  "90acf57c-efb4-493a-b2c0-60ca3d7f3612": {
    email: "info@wvistaglobals.com",
    contactId: "ae6f36fa-50c6-431c-8f0b-e985a21ef6a9",
  },
};

async function main() {
  const rows = await db
    .select({
      id: activities.id,
      subject: activities.subject,
      body: activities.body,
      contactId: activities.contactId,
      createdAt: activities.createdAt,
      email: contacts.email,
    })
    .from(activities)
    .leftJoin(contacts, eq(contacts.id, activities.contactId))
    .where(and(eq(activities.type, "email"), like(activities.subject, `${PREFIX}%`)));

  console.log(`${rows.length} "Mail naar klant"-logregels gevonden.`);
  let inserted = 0;
  let skipped = 0;

  for (const r of rows) {
    const correctie = CORRECTIES[r.id];
    if (correctie) {
      r.email = correctie.email;
      r.contactId = correctie.contactId;
    }
    if (!r.email) {
      console.log(`  ⏭︎  ${r.id}: geen contact-e-mail bekend — overslaan`);
      skipped++;
      continue;
    }
    const mailSubject = (r.subject ?? "").slice(PREFIX.length).trim() || "(geen onderwerp)";
    const tekst = r.body ?? "";

    const bestaat = await db
      .select({ id: sentEmails.id })
      .from(sentEmails)
      .where(and(ilike(sentEmails.toEmail, r.email), eq(sentEmails.body, tekst)))
      .limit(1);
    if (bestaat.length > 0) {
      console.log(`  ✓  al in archief: "${mailSubject}" → ${r.email}`);
      skipped++;
      continue;
    }

    console.log(
      `  ${APPLY ? "➕" : "zou toevoegen:"} "${mailSubject}" → ${r.email} (${r.createdAt?.toISOString() ?? "?"})`,
    );
    if (APPLY) {
      await db.insert(sentEmails).values({
        kind: "other",
        toEmail: r.email,
        subject: mailSubject,
        html: `<div style="white-space:pre-wrap">${tekst.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c)}</div>`,
        body: tekst,
        contactId: r.contactId,
        createdAt: r.createdAt ?? undefined,
      });
    }
    inserted++;
  }

  console.log(
    `\n${APPLY ? "Toegevoegd" : "Zou toevoegen"}: ${inserted} · overgeslagen: ${skipped}${APPLY ? "" : "\nDraai met --apply om te schrijven."}`,
  );
  process.exit(0);
}

main();
