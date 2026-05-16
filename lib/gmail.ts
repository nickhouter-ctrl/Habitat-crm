/**
 * Gmail helpers — IMAP poll voor inkomende mails + SMTP voor uitgaande.
 * Server-only. Vereist env: GMAIL_USER + GMAIL_APP_PASSWORD.
 */
import { ImapFlow, type MailboxLockObject, type FetchMessageObject } from "imapflow";
import { simpleParser, type ParsedMail, type AddressObject } from "mailparser";
import nodemailer, { type Transporter } from "nodemailer";

const HOST_IMAP = "imap.gmail.com";
const HOST_SMTP = "smtp.gmail.com";

function getCreds() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, "");
  if (!user || !pass) throw new Error("GMAIL_USER en/of GMAIL_APP_PASSWORD niet gezet.");
  return { user, pass };
}

/** Maak een IMAP-client. Caller moet zelf connect() + logout() doen. */
export function createImapClient(): ImapFlow {
  const { user, pass } = getCreds();
  return new ImapFlow({
    host: HOST_IMAP,
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false,
  });
}

/** Maak een SMTP-transporter (nodemailer). */
export function createSmtpTransporter(): Transporter {
  const { user, pass } = getCreds();
  return nodemailer.createTransport({
    host: HOST_SMTP,
    port: 587,
    secure: false,
    auth: { user, pass },
  });
}

export interface ParsedAttachment {
  filename: string;
  size: number;
  contentType: string;
  content: Buffer;
}

export interface ParsedEmail {
  messageId: string;
  imapUid: number;
  threadId: string | null;
  fromEmail: string | null;
  fromName: string | null;
  toEmail: string | null;
  ccEmail: string | null;
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  receivedAt: Date | null;
  attachments: ParsedAttachment[];
}

function joinAddresses(a: AddressObject | AddressObject[] | undefined): string | null {
  if (!a) return null;
  const list = Array.isArray(a) ? a : [a];
  const addrs = list.flatMap((x) => x.value.map((v) => v.address ?? "").filter(Boolean));
  return addrs.length ? addrs.join(", ") : null;
}

/**
 * Haal nieuwe mails op sinds UID `sinceUid` (exclusief). Returns geparseerde mails.
 * Beperkt tot `limit` om geheugen-gebruik te beperken.
 */
export async function fetchNewMails(
  sinceUid: number,
  limit = 50,
): Promise<{ mails: ParsedEmail[]; maxUid: number }> {
  const client = createImapClient();
  await client.connect();
  let lock: MailboxLockObject | null = null;
  try {
    lock = await client.getMailboxLock("INBOX");
    const status = await client.mailboxOpen("INBOX");
    const mails: ParsedEmail[] = [];
    let maxUid = sinceUid;

    if (status.exists === 0) return { mails, maxUid };

    // UID-range: sinceUid+1 t/m * (alles tot eind)
    const range = `${sinceUid + 1}:*`;
    const generator = client.fetch(range, { uid: true, envelope: true, source: true, threadId: true }, { uid: true });

    let count = 0;
    for await (const msg of generator as AsyncIterable<FetchMessageObject>) {
      if (count >= limit) break;
      if (!msg.uid || msg.uid <= sinceUid) continue;
      if (!msg.source) continue;
      const parsed: ParsedMail = await simpleParser(msg.source);
      const attachments: ParsedAttachment[] = (parsed.attachments ?? [])
        .filter((a) => a.filename)
        .map((a) => ({
          filename: a.filename ?? "attachment",
          size: a.size ?? 0,
          contentType: a.contentType ?? "application/octet-stream",
          content: a.content as Buffer,
        }));
      mails.push({
        messageId: parsed.messageId ?? msg.envelope?.messageId ?? `imap-uid-${msg.uid}`,
        imapUid: msg.uid,
        threadId: msg.threadId ?? null,
        fromEmail: parsed.from?.value?.[0]?.address ?? null,
        fromName: parsed.from?.value?.[0]?.name ?? null,
        toEmail: joinAddresses(parsed.to),
        ccEmail: joinAddresses(parsed.cc),
        subject: parsed.subject ?? null,
        bodyText: parsed.text ?? null,
        bodyHtml: typeof parsed.html === "string" ? parsed.html : null,
        receivedAt: parsed.date ?? null,
        attachments,
      });
      if (msg.uid > maxUid) maxUid = msg.uid;
      count++;
    }
    return { mails, maxUid };
  } finally {
    if (lock) lock.release();
    await client.logout().catch(() => {});
  }
}

/** Verstuur een mail vanuit hi@. */
export async function sendMail(args: {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
  inReplyTo?: string;
  references?: string;
}): Promise<{ messageId: string }> {
  const { user } = getCreds();
  const t = createSmtpTransporter();
  const info = await t.sendMail({
    from: `Habitat One <${user}>`,
    to: args.to,
    subject: args.subject,
    text: args.text,
    html: args.html,
    replyTo: args.replyTo,
    inReplyTo: args.inReplyTo,
    references: args.references,
  });
  return { messageId: info.messageId };
}
