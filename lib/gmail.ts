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
  // .trim() op de user: een stray newline in de env-var breekt de IMAP-login
  // (newline = commando-einde in het IMAP-protocol) én de SMTP From-header.
  const user = process.env.GMAIL_USER?.trim();
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, "");
  if (!user || !pass) throw new Error("GMAIL_USER en/of GMAIL_APP_PASSWORD niet gezet.");
  return { user, pass };
}

/** Eén Gmail-postvak: e-mailadres + app-wachtwoord. */
export type MailAccount = { user: string; pass: string };

/**
 * Alle Gmail-postvakken die het CRM moet pollen: hi@ (hoofdaccount) en —
 * indien geconfigureerd — purchase@ (apart account). Wachtwoorden zijn
 * Gmail app-wachtwoorden.
 */
export function getMailAccounts(): MailAccount[] {
  const accounts: MailAccount[] = [];
  // .trim() op de user — een stray newline in de env-var breekt de IMAP-login.
  const user = process.env.GMAIL_USER?.trim();
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, "");
  if (user && pass) accounts.push({ user, pass });
  const pUser = process.env.GMAIL_PURCHASE_USER?.trim();
  const pPass = process.env.GMAIL_PURCHASE_APP_PASSWORD?.replace(/\s/g, "");
  if (pUser && pPass) accounts.push({ user: pUser, pass: pPass });
  if (accounts.length === 0) {
    throw new Error("Geen Gmail-account geconfigureerd (GMAIL_USER / GMAIL_APP_PASSWORD).");
  }
  return accounts;
}

/** Maak een IMAP-client. Caller moet zelf connect() + logout() doen. */
export function createImapClient(account?: MailAccount): ImapFlow {
  const { user, pass } = account ?? getCreds();
  return new ImapFlow({
    host: HOST_IMAP,
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false,
    // Faal snel bij een trage/geweigerde verbinding. ImapFlow wacht standaard
    // 90s — langer dan de serverless-tijdslimiet (60s), waardoor de hele poll-
    // functie zou vastlopen i.p.v. de fout netjes af te handelen.
    connectionTimeout: 20000,
    greetingTimeout: 12000,
    socketTimeout: 30000,
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

/** Postgres' text-kolom accepteert geen NUL-bytes — strip ze uit geparseerde tekst. */
function clean(s: string | null | undefined): string | null {
  if (s == null) return null;
  return s.replace(/\u0000/g, "");
}

/** Vind de Gmail "Alle e-mail"-map (special-use \All) — bevat óók gearchiveerde mail. */
async function findAllMailFolder(client: ImapFlow): Promise<string> {
  const list = await client.list();
  const all = list.find((mb) => mb.specialUse === "\\All");
  return all?.path ?? "[Gmail]/All Mail";
}

/** De inkoop-mailbox; mail hiernaartoe halen we altijd op, ook als wij 'm zelf stuurden. */
const PURCHASE_INBOX = "purchase@habitat-one.com";

/** Is deze mail (volgens envelope) aan de purchase-inbox geadresseerd? */
function envelopeToPurchase(env: FetchMessageObject["envelope"]): boolean {
  const recipients = [...(env?.to ?? []), ...(env?.cc ?? [])];
  return recipients.some((a) => (a.address ?? "").toLowerCase().includes(PURCHASE_INBOX));
}

/**
 * Haal nieuwe mails op sinds UID `sinceUid` (exclusief). Returns geparseerde mails.
 *
 * Pollt de "Alle e-mail"-map i.p.v. INBOX, zodat ook mail die door een Gmail-
 * filter is gearchiveerd (bv. naar purchase@ gestuurde mail die de inbox
 * overslaat) wordt opgehaald. Verzonden mail en concepten — die ook in
 * "Alle e-mail" zitten — worden overgeslagen op basis van hun Gmail-labels.
 *
 * Beperkt tot `limit` om geheugen-gebruik te beperken.
 */
export async function fetchNewMails(
  sinceUid: number,
  limit = 50,
  account?: MailAccount,
): Promise<{ mails: ParsedEmail[]; maxUid: number }> {
  const client = createImapClient(account);
  await client.connect();
  let lock: MailboxLockObject | null = null;
  try {
    const folder = await findAllMailFolder(client);
    lock = await client.getMailboxLock(folder);
    const status = await client.mailboxOpen(folder);
    const mails: ParsedEmail[] = [];
    let maxUid = sinceUid;

    if (status.exists === 0) return { mails, maxUid };

    // UID-range: sinceUid+1 t/m * (alles tot eind)
    const range = `${sinceUid + 1}:*`;
    const generator = client.fetch(
      range,
      { uid: true, envelope: true, source: true, threadId: true, labels: true },
      { uid: true },
    );

    let count = 0;
    for await (const msg of generator as AsyncIterable<FetchMessageObject>) {
      if (count >= limit) break;
      if (!msg.uid || msg.uid <= sinceUid) continue;
      // "Alle e-mail" bevat ook verzonden mail + concepten. Concepten en
      // gewone verzonden mail slaan we over — maar mail die wij zelf naar
      // purchase@ doorsturen moet juist wél in de inbox komen.
      const labels = msg.labels;
      const skip =
        !!labels?.has("\\Draft") ||
        (!!labels?.has("\\Sent") && !envelopeToPurchase(msg.envelope));
      if (skip) {
        if (msg.uid > maxUid) maxUid = msg.uid;
        continue;
      }
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
        messageId: clean(parsed.messageId ?? msg.envelope?.messageId) ?? `imap-uid-${msg.uid}`,
        imapUid: msg.uid,
        threadId: msg.threadId ?? null,
        fromEmail: clean(parsed.from?.value?.[0]?.address),
        fromName: clean(parsed.from?.value?.[0]?.name),
        toEmail: clean(joinAddresses(parsed.to)),
        ccEmail: clean(joinAddresses(parsed.cc)),
        subject: clean(parsed.subject),
        bodyText: clean(parsed.text),
        bodyHtml: clean(typeof parsed.html === "string" ? parsed.html : null),
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
