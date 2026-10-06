/**
 * Een taak wordt opgeslagen in de taal van wie hem maakte. Teresa zag daardoor
 * in haar Spaanse agenda "Afspraak plannen met Raul Martinez" en "Opvolging".
 *
 * Titels die het CRM zelf maakt, tonen we daarom in de taal van wie kijkt.
 * Wat iemand zelf heeft getypt, blijft precies zoals het is ingevoerd — dat
 * vertalen we niet.
 */
type T = (sleutel: string, vars?: Record<string, string | number>) => string;

/** Vaste titels uit het systeem (opvolgtaken). */
const VAST = new Set(["Opvolging", "Beursopvolging"]);

/** "Afspraak plannen met …" uit het teambericht, in elk van de drie talen. */
const AFSPRAAK = /^(?:Afspraak plannen met|Arrange an appointment with|Concertar una cita con)\s+(.+)$/;

export function taakTitel(onderwerp: string | null | undefined, t: T): string {
  const s = (onderwerp ?? "").trim();
  if (VAST.has(s)) return t(s);
  const m = s.match(AFSPRAAK);
  if (m) return t("Afspraak plannen met {naam}", { naam: m[1] });
  return s;
}
