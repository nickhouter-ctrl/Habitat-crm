/**
 * IMAP-poll: haal nieuwe mails op via Gmail en schrijf ze naar email_inbox.
 *
 * Pollt álle geconfigureerde postvakken (hi@ + evt. purchase@), elk met een
 * eigen sync-cursor in email_sync_state (id = het e-mailadres van het postvak).
 * Gedeeld door de cron-route (app/api/cron/imap-poll) én de "Mails ophalen"-
 * knop op /inbox.
 */
import { eq } from "drizzle-orm";

import { extractAttachmentAmount } from "@/lib/amount-extract";
import { autoLinkEmail } from "@/lib/auto-link";
import { tryAutoCreatePurchaseInvoice } from "@/lib/auto-purchase-invoice";
import { db } from "@/lib/db";
import { emailInbox, emailSyncState, mailAttachments } from "@/lib/db/schema";
import { storeMailAttachments } from "@/lib/email-attachments";
import { fetchNewMails, getMailAccounts, type MailAccount, type ParsedEmail } from "@/lib/gmail";

export type ImapPollResult = {
  ok: boolean;
  fetched?: number;
  inserted?: number;
  duplicates?: number;
  failed?: number;
  attachmentsStored?: number;
  invoicesAutoCreated?: number;
  invoicesNeedReview?: number;
  error?: string;
};

type IngestStats = {
  inserted: number;
  duplicates: number;
  failed: number;
  attachmentsStored: number;
  invoicesAutoCreated: number;
  invoicesNeedReview: number;
  /** Laagste UID van een mislukte (niet-duplicate) mail — cursor mag hier niet voorbij. */
  firstFailedUid: number | null;
};

/** Verwerk geparseerde mails: opslaan, bijlagen, bedrag-extractie, auto-link, auto-factuur. */
export async function ingestMails(mails: ParsedEmail[]): Promise<IngestStats> {
  const s: IngestStats = {
    inserted: 0, duplicates: 0, failed: 0,
    attachmentsStored: 0, invoicesAutoCreated: 0, invoicesNeedReview: 0,
    firstFailedUid: null,
  };
  for (const m of mails) {
    try {
      const [row] = await db
        .insert(emailInbox)
        .values({
          messageId: m.messageId,
          imapUid: m.imapUid,
          threadId: m.threadId,
          fromEmail: m.fromEmail,
          fromName: m.fromName,
          toEmail: m.toEmail,
          ccEmail: m.ccEmail,
          subject: m.subject,
          bodyText: m.bodyText,
          bodyHtml: m.bodyHtml,
          receivedAt: m.receivedAt,
          attachments: m.attachments.map((a) => ({
            filename: a.filename,
            size: a.size,
            contentType: a.contentType,
          })),
          status: "new",
        })
        .returning({ id: emailInbox.id });
      s.inserted++;

      // Upload bijlagen naar Storage + categoriseer + bedrag-extractie
      if (m.attachments.length > 0 && row?.id) {
        try {
          const r = await storeMailAttachments({ emailId: row.id, mail: m });
          s.attachmentsStored += r.stored;

          const newAtts = await db
            .select()
            .from(mailAttachments)
            .where(eq(mailAttachments.emailId, row.id));
          for (const a of newAtts) {
            if (a.amountEur) continue;
            try {
              const amt = await extractAttachmentAmount({
                storagePath: a.storagePath,
                filename: a.filename,
                contentType: a.contentType ?? "",
              });
              if (amt != null) {
                await db
                  .update(mailAttachments)
                  .set({ amountEur: String(amt) })
                  .where(eq(mailAttachments.id, a.id));
              }
            } catch (e: any) {
              console.error(`Amount-extract fail voor ${a.filename}:`, e?.message);
            }
          }
        } catch (e: any) {
          console.error(`Attachment store fail voor ${m.subject}:`, e?.message);
        }
      }

      // Auto-link aan PO + auto-aanmaak inkoopfactuur
      if (row?.id) {
        try {
          await autoLinkEmail(row.id);
        } catch (e: any) {
          console.error(`Auto-link fail voor ${m.subject}:`, e?.message);
        }
        try {
          const r = await tryAutoCreatePurchaseInvoice(row.id);
          s.invoicesAutoCreated += r.created;
          s.invoicesNeedReview += r.needsReview;
        } catch (e: any) {
          console.error(`Auto-invoice fail voor ${m.subject}:`, e?.message);
        }
      }
    } catch (e: any) {
      // Drizzle wikkelt de Postgres-fout — code kan op e of e.cause zitten.
      const pgCode = e?.code ?? e?.cause?.code;
      if (pgCode === "23505") {
        s.duplicates++; // mail bestaat al (messageId-uniek)
      } else {
        // Eén kapotte mail mag de hele poll niet stoppen — log en ga door.
        // Onthoud de laagste mislukte UID zodat de cursor er niet voorbij schuift
        // (anders zou deze mail nooit meer opnieuw opgehaald worden).
        s.failed++;
        if (m.imapUid && (s.firstFailedUid === null || m.imapUid < s.firstFailedUid)) {
          s.firstFailedUid = m.imapUid;
        }
        console.error(`Mail overgeslagen (${m.messageId}):`, e?.cause?.message ?? e?.message ?? e);
      }
    }
  }
  return s;
}

/** Poll één Gmail-postvak en verwerk de nieuwe mail. */
async function pollOneMailbox(account: MailAccount): Promise<IngestStats & { fetched: number }> {
  const stateId = account.user;
  const stateRows = await db
    .select()
    .from(emailSyncState)
    .where(eq(emailSyncState.id, stateId))
    .limit(1);
  const sinceUid = stateRows[0]?.lastImapUid ?? 0;

  const { mails, maxUid } = await fetchNewMails(sinceUid, 100, account);
  const stats = await ingestMails(mails);

  // Schuif de cursor niet voorbij een mislukte mail, anders gaat die voorgoed
  // verloren. Reeds-verwerkte mails ervoor komen als duplicaat terug (geen schade).
  const cursorUid =
    stats.firstFailedUid != null ? Math.min(maxUid, stats.firstFailedUid - 1) : maxUid;

  await db
    .insert(emailSyncState)
    .values({ id: stateId, lastImapUid: cursorUid, lastPolledAt: new Date(), errorMessage: null })
    .onConflictDoUpdate({
      target: emailSyncState.id,
      set: { lastImapUid: cursorUid, lastPolledAt: new Date(), errorMessage: null, updatedAt: new Date() },
    });

  return { ...stats, fetched: mails.length };
}

/**
 * Wrap een belofte met een harde deadline. Serverless-functies hebben een
 * tijdslimiet (60s); als een IMAP-operatie ergens blijft hangen moet de poll
 * tóch netjes terugkeren i.p.v. de hele functie te laten time-outen (504).
 */
function withDeadline<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label}: time-out na ${Math.round(ms / 1000)}s`)),
      ms,
    );
  });
  return Promise.race([p, deadline]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/** Poll alle geconfigureerde postvakken. Een fout in één postvak stopt de andere niet. */
export async function runImapPoll(): Promise<ImapPollResult> {
  const totals = {
    fetched: 0, inserted: 0, duplicates: 0, failed: 0,
    attachmentsStored: 0, invoicesAutoCreated: 0, invoicesNeedReview: 0,
  };
  const errors: string[] = [];

  let accounts: MailAccount[];
  try {
    accounts = getMailAccounts();
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }

  // Verdeel een totaalbudget van 48s over de postvakken — ruim binnen de 60s
  // serverless-limiet, ook als een postvak vastloopt.
  const budgetMs = Math.floor(48_000 / accounts.length);

  for (const account of accounts) {
    try {
      const r = await withDeadline(pollOneMailbox(account), budgetMs, account.user);
      totals.fetched += r.fetched;
      totals.inserted += r.inserted;
      totals.duplicates += r.duplicates;
      totals.failed += r.failed;
      totals.attachmentsStored += r.attachmentsStored;
      totals.invoicesAutoCreated += r.invoicesAutoCreated;
      totals.invoicesNeedReview += r.invoicesNeedReview;
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      errors.push(`${account.user}: ${msg}`);
      // Log de fout op de sync-rij van dít postvak; cursor blijft ongemoeid.
      await db
        .insert(emailSyncState)
        .values({ id: account.user, lastImapUid: 0, lastPolledAt: new Date(), errorMessage: msg })
        .onConflictDoUpdate({
          target: emailSyncState.id,
          set: { lastPolledAt: new Date(), errorMessage: msg, updatedAt: new Date() },
        })
        .catch(() => {});
    }
  }

  return {
    ok: errors.length === 0,
    ...totals,
    error: errors.length ? errors.join(" | ") : undefined,
  };
}
