/**
 * Standaard bedrijfskopie. Persoonlijke inlogmails en expliciete kopieafspraken
 * gebruiken hun eigen ontvangers; die krijgen deze BCC niet.
 */
export const COMPANY_INBOX = "hi@habitat-one.com";

/** Beursmails: deze twee collega's krijgen een zichtbare kopie. */
export const NICK_FREDERIQUE = ["nick@habitat-one.com", "frederique@habitat-one.com"] as const;

/**
 * Wie er zichtbaar in de CC staat van persoonlijke klantmail.
 *
 * `"nick-frederique"` was de oorspronkelijke afspraak voor beursmail.
 * `"team"` is breder: iedereen die klantcontact opvolgt, plús degene die de
 * mail verstuurt. Dat laatste is de kern — antwoordt de klant met "allen
 * beantwoorden", dan komt dat antwoord rechtstreeks bij de afzender binnen en
 * niet alleen in het gedeelde postvak.
 */
export type MailCopyPolicy = "nick-frederique" | "team";

/** De adressen uit `to` — ook in de vorm `Naam <adres>`. */
function adressenUit(waarde: string): Set<string> {
  return new Set(waarde.split(",").map((a) => (a.match(/<([^<>]+)>/)?.[1] ?? a).trim().toLowerCase()));
}

/**
 * De zichtbare kopie bij een kopieafspraak. `afzender` is het adres van degene
 * die op versturen drukte; die hoort erbij, ook als hij niet in de vaste lijst
 * staat (Hans, Elles).
 */
export function copyPolicyCc(policy: MailCopyPolicy, to: string, afzender?: string | null): string | undefined {
  const direct = adressenUit(to);
  const lijst = policy === "team" ? [...TEAM_CC, ...(afzender ? [afzender.trim()] : [])] : [...NICK_FREDERIQUE];
  const gezien = new Set<string>();
  return (
    lijst
      .filter((a) => {
        const laag = a.toLowerCase();
        if (!a || direct.has(laag) || gezien.has(laag)) return false;
        gezien.add(laag);
        return true;
      })
      .join(", ") || undefined
  );
}

/** Oude naam, nog in gebruik op plekken die alleen die twee willen. */
export function nickFrederiqueCc(to: string): string | undefined {
  return copyPolicyCc("nick-frederique", to);
}

/**
 * Vaste, altijd-aanwezige BCC op ELKE uitgaande mail, ongeacht het transport
 * (Gmail SMTP, Resend-fallback of stub). Zo wordt er intern altijd meegelezen.
 * Bevat standaard nick@habitat-one.com (aan te vullen/overschrijven via env
 * EMAIL_BCC_ALWAYS, komma-gescheiden) én ALTIJD het bedrijfsadres hi@ — ook als
 * de env is overschreven. Bewust in een los, dependency-vrij module zodat zowel
 * lib/gmail.ts als lib/email.ts het kunnen importeren zonder nodemailer/imap
 * eager te laden.
 */
export const ALWAYS_BCC = (() => {
  const configured = (process.env.EMAIL_BCC_ALWAYS?.trim() || "nick@habitat-one.com, frederique@habitat-one.com")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
  // hi@ leest altijd mee — dedup case-insensitive, volgorde behouden.
  const seen = new Set<string>();
  return [...configured, COMPANY_INBOX].filter((a) => {
    const low = a.toLowerCase();
    if (seen.has(low)) return false;
    seen.add(low);
    return true;
  });
})();

/**
 * De bredere kring die klantcorrespondentie meeleest: Mourad en Teresa krijgen
 * een kopie van wat er naar klanten uitgaat, zodat zij meekijken en kunnen
 * antwoorden.
 *
 * Bewust náást ALWAYS_BCC en niet erin: interne controlemails (de dagelijkse
 * data-check, de weekcontrole) gaan niet naar deze kring — dat is werk van
 * kantoor, geen klantcontact. Die mails vragen om `interneMelding`.
 *
 * Aan te passen via env EMAIL_BCC_TEAM (komma-gescheiden).
 */
export const TEAM_BCC = (process.env.EMAIL_BCC_TEAM?.trim() || "mourad.h@habitat-one.com, teresa@habitat-one.com")
  .split(",")
  .map((a) => a.trim())
  .filter(Boolean);

/** Alle adressen in de zichtbare kopie bij `"team"`, in een vaste volgorde. */
export const TEAM_CC = [...NICK_FREDERIQUE, ...TEAM_BCC];

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
  "hi@habitat-one.com, nick@habitat-one.com, frederique@habitat-one.com"
)
  .split(",")
  .map((a) => a.trim())
  .filter(Boolean);

/** Primair meldingsadres (To). De overige ontvangers lopen via de vaste BCC. */
export const NOTIFY_TO = NOTIFY_RECIPIENTS[0] ?? "hi@habitat-one.com";

/**
 * Voegt de vaste BCC toe aan een eventueel bestaande BCC en dedupliceert
 * (case-insensitive). Laat de directe ontvanger (`to`) nooit als BCC staan.
 *
 * `interneMelding` houdt de bredere kring (TEAM_BCC) erbuiten: de dagelijkse
 * data-check en de weekcontrole zijn kantoorwerk, geen klantcontact.
 */
export function withMandatoryBcc(existing: string | undefined, to: string, interneMelding = false): string | undefined {
  const seen = new Set<string>();
  const out: string[] = [];
  const toLower = to.toLowerCase();
  for (const addr of [...(existing?.split(",") ?? []), ...ALWAYS_BCC, ...(interneMelding ? [] : TEAM_BCC)]) {
    const a = addr.trim();
    if (!a) continue;
    const low = a.toLowerCase();
    if (low === toLower || seen.has(low)) continue;
    seen.add(low);
    out.push(a);
  }
  return out.length ? out.join(", ") : undefined;
}
