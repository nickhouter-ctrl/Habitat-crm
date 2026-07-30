/**
 * De basis-URL van het CRM voor links in uitgaande mail.
 *
 * Stond op drie plekken hardgecodeerd met twee verschillende, niet-bestaande
 * domeinen (crm.habitat-one.com geeft 404, habitat-crm-delta is een oude naam),
 * terwijl APP_URL in productie leeg was. Links in offerte-mails,
 * urenportaal-goedkeuringen en campagnes wezen daardoor nergens naartoe.
 *
 * Zet APP_URL in de omgeving; deze constante is alleen het laatste redmiddel.
 */
export const CRM_URL_FALLBACK = "https://habitat-crm.vercel.app";

/** APP_URL zonder slash aan het eind, met terugval op het bekende domein. */
export function crmUrl(): string {
  const v = process.env.APP_URL?.trim().replace(/\/$/, "");
  return v || CRM_URL_FALLBACK;
}
