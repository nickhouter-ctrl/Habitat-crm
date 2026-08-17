/**
 * Haalt bijlagen alsnog op die bij de eerste poll zijn overgeslagen — 17-08-2026.
 *
 * Waarom ze ontbreken: het opslaan gooide afbeeldingen weg op grootte (< 500 kB
 * eruit) en daarna op "ingesloten in de body". Beide sloegen echte foto's over —
 * een kiekje van een bon van 71 kB, een doorgestuurde WhatsApp-foto van 57 kB.
 * De schifting gaat nu op bestandsnaam (zie `isAutomatischeBeeldnaam`), maar
 * alles wat vóór die fix binnenkwam staat nog steeds alleen als metadata in
 * `email_inbox.attachments` — je ziet de naam en moet naar Gmail voor de inhoud.
 *
 * Dit script haalt die berichten opnieuw op via IMAP en slaat de bijlagen alsnog
 * op, met dezelfde regels als de poller.
 *
 * UID's lopen PER postvak, dus dezelfde UID bestaat in beide accounts. Daarom
 * wordt na het ophalen het Message-ID vergeleken: alleen bij een treffer horen
 * de bijlagen bij deze mail. Zonder die controle plak je zo de bijlagen van een
 * wildvreemde mail aan het verkeerde bericht.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/herstel-gemiste-bijlagen.ts --dry
 *   ... --limit 10        hooguit tien mails
 *   ... --mail <uuid>     alleen deze mail
 */
import "./load-env";

import { eq } from "drizzle-orm";

import { db, pgClient } from "../lib/db";
import { emailInbox } from "../lib/db/schema";
import { storeMailAttachments } from "../lib/email-attachments";
import { fetchMailsByUid, getMailAccounts, type ParsedEmail } from "../lib/gmail";

type Kandidaat = {
  id: string;
  message_id: string;
  imap_uid: number;
  subject: string | null;
  received_at: string;
  meta: number;
  opgeslagen: number;
};

async function main() {
  const dry = process.argv.includes("--dry");
  const limIdx = process.argv.indexOf("--limit");
  const limiet = limIdx >= 0 ? Number(process.argv[limIdx + 1]) || 0 : 0;
  const mailIdx = process.argv.indexOf("--mail");
  const enkeleMail = mailIdx >= 0 ? process.argv[mailIdx + 1] : null;

  const rijen = (await pgClient`
    select e.id, e.message_id, e.imap_uid, e.subject, e.received_at,
           jsonb_array_length(e.attachments) as meta,
           (select count(*)::int from mail_attachments a where a.email_id = e.id) as opgeslagen
    from email_inbox e
    where e.imap_uid is not null
      and jsonb_typeof(e.attachments) = 'array'
      and jsonb_array_length(e.attachments) > 0
      and (select count(*) from mail_attachments a where a.email_id = e.id) < jsonb_array_length(e.attachments)
      and (${enkeleMail}::uuid is null or e.id = ${enkeleMail}::uuid)
    order by e.received_at desc
  `) as unknown as Kandidaat[];

  const werk = limiet > 0 ? rijen.slice(0, limiet) : rijen;
  console.log(`${rijen.length} mails missen bijlagen; ${werk.length} worden opgehaald.\n`);

  const accounts = getMailAccounts();
  let hersteld = 0;
  let geenTreffer = 0;
  let nietsNieuws = 0;
  const fouten: string[] = [];

  for (const m of werk) {
    const kop = `${String(m.received_at).slice(0, 10)} ${String(m.subject ?? "(geen onderwerp)").slice(0, 48)}`;
    // Beide postvakken proberen; het Message-ID beslist welke de juiste is.
    let gevonden: ParsedEmail | null = null;
    for (const acc of accounts) {
      try {
        const [mail] = await fetchMailsByUid([m.imap_uid], acc);
        if (mail && mail.messageId === m.message_id) {
          gevonden = mail;
          break;
        }
      } catch (e) {
        fouten.push(`${kop} · ${acc.user}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (!gevonden) {
      console.log(`  geen treffer   ${kop}`);
      geenTreffer++;
      continue;
    }
    const namen = gevonden.attachments.map((a) => a.filename).join(", ");
    console.log(`  ${String(gevonden.attachments.length).padStart(2)} bijlage(n)  ${kop}\n                 ${namen.slice(0, 90)}`);
    if (dry) continue;

    try {
      const r = await storeMailAttachments({ emailId: m.id, mail: gevonden });
      if (r.stored > 0) {
        hersteld += r.stored;
        // De metadata-melding op het scherm hangt aan een lege bijlagelijst;
        // nu er echte rijen staan mag die weg.
        await db.update(emailInbox).set({ updatedAt: new Date() }).where(eq(emailInbox.id, m.id));
      } else {
        nietsNieuws++;
      }
      console.log(`                 opgeslagen: ${r.stored}, overgeslagen: ${r.skipped}`);
    } catch (e) {
      fouten.push(`${kop}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log(`\n${dry ? "[DRY RUN] " : ""}${hersteld} bijlage(n) alsnog opgeslagen.`);
  if (geenTreffer) console.log(`${geenTreffer} mail(s) niet teruggevonden in Gmail (verwijderd of ander postvak).`);
  if (nietsNieuws) console.log(`${nietsNieuws} mail(s) leverden niets op — alles viel alsnog onder de schifting.`);
  if (fouten.length) {
    console.log(`\n${fouten.length} fout(en):`);
    for (const f of fouten.slice(0, 10)) console.log(`  ${f}`);
  }
  await pgClient.end();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
