/**
 * Afspraakvoorstel aan een klant, met een link waarop hij reageert.
 *
 * Drie soorten (zie `appointmentInvites` in het schema): één vast moment, een
 * keuze uit meerdere momenten, of de klant zelf laten voorstellen. Hier staan
 * alleen de teksten en de mail, zonder database of mailserver — te lezen en te
 * testen zonder iets te versturen.
 */
import { randomBytes } from "node:crypto";

import { AGENDA_TIME_ZONE } from "@/lib/agenda-dates";
import { COMPANY } from "@/lib/company";
import { brandedEmail, escapeHtml, signatureHtml } from "@/lib/email";

export type AfspraakTaal = "nl" | "en" | "es" | "de";
export type AfspraakSoort = "fixed" | "choice" | "open";
export const AFSPRAAK_TALEN: AfspraakTaal[] = ["nl", "en", "es", "de"];
export { MAX_MOMENTEN } from "@/lib/afspraak-constanten";

/** Mailtaal uit het dossier ("en-es" = tweetalig → Spaans) of de contactvoorkeur. */
export function afspraakTaal(...kandidaten: (string | null | undefined)[]): AfspraakTaal {
  for (const k of kandidaten) {
    const t = k === "en-es" ? "es" : k;
    if (t && (AFSPRAAK_TALEN as string[]).includes(t)) return t as AfspraakTaal;
  }
  return "es";
}

export const nieuwAfspraakToken = () => randomBytes(24).toString("base64url");

const LOCALE: Record<AfspraakTaal, string> = { nl: "nl-NL", en: "en-GB", es: "es-ES", de: "de-DE" };

/** Het moment in de taal van de klant en in Spaanse tijd (een server in UTC zou anders 2 uur schuiven). */
export function afspraakMoment(op: Date, taal: AfspraakTaal): string {
  return op.toLocaleString(LOCALE[taal], {
    timeZone: AGENDA_TIME_ZONE, weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

type Tekst = {
  hallo: string; groet: string; tijdzone: string;
  onderwerp: Record<AfspraakSoort, string>; intro: Record<AfspraakSoort, string>; vraag: Record<AfspraakSoort, string>;
  akkoord: string; anders: string; doorgeven: string;
  pagina: {
    titel: string; akkoordKnop: string; kiesDit: string; geenVanDeze: string; voorstelLabel: string; berichtLabel: string;
    berichtHint: string; verstuur: string; wijzig: string; akkoordDank: string; keuzeDank: (w: string) => string;
    voorstelDank: (w: string) => string; voorbij: string; onbekend: string; ingetrokken: string; openIntro: string;
  };
};

export const AFSPRAAK_TEKST: Record<AfspraakTaal, Tekst> = {
  nl: {
    hallo: "Hallo", groet: "Met vriendelijke groet,", tijdzone: "Spaanse tijd",
    onderwerp: { fixed: "Bevestiging van onze afspraak", choice: "Voorstel voor een afspraak", open: "Wanneer komt een afspraak je uit?" },
    intro: { fixed: "Hierbij bevestigen we onze afspraak:", choice: "We stellen graag een van deze momenten voor:", open: "We maken graag een afspraak met je." },
    vraag: {
      fixed: "Komt dit moment je goed uit? Laat het ons met één klik weten.",
      choice: "Klik op het moment dat jou het beste uitkomt. Past geen van deze? Stel dan zelf een moment voor.",
      open: "Laat ons met één klik weten wanneer het jou uitkomt.",
    },
    akkoord: "Akkoord", anders: "Ander moment voorstellen", doorgeven: "Moment doorgeven",
    pagina: {
      titel: "Onze afspraak", akkoordKnop: "Akkoord, tot dan", kiesDit: "Dit moment kiezen", geenVanDeze: "Geen van deze — ander moment voorstellen",
      voorstelLabel: "Welk moment komt je uit?", berichtLabel: "Bericht (optioneel)", berichtHint: "Bijvoorbeeld: liever in de middag",
      verstuur: "Versturen", wijzig: "Toch een ander moment voorstellen", akkoordDank: "Dank je! De afspraak staat vast — tot dan.",
      keuzeDank: (w) => `Dank je! De afspraak staat vast op ${w}.`,
      voorstelDank: (w) => `Dank je! We hebben je voorstel ontvangen (${w}) en bevestigen het zo snel mogelijk.`,
      voorbij: "Deze afspraak kan niet meer worden gewijzigd. Heb je een vraag? Mail ons op hi@habitat-one.com.",
      onbekend: "Deze link is niet (meer) geldig. Heb je een vraag? Mail ons op hi@habitat-one.com.",
      ingetrokken: "Dit voorstel is ingetrokken. Heb je een vraag? Mail ons op hi@habitat-one.com.",
      openIntro: "Laat ons weten wanneer het jou uitkomt; we bevestigen het zo snel mogelijk.",
    },
  },
  en: {
    hallo: "Hello", groet: "Kind regards,", tijdzone: "Spanish time",
    onderwerp: { fixed: "Confirmation of our appointment", choice: "Proposed times for an appointment", open: "When would suit you for an appointment?" },
    intro: { fixed: "We're writing to confirm our appointment:", choice: "We'd like to suggest one of these times:", open: "We'd love to arrange an appointment with you." },
    vraag: {
      fixed: "Does this time work for you? Let us know with one click.",
      choice: "Click the time that suits you best. None of them work? Suggest another time instead.",
      open: "Let us know with one click when would suit you.",
    },
    akkoord: "Accept", anders: "Suggest another time", doorgeven: "Let us know",
    pagina: {
      titel: "Our appointment", akkoordKnop: "Accept — see you then", kiesDit: "Choose this time", geenVanDeze: "None of these — suggest another time",
      voorstelLabel: "Which time suits you?", berichtLabel: "Message (optional)", berichtHint: "For example: afternoons work better",
      verstuur: "Send", wijzig: "Suggest a different time after all", akkoordDank: "Thank you! The appointment is confirmed — see you then.",
      keuzeDank: (w) => `Thank you! The appointment is confirmed for ${w}.`,
      voorstelDank: (w) => `Thank you! We've received your suggestion (${w}) and will confirm it as soon as possible.`,
      voorbij: "This appointment can no longer be changed. Any questions? Email us at hi@habitat-one.com.",
      onbekend: "This link is not (or no longer) valid. Any questions? Email us at hi@habitat-one.com.",
      ingetrokken: "This proposal has been withdrawn. Any questions? Email us at hi@habitat-one.com.",
      openIntro: "Let us know when would suit you, and we'll confirm as soon as possible.",
    },
  },
  es: {
    hallo: "Hola", groet: "Un cordial saludo,", tijdzone: "hora de España",
    onderwerp: { fixed: "Confirmación de nuestra cita", choice: "Propuesta de cita", open: "¿Cuándo te viene bien una cita?" },
    intro: { fixed: "Te confirmamos nuestra cita:", choice: "Te proponemos uno de estos momentos:", open: "Nos gustaría concertar una cita contigo." },
    vraag: {
      fixed: "¿Te viene bien este momento? Dínoslo con un solo clic.",
      choice: "Haz clic en el momento que mejor te venga. ¿No te viene bien ninguno? Propón tú otro momento.",
      open: "Dinos con un solo clic cuándo te viene bien.",
    },
    akkoord: "Aceptar", anders: "Proponer otro momento", doorgeven: "Indicar un momento",
    pagina: {
      titel: "Nuestra cita", akkoordKnop: "Aceptar, nos vemos", kiesDit: "Elegir este momento", geenVanDeze: "Ninguno — proponer otro momento",
      voorstelLabel: "¿Qué momento te viene bien?", berichtLabel: "Mensaje (opcional)", berichtHint: "Por ejemplo: mejor por la tarde",
      verstuur: "Enviar", wijzig: "Proponer otro momento de todos modos", akkoordDank: "¡Gracias! La cita queda confirmada. ¡Hasta entonces!",
      keuzeDank: (w) => `¡Gracias! La cita queda confirmada para el ${w}.`,
      voorstelDank: (w) => `¡Gracias! Hemos recibido tu propuesta (${w}) y te la confirmaremos lo antes posible.`,
      voorbij: "Esta cita ya no se puede modificar. ¿Alguna pregunta? Escríbenos a hi@habitat-one.com.",
      onbekend: "Este enlace no es válido (o ya no lo es). ¿Alguna pregunta? Escríbenos a hi@habitat-one.com.",
      ingetrokken: "Esta propuesta se ha retirado. ¿Alguna pregunta? Escríbenos a hi@habitat-one.com.",
      openIntro: "Dinos cuándo te viene bien y te lo confirmaremos lo antes posible.",
    },
  },
  de: {
    hallo: "Hallo", groet: "Viele Grüße,", tijdzone: "spanische Zeit",
    onderwerp: { fixed: "Bestätigung unseres Termins", choice: "Terminvorschlag", open: "Wann passt dir ein Termin?" },
    intro: { fixed: "Hiermit bestätigen wir unseren Termin:", choice: "Wir schlagen dir gern einen dieser Termine vor:", open: "Wir möchten gern einen Termin mit dir vereinbaren." },
    vraag: {
      fixed: "Passt dir dieser Termin? Sag uns mit einem Klick Bescheid.",
      choice: "Klick auf den Termin, der dir am besten passt. Passt keiner? Dann schlag selbst einen vor.",
      open: "Sag uns mit einem Klick, wann es dir passt.",
    },
    akkoord: "Zusagen", anders: "Anderen Termin vorschlagen", doorgeven: "Termin mitteilen",
    pagina: {
      titel: "Unser Termin", akkoordKnop: "Zusagen — bis dann", kiesDit: "Diesen Termin wählen", geenVanDeze: "Keiner passt — anderen Termin vorschlagen",
      voorstelLabel: "Welcher Termin passt dir?", berichtLabel: "Nachricht (optional)", berichtHint: "Zum Beispiel: lieber nachmittags",
      verstuur: "Senden", wijzig: "Doch einen anderen Termin vorschlagen", akkoordDank: "Danke! Der Termin steht — bis dann.",
      keuzeDank: (w) => `Danke! Der Termin steht: ${w}.`,
      voorstelDank: (w) => `Danke! Wir haben deinen Vorschlag erhalten (${w}) und bestätigen ihn so schnell wie möglich.`,
      voorbij: "Dieser Termin kann nicht mehr geändert werden. Fragen? Schreib uns an hi@habitat-one.com.",
      onbekend: "Dieser Link ist nicht (mehr) gültig. Fragen? Schreib uns an hi@habitat-one.com.",
      ingetrokken: "Dieser Vorschlag wurde zurückgezogen. Fragen? Schreib uns an hi@habitat-one.com.",
      openIntro: "Sag uns, wann es dir passt, und wir bestätigen es so schnell wie möglich.",
    },
  },
};

const knop = (href: string, label: string, hoofd: boolean) =>
  `<a href="${href}" style="display:inline-block;margin:0 8px 8px 0;padding:11px 18px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;${
    hoofd ? `background:${COMPANY.brown};color:#fff` : `border:1px solid #cfc6b8;color:#3a2a20`}">${escapeHtml(label)}</a>`;

/**
 * De mail aan de klant. Knoppen openen de pagina met de keuze alvast
 * geselecteerd; vastleggen gebeurt pas met een klik daar (mailscanners openen
 * links, en die mogen niets bevestigen).
 */
export function afspraakUitnodigingMail(a: {
  soort: AfspraakSoort; taal: AfspraakTaal; naam?: string | null; momenten: Date[]; locatie?: string | null; bericht?: string | null; link: string;
}): { subject: string; html: string; text: string } {
  const t = AFSPRAAK_TEKST[a.taal];
  const groetNaam = a.naam?.trim() ? `${t.hallo} ${a.naam.trim()},` : `${t.hallo},`;
  const locatie = a.locatie?.trim() ? `<div style="font-size:14px;color:#555;margin-top:3px">${escapeHtml(a.locatie.trim())}</div>` : "";
  const tz = `<span style="font-size:12px;font-weight:400;color:#888">(${escapeHtml(t.tijdzone)})</span>`;

  let blok = "";
  let knoppen = "";
  const tekstRegels: string[] = [];
  if (a.soort === "fixed") {
    const w = afspraakMoment(a.momenten[0], a.taal);
    blok = `<div style="margin:16px 0;padding:14px 18px;background:${COMPANY.cream};border-radius:10px"><div style="font-size:17px;font-weight:600;color:${COMPANY.brown}">${escapeHtml(w)} ${tz}</div>${locatie}</div>`;
    knoppen = knop(`${a.link}?actie=akkoord`, t.akkoord, true) + knop(`${a.link}?actie=anders`, t.anders, false);
    tekstRegels.push(`${w} (${t.tijdzone})`, a.locatie?.trim() ?? "", "", `${t.akkoord}: ${a.link}?actie=akkoord`, `${t.anders}: ${a.link}?actie=anders`);
  } else if (a.soort === "choice") {
    const ws = a.momenten.map((m) => afspraakMoment(m, a.taal));
    blok = `<div style="margin:16px 0">${ws.map((w, i) => knop(`${a.link}?kies=${i}`, w, true)).join("<br>")}<div style="font-size:12px;color:#888;margin-top:2px">${escapeHtml(t.tijdzone)}</div>${locatie}</div>`;
    knoppen = knop(`${a.link}?actie=anders`, t.anders, false);
    tekstRegels.push(...ws.map((w, i) => `- ${w}: ${a.link}?kies=${i}`), `(${t.tijdzone})`, a.locatie?.trim() ?? "", "", `${t.anders}: ${a.link}?actie=anders`);
  } else {
    blok = a.locatie?.trim() ? `<div style="margin:12px 0">${locatie}</div>` : "";
    knoppen = knop(`${a.link}?actie=anders`, t.doorgeven, true);
    tekstRegels.push(`${t.doorgeven}: ${a.link}?actie=anders`);
  }

  const html = brandedEmail(`
      <p style="margin:0">${escapeHtml(groetNaam)}</p>
      <p>${escapeHtml(t.intro[a.soort])}</p>
      ${blok}
      ${a.bericht?.trim() ? `<p style="white-space:pre-wrap">${escapeHtml(a.bericht.trim())}</p>` : ""}
      <p>${escapeHtml(t.vraag[a.soort])}</p>
      <div style="margin:6px 0 4px">${knoppen}</div>
      <hr style="border:none;border-top:1px solid ${COMPANY.sand};margin:24px 0 16px" />
      <p style="margin:0 0 4px">${escapeHtml(t.groet)}</p>
      <div style="font-size:13px;color:#888;line-height:1.7">${signatureHtml()}</div>`);
  const text = [groetNaam, "", t.intro[a.soort], "", ...tekstRegels, a.bericht?.trim() ? `\n${a.bericht.trim()}` : "", "", t.vraag[a.soort], "", t.groet, COMPANY.legalName]
    .filter((r, i, l) => !(r === "" && l[i - 1] === ""))
    .join("\n");
  return { subject: t.onderwerp[a.soort], html, text };
}
