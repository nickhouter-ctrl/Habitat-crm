/**
 * Cron job: poll IMAP voor nieuwe mails en schrijf ze naar email_inbox.
 *
 * Beveiliging: alleen Vercel Cron mag deze route triggeren (header check).
 * Lokaal kun je 'm handmatig hitten zonder header.
 */
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { emailInbox, emailSyncState, mailAttachments } from "@/lib/db/schema";
import { autoLinkEmail } from "@/lib/auto-link";
import { tryAutoCreatePurchaseInvoice } from "@/lib/auto-purchase-invoice";
import { extractAttachmentAmount } from "@/lib/amount-extract";
import { storeMailAttachments } from "@/lib/email-attachments";
import { fetchNewMails } from "@/lib/gmail";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  // Beveiliging: in productie alleen Vercel Cron (header authorization)
  const auth = req.headers.get("authorization");
  if (process.env.NODE_ENV === "production" && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    // Lees huidige sync-state (UID waar we vorige keer mee stopten)
    const stateRows = await db.select().from(emailSyncState).limit(1);
    const sinceUid = stateRows[0]?.lastImapUid ?? 0;

    const { mails, maxUid } = await fetchNewMails(sinceUid, 100);

    let inserted = 0;
    let duplicates = 0;
    let attachmentsStored = 0;
    let invoicesAutoCreated = 0;
    let invoicesNeedReview = 0;
    for (const m of mails) {
      try {
        // Eerst email-row maken (alleen metadata, geen content)
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
        inserted++;

        // Upload bijlagen naar Storage + categoriseer
        if (m.attachments.length > 0 && row?.id) {
          try {
            const r = await storeMailAttachments({ emailId: row.id, mail: m });
            attachmentsStored += r.stored;

            // Auto-extract bedragen voor net geuploade attachments
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

        // Auto-link aan PO op basis van shipment-ref
        if (row?.id) {
          try {
            await autoLinkEmail(row.id);
          } catch (e: any) {
            console.error(`Auto-link fail voor ${m.subject}:`, e?.message);
          }

          // Auto-aanmaak inkoopfactuur als er een financiële bijlage is
          try {
            const r = await tryAutoCreatePurchaseInvoice(row.id);
            invoicesAutoCreated += r.created;
            invoicesNeedReview += r.needsReview;
          } catch (e: any) {
            console.error(`Auto-invoice fail voor ${m.subject}:`, e?.message);
          }
        }
      } catch (e: any) {
        if (e?.code === "23505") {
          duplicates++;
        } else {
          throw e;
        }
      }
    }

    // Update sync-state
    await db
      .insert(emailSyncState)
      .values({
        id: "singleton",
        lastImapUid: maxUid,
        lastPolledAt: new Date(),
        errorMessage: null,
      })
      .onConflictDoUpdate({
        target: emailSyncState.id,
        set: {
          lastImapUid: maxUid,
          lastPolledAt: new Date(),
          errorMessage: null,
          updatedAt: new Date(),
        },
      });

    return NextResponse.json({
      ok: true,
      sinceUid,
      maxUid,
      fetched: mails.length,
      inserted,
      duplicates,
      attachmentsStored,
      invoicesAutoCreated,
      invoicesNeedReview,
    });
  } catch (e: any) {
    // Log error in state-tabel zodat we 't kunnen zien in /inbox
    await db
      .insert(emailSyncState)
      .values({
        id: "singleton",
        lastImapUid: 0,
        lastPolledAt: new Date(),
        errorMessage: String(e?.message ?? e),
      })
      .onConflictDoUpdate({
        target: emailSyncState.id,
        set: {
          lastPolledAt: new Date(),
          errorMessage: String(e?.message ?? e),
          updatedAt: new Date(),
        },
      })
      .catch(() => {});

    return NextResponse.json(
      { ok: false, error: String(e?.message ?? e) },
      { status: 500 },
    );
  }
}
