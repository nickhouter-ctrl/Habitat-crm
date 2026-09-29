/**
 * De opvolgmail met de films van de stand.
 *
 * Twee dingen gingen mis bij de bevestigingsmails van de beurs: de films zaten
 * er niet bij, en iedereen kreeg Engels omdat de QR-code naar de Engelse pagina
 * wees. Deze mail repareert beide in één keer — hij is **tweetalig**: Engels
 * boven, Spaans eronder, gescheiden door een streep. Dan hoeft niemand te weten
 * wie welke taal nodig had.
 *
 * De tekst staat hier puur, zonder database of mailserver, zodat je hem kunt
 * lezen en testen zonder iets te versturen.
 */
import { BEURS } from "@/lib/beurs";

/** Waar de films staan: de pagina op onze eigen website. */
export const FILMPAGINA = {
  en: "https://www.habitat-one.com/beurs/films",
  es: "https://www.habitat-one.com/es/beurs/films",
} as const;

export interface VervolgmailTekst {
  subject: string;
  /** Beide talen onder elkaar, in de volgorde waarin ze in de mail komen. */
  blokken: {
    taal: "en" | "es";
    hallo: (naam: string) => string;
    alineas: string[];
    knop: string;
    link: string;
    groet: string;
  }[];
}

/**
 * Onderwerp in beide talen, gescheiden door een punt — zo ziet een Spanjaard in
 * zijn postvak meteen iets in zijn eigen taal staan.
 */
const ONDERWERP = "The films from our stand · Los vídeos de nuestro stand";

export function beursVervolgmail(naam: string): VervolgmailTekst {
  const voornaam = naam.trim().split(/\s+/)[0] || naam.trim();
  return {
    subject: ONDERWERP,
    blokken: [
      {
        taal: "en",
        hallo: () => `Dear ${voornaam},`,
        alineas: [
          `Thank you again for stopping by our stand (${BEURS.stand}) at ${BEURS.naam}. As promised, here are the films that were playing on the screen — what Flexible Stone is made of, how it is produced and what the technical testing shows.`,
          "They have no sound; the text is on screen. Watch them whenever it suits you.",
          "If you would like prices, samples or documentation for a project, simply reply to this email.",
        ],
        knop: "Watch the films",
        link: FILMPAGINA.en,
        groet: "Kind regards,",
      },
      {
        taal: "es",
        hallo: () => `Hola ${voornaam}:`,
        alineas: [
          `Gracias de nuevo por pasar por nuestro stand (${BEURS.stand}) en ${BEURS.naam}. Como te prometimos, aquí tienes los vídeos que se veían en la pantalla: de qué está hecho Flexible Stone, cómo se produce y qué resultados dan los ensayos técnicos.`,
          "No tienen sonido; el texto aparece en imagen. Puedes verlos cuando te venga bien.",
          "Si quieres precios, muestras o documentación para un proyecto, responde a este correo.",
        ],
        knop: "Ver los vídeos",
        link: FILMPAGINA.es,
        groet: "Un saludo,",
      },
    ],
  };
}

/**
 * De mail zoals hij eruitgaat: beide talen onder elkaar, met in elke taal een
 * knop naar de filmpagina. De opmaak stond eerst in de server-actie; hier is
 * hij te lezen én te testen zonder iets te versturen — en dat bleek nodig, want
 * "ik zie de link niet in de mail" is niet te onderzoeken in een verzonden mail.
 */
export function vervolgmailHtml(naam: string, signature = ""): string {
  const tekst = beursVervolgmail(naam);
  return (
    tekst.blokken
      .map(
        (b, i) => `
        ${i > 0 ? '<hr style="border:none;border-top:1px solid #e7e2d8;margin:28px 0 22px" />' : ""}
        <p>${escape(b.hallo(naam))}</p>
        ${b.alineas.map((p) => `<p>${escape(p)}</p>`).join("\n")}
        <p style="margin:22px 0"><a href="${b.link}" style="background:#b5532b;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-size:14px">${escape(b.knop)}</a></p>
        <p style="margin:0 0 4px;font-size:13px;color:#888">${escape(b.link)}</p>
        <p style="margin:0">${escape(b.groet)}</p>`,
      )
      .join("\n") + (signature ? `<div style="font-size:13px;color:#888;line-height:1.7;margin-top:18px">${signature}</div>` : "")
  );
}

/** Platte tekstversie, voor postvakken die geen HTML tonen. */
export function vervolgmailTekst(naam: string): string {
  return beursVervolgmail(naam)
    .blokken.map((b) => `${b.hallo(naam)}\n\n${b.alineas.join("\n\n")}\n\n${b.knop}: ${b.link}\n\n${b.groet}`)
    .join("\n\n— — —\n\n");
}

function escape(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}
