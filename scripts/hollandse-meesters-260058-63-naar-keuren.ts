/**
 * Zet de Hollandse-Meesters-facturen van Piet (mail 26-08-2026 aan purchase@,
 * "facturen 260058 , 260060 , 260061 , 260062 en 260063") alsnog in de
 * keurwachtrij — 01-09-2026.
 *
 * Waarom ze bleven liggen: de indeler-regel voor Piter Hoogendijk eiste het
 * woord "factuur"/"inkoop"/"invoice" in onderwerp of tekst, maar Piet schreef
 * "facturen" (meervoud) en dat viel buiten \bfact(uu)?r\b; de bestandsnamen
 * ("habitat One fact 260063.pdf") deden niet mee. Alle 7 bijlagen kregen
 * categorie "other" en de goedkeuringspoort slaat "other" over. De regel is
 * verruimd (lib/email-attachments.ts); dit script haalt déze mail op — het
 * bredere inhaalscript (bouwersfacturen-naar-keuren.ts) slaat gearchiveerde
 * mails over, en deze mail is gearchiveerd.
 *
 * Idempotent: upsertInvoiceReview dedupet per bijlage, en al bestaande
 * keurregels/inkooporders worden door de intake zelf herkend.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/hollandse-meesters-260058-63-naar-keuren.ts --dry
 */
import "./load-env";

import { eq } from "drizzle-orm";

import { tryAutoCreatePurchaseInvoice } from "../lib/auto-purchase-invoice";
import { db, pgClient } from "../lib/db";
import { detectCategory } from "../lib/email-attachments";
import { FINANCIAL_CATEGORIES } from "../lib/purchase-invoice-intake";
import { emailInbox, mailAttachments } from "../lib/db/schema";

const MAIL_ID = "25dc8ad8-cf00-44bc-a134-bfb8b207b6c9";

async function main() {
  const dry = process.argv.includes("--dry");

  const mail = await db.query.emailInbox.findFirst({ where: eq(emailInbox.id, MAIL_ID) });
  if (!mail) throw new Error("mail niet gevonden");
  console.log(`Mail: ${mail.subject} · van ${mail.fromEmail} · status ${mail.status}\n`);

  /* ── 1. Hercategoriseren met de verruimde regel ──────────────────────── */
  const atts = await db.select().from(mailAttachments).where(eq(mailAttachments.emailId, MAIL_ID));
  for (const a of atts) {
    const nieuw = detectCategory({
      filename: a.filename,
      contentType: a.contentType ?? "",
      fromEmail: mail.fromEmail ?? "",
      fromName: mail.fromName ?? "",
      subject: mail.subject ?? "",
      allText: `${mail.subject ?? ""} ${mail.bodyText ?? ""}`,
    });
    const financieel = (FINANCIAL_CATEGORIES as readonly string[]).includes(nieuw);
    // Alleen ophogen van "other" naar financieel — nooit een bewuste indeling
    // overschrijven.
    if (a.category === "other" && financieel && nieuw !== a.category) {
      console.log(`  ${a.filename.slice(0, 55).padEnd(55)} other → ${nieuw}`);
      if (!dry) {
        await db.update(mailAttachments).set({ category: nieuw }).where(eq(mailAttachments.id, a.id));
      }
    } else {
      console.log(`  ${a.filename.slice(0, 55).padEnd(55)} blijft ${a.category}`);
    }
  }

  /* ── 2. De normale intake voor deze mail draaien ─────────────────────── */
  if (dry) {
    console.log("\n[DRY RUN] intake niet gedraaid.");
  } else {
    const res = await tryAutoCreatePurchaseInvoice(MAIL_ID);
    console.log(`\n${res.created} keurkaart(en) aangemaakt/bijgewerkt.`);
    if (res.errors.length) {
      console.log(`${res.errors.length} fout(en):`);
      for (const e of res.errors) console.log(`  ${e}`);
    }
  }

  await pgClient.end();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
