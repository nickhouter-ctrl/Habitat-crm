/**
 * Standaard bedrijfskopie. Persoonlijke inlogmails en expliciete kopieafspraken
 * gebruiken hun eigen ontvangers; die krijgen deze BCC niet.
 */
export const COMPANY_INBOX = "hi@habitat-one.com";

/** Beursmails: deze twee collega's krijgen een zichtbare kopie. */
export const NICK_FREDERIQUE = ["nick@habitat-one.com", "frederique@habitat-one.com"] as const;

/** Systeemmeldingen gaan uitsluitend naar deze vijf persoonlijke adressen. */
export const SYSTEM_MAIL_RECIPIENTS = [
  ...NICK_FREDERIQUE,
  "hans@habitat-one.com",
  "teresa@habitat-one.com",
  "mourad.h@habitat-one.com",
] as const;

/** Bedrijfscontroles en projectinformatie horen uitsluitend bij kantoor. */
export const OFFICE_MAIL_RECIPIENTS = [...NICK_FREDERIQUE, "hans@habitat-one.com"] as const;
export type SystemMailScope = "office" | "team";

export function isOfficeMailRecipient(address: string): boolean {
  const email = (address.match(/<([^<>]+)>/)?.[1] ?? address).trim().toLowerCase();
  return OFFICE_MAIL_RECIPIENTS.some(allowed => allowed === email);
}

export function isSystemMailRecipient(address: string): boolean {
  const email = (address.match(/<([^<>]+)>/)?.[1] ?? address).trim().toLowerCase();
  return SYSTEM_MAIL_RECIPIENTS.some(allowed => allowed === email);
}

/** Ook displaynamen en expliciete kopieën worden gefilterd. */
export function systemMailAddresses(addresses: string | undefined, scope: SystemMailScope = "team"): string | undefined {
  const seen = new Set<string>();
  return addresses?.split(",").map(address => address.trim()).filter(address => {
    const email = (address.match(/<([^<>]+)>/)?.[1] ?? address).trim().toLowerCase();
    if (!(scope === "office" ? isOfficeMailRecipient(address) : isSystemMailRecipient(address)) || seen.has(email)) return false;
    seen.add(email);
    return true;
  }).join(", ") || undefined;
}

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
 * Vaste BCC op algemene uitgaande klantmail, ongeacht het transport
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
 * De bredere kring voor expliciet gekozen teamkopieën bij klantopvolging.
 * Mourad en Teresa krijgen geen automatische kopie van algemene klant-,
 * document- of projectmail.
 *
 * Bewust náást ALWAYS_BCC en niet erin: interne controlemails (de dagelijkse
 * data-check, de weekcontrole) gaan niet naar deze kring — dat is werk van
 * kantoor, geen klantcontact. Die mails vragen om `interneMelding` met
 * de standaard scope `office`.
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
 * Algemene systeemmeldingen gaan naar kantoor. Oudere env-
 * instellingen kunnen hi@ of andere ontvangers niet opnieuw toevoegen.
 * Persoonlijke taakmails gebruiken uitsluitend hun eigen ontvanger.
 */
export const NOTIFY_RECIPIENTS = [...OFFICE_MAIL_RECIPIENTS];

/** Primair meldingsadres (To). De overige ontvangers lopen via de vaste BCC. */
export const NOTIFY_TO = NOTIFY_RECIPIENTS[0];

/**
 * Voegt de vaste kantoorkopie toe aan een eventueel bestaande BCC en dedupliceert
 * (case-insensitive). Laat de directe ontvanger (`to`) nooit als BCC staan.
 *
 * Algemene document- en projectmail krijgt geen automatische kopie aan Mourad
 * of Teresa. Persoonlijke klantopvolging kan expliciet de teamkopie kiezen.
 * Interne bedrijfscontroles zijn in To, CC en BCC beperkt tot kantoor.
 */
export function withMandatoryBcc(existing: string | undefined, to: string, interneMelding = false): string | undefined {
  const seen = new Set<string>();
  const out: string[] = [];
  const direct = adressenUit(to);
  for (const addr of [...(existing?.split(",") ?? []), ...ALWAYS_BCC]) {
    const a = addr.trim();
    if (!a) continue;
    const low = a.toLowerCase();
    if (direct.has(low) || seen.has(low) || (interneMelding && !isOfficeMailRecipient(a))) continue;
    seen.add(low);
    out.push(a);
  }
  return out.length ? out.join(", ") : undefined;
}
