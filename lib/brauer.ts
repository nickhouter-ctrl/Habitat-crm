/**
 * BRAUER — merkkennis die alleen voor hun catalogus geldt.
 *
 * Bewust apart van lib/variants.ts: de import ontleedt codes in principe NIET
 * (elk programma heeft een andere opbouw), maar als het bronbestand geen
 * kleurkolom heeft, kan dit hulpje de kleur uit een kranencode halen en zes
 * kleuren op één product laten vallen. Meubel- en glascodes zijn anders
 * opgebouwd en horen hier dus niet in.
 *
 *   kranen  5-CE-001        chroom, model A
 *           5-GM-001-HD5    gunmetal, hendelmodel E
 *   meubel  OK-DL80MW       serie DL, maat 80, mat wit
 *   glas    GS-OBI1B90200CE serie, maat 90, hoogte 200, chroom
 */
import { normalizeCode } from "@/lib/variants";

/** De zes kleuren van het kranenprogramma, met hun codeletter. */
export const BRAUER_KLEUREN = [
  { value: "CE", label: "Chroom", familie: "Chroom", hex: "#cfd3d6" },
  { value: "S", label: "Mat zwart", familie: "Zwart", hex: "#1c1c1c" },
  { value: "GK", label: "Koper", familie: "Koper", hex: "#a5673f" },
  { value: "NG", label: "RVS-kleurig geborsteld", familie: "RVS", hex: "#9a9a95" },
  { value: "GM", label: "Gunmetal", familie: "Zilver", hex: "#5b5b5f" },
  { value: "GG", label: "Goud", familie: "Goud", hex: "#c2a15a" },
] as const;

/**
 * De hendelmodellen. De basiscode zonder suffix is model A; HD5/HD4/HD3/HD1
 * zijn B t/m E. Dat "HD2" ontbreekt is geen vergissing van ons — die staat niet
 * in de catalogus.
 */
export const BRAUER_HENDELS = [
  { value: "A", label: "Model A", suffix: "" },
  { value: "HD5", label: "Model B", suffix: "HD5" },
  { value: "HD4", label: "Model C", suffix: "HD4" },
  { value: "HD3", label: "Model D", suffix: "HD3" },
  { value: "HD1", label: "Model E", suffix: "HD1" },
] as const;

const KLEURCODES = BRAUER_KLEUREN.map((k) => k.value);
const HENDELSUFFIXEN = BRAUER_HENDELS.map((h) => h.suffix).filter(Boolean);

export type BrauerCode = {
  /** Programma-voorvoegsel: "5" voor kranen. */
  prefix: string;
  /** Kleurcode, bv. "GM". */
  kleur: string;
  /** Artikelnummer binnen het programma, bv. "001". */
  nummer: string;
  /** Hendelsuffix, of "A" voor de basisuitvoering. */
  hendel: string;
};

/**
 * Een kranencode uit elkaar halen. Geeft null bij alles wat er niet op lijkt —
 * meubel, glas, douchegoten en codes van andere merken vallen daar netjes uit.
 */
export function parseBrauerCode(raw: string | null | undefined): BrauerCode | null {
  const code = normalizeCode(raw);
  const m = code.match(/^(5)-([A-Z]{1,2})-(\d{3})(?:-([A-Z0-9]+))?$/);
  if (!m) return null;
  const [, prefix, kleur, nummer, suffix] = m;
  if (!KLEURCODES.includes(kleur as (typeof KLEURCODES)[number])) return null;
  if (suffix && !HENDELSUFFIXEN.includes(suffix as (typeof HENDELSUFFIXEN)[number])) return null;
  return { prefix, kleur, nummer, hendel: suffix || "A" };
}

/**
 * De sleutel waarmee uitvoeringen op één product vallen: de code zonder kleur.
 * `5-CE-001` en `5-GM-001` delen `5-*-001`, dus zes kleuren worden één product.
 *
 * Het hendelmodel zit bewust NIET in de sleutel: dat is een tweede as van
 * hetzelfde product, precies zoals de webshops het tonen. Geeft null als het
 * geen kranencode is — dan bepaalt de productnaam uit het bronbestand de groep.
 */
export function brauerModelKey(raw: string | null | undefined): string | null {
  const c = parseBrauerCode(raw);
  return c ? `${c.prefix}-*-${c.nummer}` : null;
}

/** De as-definities voor een kranenproduct, op basis van wat er echt bestaat. */
export function brauerAxes(codes: string[]): Array<{
  key: string;
  label: string;
  values: Array<{ value: string; label: string }>;
}> {
  const ontleed = codes.map(parseBrauerCode).filter((c): c is BrauerCode => c != null);
  if (!ontleed.length) return [];

  const kleuren = new Set(ontleed.map((c) => c.kleur));
  const hendels = new Set(ontleed.map((c) => c.hendel));

  const assen: Array<{
    key: string;
    label: string;
    values: Array<{ value: string; label: string }>;
  }> = [
    {
      key: "kleur",
      label: "Kleur",
      values: BRAUER_KLEUREN.filter((k) => kleuren.has(k.value)).map((k) => ({
        value: k.value,
        label: k.label,
      })),
    },
  ];
  // Eén hendelmodel is geen keuze — dan hoort er geen lege keuzelijst te staan.
  if (hendels.size > 1) {
    assen.push({
      key: "model",
      label: "Model",
      values: BRAUER_HENDELS.filter((h) => hendels.has(h.value)).map((h) => ({
        value: h.value,
        label: h.label,
      })),
    });
  }
  return assen;
}

/** De keuze per as die bij één code hoort, voor `product_variants.options`. */
export function brauerOptions(raw: string | null | undefined): Record<string, string> | null {
  const c = parseBrauerCode(raw);
  if (!c) return null;
  return { kleur: c.kleur, model: c.hendel };
}
