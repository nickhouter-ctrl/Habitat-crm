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
