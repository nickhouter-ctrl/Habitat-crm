/**
 * De basis-URL van het CRM voor links in uitgaande mail.
 *
 * Stond eerder op drie plekken hardgecodeerd met domeinen die niet van ons zijn:
 * `habitat-crm.vercel.app` is door een ANDER bedrijf geclaimd (een Arabische
 * habitat-inlogpagina), en crm.habitat-one.com bestond nog niet. Wie op een
 * knop in een mail klikte, kwam dus op een vreemde inlogpagina uit.
 *
 * Daarom nu ons EIGEN domein: crm.habitat-one.com hangt aan dit Vercel-project,
 * dus die kan niemand anders innemen — anders dan een willekeurige *.vercel.app.
 * Zet APP_URL in de omgeving; deze constante is alleen het laatste redmiddel.
 */
export const CRM_URL_FALLBACK = "https://crm.habitat-one.com";

/** APP_URL zonder slash aan het eind, met terugval op ons eigen domein. */
export function crmUrl(): string {
  const v = process.env.APP_URL?.trim().replace(/\/$/, "");
  return v || CRM_URL_FALLBACK;
}
