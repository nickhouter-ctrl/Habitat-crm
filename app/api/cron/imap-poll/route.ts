/**
 * Cron job: poll IMAP voor nieuwe mails en schrijf ze naar email_inbox.
 *
 * Beveiliging: alleen Vercel Cron mag deze route triggeren (header check).
 * Lokaal kun je 'm handmatig hitten zonder header.
 */
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { emailInbox, emailSyncState } from "@/lib/db/schema";
import { storeMailAttachments } from "@/lib/email-attachments";
import { fetchNewMails } from "@/lib/gmail";

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
          } catch (e: any) {
            console.error(`Attachment store fail voor ${m.subject}:`, e?.message);
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
