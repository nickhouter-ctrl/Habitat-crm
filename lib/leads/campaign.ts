/**
 * Campagne-e-mail: een nette productselectie + een juridisch verplichte footer
 * (LSSI/AVG) — afzenderidentificatie, "publicidad"-melding, herkomst van de
 * gegevens, privacylink en een werkende afmeldlink. Bewust GEEN prijzen in een
 * koude B2B-mail; we drijven naar de site + accountaanvraag.
 */
import { COMPANY } from "@/lib/company";

const WEBSITE = `https://www.${COMPANY.website.replace(/^https?:\/\/(www\.)?/, "")}`;

/** Publieke basis-URL van het CRM (waar de afmeldroute leeft). */
export function crmBaseUrl(): string {
  return (process.env.APP_URL || "https://habitat-crm-delta.vercel.app").replace(/\/$/, "");
}

export function unsubscribeUrl(token: string): string {
  return `${crmBaseUrl()}/api/leads/unsubscribe?token=${encodeURIComponent(token)}`;
}

export interface CampaignProduct {
  name: string;
  imageUrl: string | null;
  collection?: string | null;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}

function productCard(p: CampaignProduct): string {
  const img = p.imageUrl
    ? `<img src="${escapeHtml(p.imageUrl)}" width="260" alt="${escapeHtml(p.name)}" style="display:block;width:100%;height:180px;object-fit:cover;border-radius:10px;border:1px solid ${COMPANY.sand}" />`
    : `<div style="width:100%;height:180px;border-radius:10px;background:${COMPANY.sand}"></div>`;
  return `<td style="width:50%;padding:8px;vertical-align:top">
    <a href="${WEBSITE}/products" style="text-decoration:none;color:inherit">
      ${img}
      <div style="margin-top:8px;font-size:14px;font-weight:600;color:${COMPANY.charcoal}">${escapeHtml(p.name)}</div>
      ${p.collection ? `<div style="font-size:12px;color:${COMPANY.muted}">${escapeHtml(p.collection)}</div>` : ""}
    </a>
  </td>`;
}

function productGrid(products: CampaignProduct[]): string {
  if (products.length === 0) return "";
  const rows: string[] = [];
  for (let i = 0; i < products.length; i += 2) {
    const cells = [products[i], products[i + 1]].filter(Boolean).map((p) => productCard(p!)).join("");
    rows.push(`<tr>${cells}${products[i + 1] ? "" : '<td style="width:50%"></td>'}</tr>`);
  }
  return `<table role="presentation" width="100%" style="border-collapse:collapse;margin:8px 0">${rows.join("")}</table>`;
}

/** Verplichte, meelezbare footer: identificatie + publicidad + herkomst + privacy + afmelden. */
function complianceFooter(unsubUrl: string): string {
  return `<div style="margin-top:26px;border-top:1px solid ${COMPANY.sand};padding-top:16px;font-size:12px;color:${COMPANY.muted};line-height:1.7">
    <p style="margin:0 0 8px">Deze e-mail bevat commerciële informatie (publicidad) van ${escapeHtml(COMPANY.legalName)}. U ontvangt deze omdat uw bedrijf, op basis van openbare bronnen, mogelijk interesse heeft in ons aanbod (zakelijke communicatie).</p>
    <div style="margin:0 0 8px">
      <span style="display:block;font-weight:600;color:${COMPANY.charcoal}">${escapeHtml(COMPANY.legalName)}</span>
      <span style="display:block">${escapeHtml(COMPANY.addressStreet)}</span>
      <span style="display:block">${escapeHtml(COMPANY.addressRegion)}</span>
      <span style="display:block">${escapeHtml(COMPANY.phone)} · ${escapeHtml(COMPANY.email)} · ${escapeHtml(WEBSITE)}</span>
      <span style="display:block">NIF ${escapeHtml(COMPANY.vatNumber)}</span>
    </div>
    <p style="margin:0">
      <a href="${unsubUrl}" style="color:${COMPANY.terracotta};font-weight:600">Afmelden / geen e-mails meer ontvangen</a>
      &nbsp;·&nbsp;
      <a href="${WEBSITE}/privacy" style="color:${COMPANY.muted}">Privacybeleid</a>
    </p>
  </div>`;
}

/** Bouwt de volledige campagne-mail voor één ontvanger. */
export function buildCampaignEmail(opts: {
  introText?: string | null;
  products: CampaignProduct[];
  unsubToken: string;
  companyName?: string | null;
}): { html: string; text: string } {
  const unsubUrl = unsubscribeUrl(opts.unsubToken);
  const greeting = opts.companyName ? `Beste ${escapeHtml(opts.companyName)},` : "Beste,";
  const intro = opts.introText?.trim()
    ? escapeHtml(opts.introText.trim()).replace(/\n/g, "<br/>")
    : "Graag stellen we een selectie uit onze collectie aan u voor. Bekijk het volledige assortiment op onze website — met een (gratis) zakelijk account ziet u direct uw prijzen.";

  const html = `<div style="font-family:Helvetica,Arial,sans-serif;background:${COMPANY.cream};padding:24px 0">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;color:${COMPANY.charcoal}">
    <div style="background:${COMPANY.cream};padding:22px 26px">
      <img src="${COMPANY.logoUrl}" alt="${escapeHtml(COMPANY.name)}" height="44" style="display:block;height:44px;width:auto;border:0" />
      <div style="font-size:11px;color:${COMPANY.muted};margin-top:4px">${escapeHtml(COMPANY.tagline)}</div>
    </div>
    <div style="padding:22px 26px">
      <p style="margin:0 0 10px">${greeting}</p>
      <p style="margin:0 0 8px;line-height:1.6">${intro}</p>
      ${productGrid(opts.products)}
      <p style="margin:18px 0 8px;text-align:center">
        <a href="${WEBSITE}/account/aanvragen" style="background:${COMPANY.terracotta};color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-size:14px;display:inline-block">Bekijk prijzen — vraag een account aan</a>
      </p>
      <p style="margin:8px 0 0;text-align:center;font-size:13px"><a href="${WEBSITE}/products" style="color:${COMPANY.muted}">Of bekijk eerst de volledige collectie →</a></p>
      ${complianceFooter(unsubUrl)}
    </div>
  </div>
</div>`;

  const text = `${opts.companyName ? `Beste ${opts.companyName},` : "Beste,"}

${opts.introText?.trim() || "Graag stellen we een selectie uit onze collectie aan u voor."}

${opts.products.map((p) => `• ${p.name}`).join("\n")}

Bekijk prijzen — vraag een account aan: ${WEBSITE}/account/aanvragen
Volledige collectie: ${WEBSITE}/products

—
Deze e-mail bevat commerciële informatie (publicidad) van ${COMPANY.legalName}.
${COMPANY.addressStreet}, ${COMPANY.addressRegion} · ${COMPANY.phone} · ${COMPANY.email} · NIF ${COMPANY.vatNumber}
Afmelden: ${unsubUrl}
Privacybeleid: ${WEBSITE}/privacy`;

  return { html, text };
}
