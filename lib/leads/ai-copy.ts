/**
 * Stelt met AI (Anthropic) een campagne-onderwerp + introtekst op in de huisstijl
 * van Habitat One. Alleen de tekst wordt gegenereerd; de merk-template en de
 * juridisch verplichte footer (identificatie, publicidad, afmelden) worden er
 * deterministisch omheen gebouwd door buildCampaignEmail — die laten we NOOIT
 * aan het model over. Zonder ANTHROPIC_API_KEY → null (caller valt terug).
 */
const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

export function aiCopyConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function stripFences(s: string): string {
  return s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

const SYSTEM = `Je bent een top-copywriter voor Habitat One, een exclusieve interieur- en bouwmaterialenleverancier aan de Costa Blanca (Xàbia/Jávea). Schrijf verfijnd, warm en mediterraan-luxe — met zintuiglijke, beeldende taal die een gevoel oproept (licht, textuur, materiaal, rust, ambacht), zonder zweverig of overdreven te worden. Denk aan de toon van een high-end interieurmagazine. Doelgroep: B2B-professionals (architecten, aannemers, makelaars, interieurzaken) die met kwaliteit werken. Dit is een eerste, koude zakelijke kennismaking. Nodig subtiel uit om de collectie te bekijken en een (gratis) account aan te maken voor prijzen. Regels: geen prijzen, geen clichés als "de beste kwaliteit", geen uitroeptekens, geen emoji, niet pusherig. Elegantie boven verkoopdruk.`;

const LANG_NAME: Record<string, string> = { es: "Spaans (Castellano)", nl: "Nederlands", de: "Duits", en: "Engels" };

/** Genereert { subject, intro } in de gevraagde taal. Null bij ontbrekende key of fout. */
export async function generateCampaignCopy(opts: {
  language?: string;
  groupLabels: string[];
  audience?: string[];
  angle?: string | null;
}): Promise<{ subject: string; intro: string } | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;

  const langName = LANG_NAME[opts.language ?? "es"] ?? "Spaans (Castellano)";

  const prompt = `Schrijf een korte marketing-e-mail voor Habitat One. BELANGRIJK: schrijf de volledige uitvoer (onderwerp én introtekst) in het ${langName}, vlekkeloos en natuurlijk (native niveau, formeel-hoffelijk waar dat past).

Productgroepen die we uitlichten: ${opts.groupLabels.join(", ") || "onze collectie"}.
Doelgroep: ${opts.audience?.join(", ") || "zakelijke relaties"}.
${opts.angle ? `Insteek/aanleiding: ${opts.angle}` : ""}

Eisen:
- Onderwerp: pakkend en verfijnd, max ~60 tekens, wekt nieuwsgierigheid. Geen clickbait, geen uitroeptekens.
- Introtekst: 2 tot 4 zinnen met sfeer en beeldende, zintuiglijke taal die de genoemde productgroepen laat voelen (materiaal, textuur, licht, ruimte). Komt vlak boven de beeldblokken. Begin NIET met een aanhef (die wordt apart toegevoegd). Sluit af met een subtiele uitnodiging om de collectie te ontdekken en een account aan te maken voor prijzen.
- Geen prijzen, geen afmeldtekst, geen bedrijfsgegevens (die staan al in de mail).

Geef ALLEEN een JSON-object terug (geen markdown): {"subject": "...", "intro": "..."}.`;

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 700,
        temperature: 0.7,
        system: SYSTEM,
        messages: [{ role: "user", content: prompt }],
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn("AI-campagnetekst faalde:", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (data.content ?? []).filter((b) => b.type === "text" && b.text).map((b) => b.text!).join("\n");
    if (!text) return null;
    const raw = JSON.parse(stripFences(text)) as { subject?: unknown; intro?: unknown };
    const subject = typeof raw.subject === "string" ? raw.subject.trim() : "";
    const intro = typeof raw.intro === "string" ? raw.intro.trim() : "";
    if (!subject || !intro) return null;
    return { subject, intro };
  } catch (err) {
    console.warn("AI-campagnetekst error:", err);
    return null;
  }
}
