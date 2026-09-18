/**
 * E-mailadressen en bedrijfsnamen op één vorm brengen. Dit is de basis onder de
 * hele import: zonder normalisatie staat "Info@Empresa.ES " twee keer in de
 * lijst en krijgt hetzelfde bedrijf twee campagnes.
 *
 * Bewust NIET gedaan: de Gmail-puntjestruc (john.doe@ = johndoe@) en het
 * strippen van plusadressen. Bij zakelijke adressen zijn dat andere postvakken,
 * en twee echte bedrijven samenvoegen op een gok is erger dan een dubbele rij.
 */
import { supplierKey } from "@/lib/supplier-key";

/**
 * `"  Info@Empresa.ES "`, `"mailto:x@y.z"` en `"Ana <a@b.es>"` worden alle drie
 * het adres zelf, in kleine letters. Alles wat geen geldig adres is → null.
 */
export function normalizeEmail(ruw: string | null | undefined): string | null {
  if (!ruw) return null;
  let t = String(ruw).trim();
  // "Ana García <ana@empresa.es>" → het deel tussen de punthaken.
  const haakjes = t.match(/<([^>]+)>/);
  if (haakjes) t = haakjes[1];
  t = t.replace(/^mailto:/i, "").trim().toLowerCase();
  // Sommige lijsten zetten meerdere adressen in één cel; neem het eerste.
  t = t.split(/[;,\s]+/)[0] ?? "";
  if (!t || t.length > 254) return null;

  const delen = t.split("@");
  if (delen.length !== 2) return null;
  const [lokaal, domein] = delen;
  if (!lokaal || !domein) return null;
  if (!/^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+$/.test(lokaal)) return null;
  if (lokaal.startsWith(".") || lokaal.endsWith(".") || lokaal.includes("..")) return null;
  // Domein: labels van letters/cijfers/streepjes, en een tld van ≥ 2 letters.
  if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(domein)) return null;
  return `${lokaal}@${domein}`;
}

/**
 * Adressen die technisch kloppen maar waar geen mens achter zit. Koud mailen
 * naar noreply@ levert alleen een bounce op, en abuse@ of postmaster@ mailen is
 * vragen om een klacht.
 */
const ROL_LOKAAL = new Set([
  "noreply",
  "no-reply",
  "donotreply",
  "do-not-reply",
  "postmaster",
  "abuse",
  "spam",
  "mailer-daemon",
  "bounce",
  "bounces",
  "unsubscribe",
  "webmaster",
]);

export function isRoleAddress(email: string): boolean {
  const lokaal = email.split("@")[0] ?? "";
  return ROL_LOKAAL.has(lokaal.replace(/\+.*$/, ""));
}

/**
 * Sleutel voor "hetzelfde bedrijf" als er geen e-mailadres is: de
 * genormaliseerde naam plus de plaats. `supplierKey()` haalt hoofdletters,
 * accenten, leestekens en de rechtsvorm (S.L., S.A.) eruit — precies wat
 * Spaanse bedrijfsnamen nodig hebben. De plaats staat erbij omdat "Reformas
 * García" in Dénia een ander bedrijf is dan in Alicante.
 */
export function prospectCompanyKey(naam: string, plaats?: string | null): string {
  const stad = (plaats ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^0-9a-zA-Z]/g, "")
    .toLowerCase();
  return `${supplierKey(naam)}|${stad}`;
}
