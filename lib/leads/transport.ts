/**
 * De enige plek waar campagnemail de deur uit gaat: Resend, op het
 * hoofddomein, met teresa@ als afzender.
 *
 * Waarom niet via `lib/gmail.ts` zoals de rest van het CRM:
 *
 *  - Gmail heeft een harde grens van ongeveer 500 mails per dag per postvak, en
 *    dat is hetzelfde postvak waar offertes en facturen uit gaan. Eén campagne
 *    van 7.000 adressen zou de gewone bedrijfsmail dagen plat leggen.
 *  - `lib/email.ts` kiest Gmail zodra dat is ingesteld. Voor campagnes moet die
 *    keuze niet impliciet zijn maar expliciet, en dat is precies dit bestand.
 *
 * En hier staat de belangrijkste regel van het hele verzendspoor:
 *
 *   ► NOOIT een interne bcc. ◄
 *
 * Elke gewone mail in dit CRM krijgt via `lib/mail-bcc.ts` een verborgen kopie
 * naar nick@, frederique@ en hi@ — bij gewone mail is meelezen het punt. Bij een
 * campagne van 7.000 adressen zouden dat 21.000 interne kopieën zijn, en
 * `lib/imap-poll.ts` zou ze vervolgens weer proberen in te lezen. Daarom
 * importeert dit bestand `mail-bcc` niet, en er staat een test op die faalt
 * zodra er een bcc in de payload opduikt.
 */
// Bewust géén "server-only": de controlescripts (npx tsx) draaien het verzendpad
// ook, en juist dat wil je tegen de echte database kunnen aflopen. Het blijft
// serverwerk — dit bestand hangt aan @/lib/db respectievelijk aan een
// API-sleutel, dus in een clientbundel loopt het meteen stuk.

/**
 * Slot op het verzendpad: staat `CAMPAIGN_ALLOWED_DOMAINS` gevuld, dan gaat er
 * NIETS naar een adres buiten die domeinen.
 *
 * Hier is een echte fout gemaakt die dit voorkomt. Een proefscript koos als
 * doelgroep "architecten", en dat waren niet alleen de drie testadressen maar
 * ook twee echte bureaus uit de prospectlijst — die kregen een proefmail. Een
 * bevestiging in de UI helpt daar niet tegen; een grens die het transport zelf
 * afdwingt wel. Lokaal staat deze variabele op habitat-one.com; in productie is
 * hij leeg en gaat alles gewoon de deur uit.
 */
function toegestaneDomeinen(): string[] {
  return (process.env.CAMPAIGN_ALLOWED_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

export function adresToegestaan(email: string): boolean {
  const lijst = toegestaneDomeinen();
  if (lijst.length === 0) return true;
  const domein = email.trim().toLowerCase().split("@")[1] ?? "";
  return lijst.some((d) => domein === d || domein.endsWith(`.${d}`));
}

export type BulkResultaat =
  | { ok: true; providerId: string }
  | { ok: false; opnieuw: boolean; fout: string };

const API = "https://api.resend.com/emails";

/** Afzender: naam + adres. Los instelbaar, want dit is niet hi@. */
export function bulkFrom(): string {
  return process.env.CAMPAIGN_FROM?.trim() || "Teresa · Habitat One <teresa@habitat-one.com>";
}

export function bulkReplyTo(): string {
  return process.env.CAMPAIGN_REPLY_TO?.trim() || "teresa@habitat-one.com";
}

/**
 * Staat het verzendkanaal klaar? Zo niet, dan weigert de cron te sturen in
 * plaats van stil terug te vallen op Gmail — dat laatste zou 1.000 campagnemails
 * uit hi@ laten vertrekken zonder dat iemand het merkt.
 */
export function bulkGereed(): boolean {
  return !!process.env.RESEND_API_KEY?.trim();
}

/**
 * Laatste vangnet vóór het versturen: geen bcc of cc op campagnemail. Een
 * `to`-adres van onszelf mag wel — dat is een testmail.
 */
function verbiedInterneKopie(payload: Record<string, unknown>): void {
  if ("bcc" in payload || "cc" in payload) {
    throw new Error("Campagnemail mag geen bcc of cc hebben — zie de kop van lib/leads/transport.ts.");
  }
  const headers = (payload.headers ?? {}) as Record<string, string>;
  for (const naam of Object.keys(headers)) {
    if (/^(bcc|cc)$/i.test(naam)) {
      throw new Error(`Campagnemail mag geen ${naam}-header hebben — zie lib/leads/transport.ts.`);
    }
  }
}

export interface BulkMail {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Afmeldheaders; Gmail en Outlook zetten hier hun eigen afmeldknop op. */
  headers?: Record<string, string>;
  /** Eigen kenmerk, zodat een webhook de rij terug kan vinden. */
  recipientId?: string;
}

export async function sendBulkMail(mail: BulkMail): Promise<BulkResultaat> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return { ok: false, opnieuw: false, fout: "RESEND_API_KEY ontbreekt" };
  if (!adresToegestaan(mail.to)) {
    return {
      ok: false,
      opnieuw: false,
      fout: `geblokkeerd: ${mail.to} valt buiten CAMPAIGN_ALLOWED_DOMAINS (${process.env.CAMPAIGN_ALLOWED_DOMAINS})`,
    };
  }

  const payload: Record<string, unknown> = {
    from: bulkFrom(),
    to: mail.to,
    reply_to: bulkReplyTo(),
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    headers: {
      ...(mail.headers ?? {}),
      ...(mail.recipientId ? { "X-Habitat-Recipient": mail.recipientId } : {}),
    },
  };
  verbiedInterneKopie(payload);

  let res: Response;
  try {
    res = await fetch(API, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    // Netwerkfout: het kan aan onze kant liggen, dus later opnieuw.
    return { ok: false, opnieuw: true, fout: e instanceof Error ? e.message : "netwerkfout" };
  }

  if (res.ok) {
    const body = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, providerId: body.id ?? "" };
  }

  const tekst = await res.text().catch(() => "");
  // 429 (te snel) en 5xx (storing) zijn tijdelijk; een 4xx over het adres zelf
  // niet — dan is opnieuw proberen zinloos en hoort de rij op `failed`.
  const opnieuw = res.status === 429 || res.status >= 500;
  return { ok: false, opnieuw, fout: `${res.status} ${tekst.slice(0, 300)}` };
}
