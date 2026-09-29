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
