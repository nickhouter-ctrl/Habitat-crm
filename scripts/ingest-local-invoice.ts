/**
 * Zet een inkoopfactuur die NIET via de mail binnenkwam in de keur-wachtrij.
 *
 * Nodig omdat facturen ook op papier, via WhatsApp of met de hand worden
 * aangeleverd. De wachtrij hangt aan `mail_attachments`, dus die factuur krijgt
 * een inbox-regel met een eigen Message-ID (`local-...@habitat-one.com`) en
 * `to_email = purchase@`, zodat hij verder exact dezelfde weg loopt als een
 * gemailde factuur: uitlezen → controleren → koppelen → goedkeuren.
 *
 * Het verzonnen Message-ID kan nooit met een echte mail botsen (de prefix zit
 * in geen enkele echte header), dus de dedupe blijft heel: mailt de leverancier
 * dezelfde factuur later alsnog, dan valt dat op via de referentie-dubbelcheck.
 *
 *   npx tsx scripts/ingest-local-invoice.ts [--from a@b.c] [--notify] <bestand...>
 *
 * Zonder --notify blijft het bij de wachtrij; met --notify gaat de meldingsmail
 * naar INVOICE_NOTIFY_EMAILS (nick@ + hans@).
 */
import "./load-env";

import { basename, extname } from "node:path";
import { readFile, stat } from "node:fs/promises";

import { eq } from "drizzle-orm";

import { db } from "../lib/db";
import { emailInbox, mailAttachments } from "../lib/db/schema";
import { storeMailAttachments } from "../lib/email-attachments";
import { buildInvoiceProposal, upsertInvoiceReview } from "../lib/purchase-invoice-intake";
import { notifyNewInvoiceReviews } from "../lib/purchase-invoice-notify";

const CONTENT_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

async function main() {
  const argv = process.argv.slice(2);
  const notify = argv.includes("--notify");
  const fromIdx = argv.indexOf("--from");
  const fromEmail = fromIdx >= 0 ? argv[fromIdx + 1] : null;
  const files = argv.filter((a, i) => !a.startsWith("--") && i !== fromIdx + 1);

  if (files.length === 0) {
    console.error("Geef één of meer bestanden op.\n  npx tsx scripts/ingest-local-invoice.ts [--from a@b.c] [--notify] <bestand...>");
    process.exit(1);
  }

  const attachments = [];
  for (const f of files) {
    const info = await stat(f).catch(() => null);
    if (!info?.isFile()) {
      console.error(`  overgeslagen (niet gevonden): ${f}`);
      continue;
    }
    const name = basename(f);
    attachments.push({
      filename: name,
      size: info.size,
      contentType: CONTENT_TYPES[extname(name).toLowerCase()] ?? "application/octet-stream",
      content: await readFile(f),
    });
  }
  if (attachments.length === 0) process.exit(1);

  const stamp = new Date().toISOString().replace(/[^\d]/g, "");
  const messageId = `<local-${stamp}@habitat-one.com>`;
  const subject = `Handmatig aangeleverd: ${attachments.map((a) => a.filename).join(", ")}`;

  const [mailRow] = await db
    .insert(emailInbox)
    .values({
      messageId,
      threadId: null,
      referencesHeader: null,
      fromEmail: fromEmail ?? null,
      fromName: null,
      toEmail: process.env.GMAIL_PURCHASE_USER ?? "purchase@habitat-one.com",
      subject,
      bodyText: "Deze factuur is niet per mail binnengekomen maar handmatig aangeleverd.",
      receivedAt: new Date(),
      status: "new",
    })
    .returning({ id: emailInbox.id });

  const res = await storeMailAttachments({
    emailId: mailRow.id,
    // storeMailAttachments gebruikt alleen afzender/onderwerp voor de categorie
    // en de bijlagen zelf; de rest van ParsedEmail blijft leeg.
    mail: {
      messageId,
      imapUid: 0,
      threadId: null,
      referencesHeader: null,
      fromEmail,
      fromName: null,
      toEmail: null,
      ccEmail: null,
      subject,
      bodyText: null,
      bodyHtml: null,
      receivedAt: new Date(),
      attachments,
    },
  });
  console.log(`Inbox-regel ${mailRow.id} · ${res.stored} bijlage(n) opgeslagen, ${res.skipped} overgeslagen`);

  const stored = await db
    .select({ id: mailAttachments.id, filename: mailAttachments.filename, category: mailAttachments.category })
    .from(mailAttachments)
    .where(eq(mailAttachments.emailId, mailRow.id));

  const reviewIds: string[] = [];
  for (const att of stored) {
    const proposal = await buildInvoiceProposal({ emailId: mailRow.id, attachmentId: att.id });
    if (!proposal) {
      console.log(`  ${att.filename}: geen voorstel (bijlage of mail niet gevonden)`);
      continue;
    }
    const reviewId = await upsertInvoiceReview(proposal, "manual");
    reviewIds.push(reviewId);
    console.log(
      `  ${att.filename}: ${proposal.supplier ?? "leverancier?"} · ${proposal.reference ?? "geen ref"} · ` +
        `${proposal.total != null ? `€${proposal.total.toFixed(2)}` : "bedrag?"} · oordeel ${proposal.verdict.status}` +
        `${proposal.projectId ? " · project herkend" : " · geen project"}` +
        `${proposal.hours != null ? ` · ${proposal.hours} uur${proposal.hoursDerivedFrom ? " (terugberekend)" : ""}` : ""}`,
    );
    for (const c of proposal.verdict.checks.filter((f) => !f.ok && !f.skipped)) {
      console.log(`      ${c.severity === "blocking" ? "✗" : "!"} ${c.label}`);
    }
  }

  if (notify && reviewIds.length) {
    const sent = await notifyNewInvoiceReviews(reviewIds);
    console.log(sent.sent ? `Melding verstuurd voor ${sent.count} factuur(en).` : "Melding NIET verstuurd (geen ontvangers of mail uit).");
  } else if (reviewIds.length) {
    console.log(`${reviewIds.length} factuur/facturen staan in de wachtrij. Gebruik --notify voor de meldingsmail.`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
