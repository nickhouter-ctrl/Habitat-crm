/**
 * AI-conceptantwoorden voor klantmail (inbox + aanvragen).
 *
 * Volgt de conventies van lib/marketing/ai-copy.ts: Anthropic Messages-API via
 * fetch, model uit `ANTHROPIC_MODEL`, JSON-uitvoer met stripFences en **null
 * bij ontbrekende key of fout** — de medewerker schrijft dan gewoon zelf. De
 * AI schrijft alleen een CONCEPT; versturen blijft altijd een handmatige klik.
 */
import "server-only";

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

/** Is er een API-sleutel? (Voor de UI: AI-knop tonen of verbergen.) */
export function aiReplyConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function stripFences(s: string): string {
  return s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

const SYSTEM = `Je schrijft klantenservice-e-mails namens Habitat One, een exclusief renovatie- en interieurbedrijf aan de Costa Blanca (Xàbia/Jávea, Spanje): complete renovaties, keukens, badkamers, natuursteen, meubels en buitenruimtes — ontworpen, geleverd én gemonteerd, met een showroom in Jávea (Camí de la Fontana 3).

Toon: warm, persoonlijk en professioneel. Kort en helder — geen wollige zinnen, geen emoji, geen uitroeptekens, geen overdreven verkooppraat, geen beloftes over prijzen of levertijden die niet in de context staan. Bedank voor het bericht, ga concreet in op wat de klant schrijft en sluit af met een duidelijke volgende stap (bv. een bezoek aan de showroom of dat wij ergens op terugkomen).

TAAL: schrijf het hele antwoord in de taal van de klant (de taal van diens bericht, tenzij een doeltaal is opgegeven), op moedertaalniveau — Spaans en Engels zijn eersterangs talen, geen vertalingen.

Onderteken met de voornaam van de medewerker en daaronder "Habitat One". De e-mail is platte tekst met lege regels tussen alinea's.`;

export interface ReplyDraftRequest {
  /** Waar komt het vandaan — kleurt de aanhef ("je aanvraag", "je bericht"). */
  soort: "aanvraag" | "mail";
  klantNaam?: string | null;
  klantEmail?: string | null;
  /** Onderwerp van het binnengekomen bericht (indien bekend). */
  onderwerp?: string | null;
  /** Het bericht van de klant (platte tekst). */
  bericht: string;
  /** Doeltaal-code van de aanvraag (nl/en/es/de) — anders volgt de AI de taal van het bericht. */
  taal?: string | null;
  /** Producten uit de aanvraag (indien van toepassing). */
  producten?: string[];
  /** Voornaam van de medewerker die ondertekent. */
  medewerker: string;
  /** Korte aanwijzing van de medewerker ("zeg dat we donderdag bellen"). */
  instructie?: string | null;
  /** Vast onderwerp (bv. "Re: …" bij een mail-antwoord) — dan schrijft de AI alleen de body. */
  vastOnderwerp?: string | null;
  /** Beschikbare brochures/catalogi (bestandsnamen uit /catalogi) — de AI kiest
   *  welke als bijlage meegaan als de klant of de medewerker erom vraagt. */
  beschikbareBijlagen?: string[];
}

const TAAL_NAAM: Record<string, string> = {
  nl: "Nederlands",
  en: "Engels",
  es: "Spaans (Castellano)",
  de: "Duits",
  fr: "Frans",
};

export interface MailConcept {
  subject: string;
  body: string;
  /** Door de AI gekozen bijlagen — altijd exact bestandsnamen uit `beschikbareBijlagen`. */
  bijlagen: string[];
}

/** Genereer een conceptantwoord. Null bij ontbrekende key of fout. */
export async function genereerMailAntwoord(req: ReplyDraftRequest): Promise<MailConcept | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;

  const voornaam = (req.medewerker.trim().split(/\s+/)[0] || "Habitat One").trim();
  const taalNaam = req.taal ? TAAL_NAAM[req.taal.toLowerCase()] : undefined;

  const prompt = `Schrijf een antwoord op onderstaand ${req.soort === "aanvraag" ? "klantbericht dat via het aanvraagformulier van de website binnenkwam" : "e-mailbericht"}.

${taalNaam ? `DOELTAAL: ${taalNaam} — schrijf het hele antwoord in die taal.` : "Schrijf het antwoord in dezelfde taal als het bericht van de klant."}
Ondertekenaar: ${voornaam} (Habitat One).
${req.klantNaam ? `Naam van de klant: ${req.klantNaam}.` : ""}
${req.producten && req.producten.length > 0 ? `De aanvraag gaat over deze producten: ${req.producten.join(", ")}.` : ""}
${req.instructie?.trim() ? `AANWIJZING VAN DE MEDEWERKER (verwerk dit inhoudelijk in de mail, netjes uitgeschreven): ${req.instructie.trim()}` : "Er is geen aanwijzing meegegeven: schrijf een passend, concreet antwoord op wat de klant vraagt. Kun je iets niet toezeggen (prijs, levertijd, beschikbaarheid), zeg dan dat we er persoonlijk op terugkomen."}
${req.vastOnderwerp ? `Het onderwerp staat vast: "${req.vastOnderwerp}" — geef dat exact zo terug.` : "Bedenk een kort, passend onderwerp in de doeltaal."}
${
  req.beschikbareBijlagen && req.beschikbareBijlagen.length > 0
    ? `BESCHIKBARE BIJLAGEN (brochures/catalogi die als PDF meegestuurd kunnen worden):
${req.beschikbareBijlagen.map((n) => `- ${n}`).join("\n")}
Kies er ALLEEN bijlagen uit als de klant erom vraagt óf de aanwijzing van de medewerker erom vraagt; anders een lege lijst. Gebruik de bestandsnamen EXACT zoals hierboven. Noem in de mailtekst UITSLUITEND een bijlage als je die ook echt in "attachments" teruggeeft ("in de bijlage vind je …"). Wordt er om een brochure gevraagd die NIET in de lijst staat, geef dan een lege lijst en schrijf dat we die informatie zo snel mogelijk nasturen — beweer nooit dat er iets is bijgevoegd wat er niet is.`
    : ""
}

=== BERICHT VAN DE KLANT ===
${req.onderwerp ? `Onderwerp: ${req.onderwerp}\n` : ""}${req.bericht.slice(0, 8000)}
=== EINDE BERICHT ===

Geef ALLEEN een JSON-object terug (geen markdown): {"subject": "...", "body": "...", "attachments": ["bestandsnaam", ...]}. De body is platte tekst met \\n voor regeleindes, begint met een aanhef en eindigt met de ondertekening. "attachments" is een lege lijst als er niets meegestuurd hoeft te worden.`;

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 900,
        temperature: 0.5,
        system: SYSTEM,
        messages: [{ role: "user", content: prompt }],
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn("AI-antwoord faalde:", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (data.content ?? [])
      .filter((b) => b.type === "text" && b.text)
      .map((b) => b.text!)
      .join("\n");
    if (!text) return null;
    const raw = JSON.parse(stripFences(text)) as {
      subject?: unknown;
      body?: unknown;
      attachments?: unknown;
    };
    const body = typeof raw.body === "string" ? raw.body.trim() : "";
    if (!body) return null;
    const subject =
      req.vastOnderwerp?.trim() ||
      (typeof raw.subject === "string" && raw.subject.trim() ? raw.subject.trim() : "Habitat One");
    // Alleen bijlagen die écht in de bibliotheek bestaan — de AI mag niets verzinnen.
    const beschikbaar = new Set(req.beschikbareBijlagen ?? []);
    const bijlagen = Array.isArray(raw.attachments)
      ? raw.attachments.filter((a): a is string => typeof a === "string" && beschikbaar.has(a))
      : [];
    return { subject, body, bijlagen };
  } catch (err) {
    console.warn("AI-antwoord error:", err);
    return null;
  }
}
