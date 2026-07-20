/**
 * Vaste, altijd-aanwezige BCC op ELKE uitgaande mail, ongeacht het transport
 * (Gmail SMTP, Resend-fallback of stub). Zo wordt er intern altijd meegelezen.
 * Standaard nick@habitat-one.com; te overschrijven/aan te vullen via env
 * EMAIL_BCC_ALWAYS (komma-gescheiden). Bewust in een los, dependency-vrij module
 * zodat zowel lib/gmail.ts als lib/email.ts het kunnen importeren zonder
 * nodemailer/imap eager te laden.
 */
export const ALWAYS_BCC = (process.env.EMAIL_BCC_ALWAYS?.trim() || "nick@habitat-one.com")
  .split(",")
  .map((a) => a.trim())
  .filter(Boolean);

/**
 * Ontvangers van INTERNE meldingen (accountaanvragen, offerte-aanvragen,
 * team-notificaties): standaard hi@ + nick@, zodat beide de melding krijgen.
 * Te overschrijven via env NOTIFY_EMAILS (komma-gescheiden) of NOTIFY_EMAIL
 * (enkel adres). Als `to` wordt hier het EERSTE adres gebruikt; de rest komt
 * via de vaste BCC binnen (nick@ zit sowieso in ALWAYS_BCC).
 */
export const NOTIFY_RECIPIENTS = (
  process.env.NOTIFY_EMAILS?.trim() ||
  process.env.NOTIFY_EMAIL?.trim() ||
  "hi@habitat-one.com, nick@habitat-one.com"
)
  .split(",")
  .map((a) => a.trim())
  .filter(Boolean);

/** Primair meldingsadres (To). De overige ontvangers lopen via de vaste BCC. */
export const NOTIFY_TO = NOTIFY_RECIPIENTS[0] ?? "hi@habitat-one.com";

/**
 * Voegt de vaste BCC toe aan een eventueel bestaande BCC en dedupliceert
 * (case-insensitive). Laat de directe ontvanger (`to`) nooit als BCC staan.
 */
export function withMandatoryBcc(existing: string | undefined, to: string): string | undefined {
  const seen = new Set<string>();
  const out: string[] = [];
  const toLower = to.toLowerCase();
  for (const addr of [...(existing?.split(",") ?? []), ...ALWAYS_BCC]) {
    const a = addr.trim();
    if (!a) continue;
    const low = a.toLowerCase();
    if (low === toLower || seen.has(low)) continue;
    seen.add(low);
    out.push(a);
  }
  return out.length ? out.join(", ") : undefined;
}
