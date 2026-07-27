/**
 * Valideert een EU-btw-nummer tegen de officiële VIES-service (EU). Alleen
 * zinvol voor intracommunautaire klanten (btw-nummer met landcode). Een kale
 * Spaanse NIF (zonder landcode) geeft `null` terug — daar is VIES niet voor.
 */
const EU_CODES = new Set([
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "EL", "ES", "FI", "FR", "HR", "HU", "IE",
  "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK", "XI",
]);

export type ViesResult = { valid: boolean; name?: string; address?: string; countryCode: string };

/** Geeft `null` als het geen EU-btw-formaat is (dan geen VIES-controle nodig). */
export async function checkVatVies(vat: string): Promise<ViesResult | null> {
  const clean = (vat ?? "").replace(/[\s.\-_]/g, "").toUpperCase();
  const m = clean.match(/^([A-Z]{2})([A-Z0-9]{2,14})$/);
  if (!m) return null;
  const [, ms, number] = m;
  if (!EU_CODES.has(ms)) return null;
  try {
    const res = await fetch(`https://ec.europa.eu/taxation_customs/vies/rest-api/ms/${ms}/vat/${number}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { isValid?: boolean; valid?: boolean; name?: string; address?: string };
    return {
      valid: Boolean(j.isValid ?? j.valid),
      name: j.name?.trim() || undefined,
      address: j.address?.trim() || undefined,
      countryCode: ms,
    };
  } catch {
    return null; // VIES onbereikbaar → geen harde blokkade
  }
}
