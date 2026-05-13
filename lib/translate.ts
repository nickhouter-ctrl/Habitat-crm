/**
 * Vertaal-helper via de OpenAI Chat Completions API. Server-only.
 *
 * Env:
 *   OPENAI_API_KEY      verplicht
 *   OPENAI_MODEL        optioneel, default 'gpt-4o-mini' (~€0,001 per vertaling)
 */

export type Locale = "nl" | "de" | "en" | "es";

export const LOCALE_LABEL: Record<Locale, string> = {
  nl: "Nederlands",
  de: "Duits (Deutsch)",
  en: "Engels (English)",
  es: "Spaans (Español)",
};

export class TranslateDisabledError extends Error {
  constructor() {
    super("OPENAI_API_KEY niet ingesteld — auto-vertaling is uitgeschakeld.");
  }
}

const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

/**
 * Vertaal `text` van `fromLocale` naar `targetLocales`. Geeft een object terug
 * met per target-locale de vertaling. Stille fallback: als 'n target faalt
 * staat 'ie niet in de map.
 */
export async function translateText(args: {
  text: string;
  fromLocale: Locale;
  targetLocales: Locale[];
}): Promise<Partial<Record<Locale, string>>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new TranslateDisabledError();
  if (!args.text.trim()) return {};
  if (!args.targetLocales.length) return {};

  const targets = args.targetLocales
    .map((l) => `- ${l}: ${LOCALE_LABEL[l]}`)
    .join("\n");
  const prompt = `Vertaal de onderstaande tekst van ${LOCALE_LABEL[args.fromLocale]} naar:
${targets}

Behoud productdetails (afmetingen, materialen, codes). Houd het zakelijk en compact.
Geef ALLEEN een JSON-object terug, zonder uitleg. Vorm:
${args.targetLocales.map((l) => `  "${l}": "..."`).join(",\n")}

Tekst:
"""
${args.text.trim()}
"""`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: "Je bent een precieze vertaler voor productbeschrijvingen van een interieur-/bouwbedrijf." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content ?? "{}";
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`OpenAI gaf geen geldige JSON terug: ${content.slice(0, 200)}`);
  }
  const out: Partial<Record<Locale, string>> = {};
  for (const l of args.targetLocales) {
    const v = parsed[l];
    if (typeof v === "string" && v.trim()) out[l] = v.trim();
  }
  return out;
}
