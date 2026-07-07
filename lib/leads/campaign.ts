/**
 * Campagne-e-mail: een nette productselectie + een juridisch verplichte footer
 * (LSSI/AVG) — afzenderidentificatie, "publicidad"-melding, herkomst van de
 * gegevens, privacylink en een werkende afmeldlink. Bewust GEEN prijzen in een
 * koude B2B-mail; we drijven naar de site + accountaanvraag.
 */
import { COMPANY } from "@/lib/company";
import type { CampaignGroup } from "@/lib/leads/groups";

const WEBSITE = `https://www.${COMPANY.website.replace(/^https?:\/\/(www\.)?/, "")}`;

/** Publieke basis-URL van het CRM (waar de afmeldroute leeft). */
export function crmBaseUrl(): string {
  return (process.env.APP_URL || "https://habitat-crm-delta.vercel.app").replace(/\/$/, "");
}

export function unsubscribeUrl(token: string): string {
  return `${crmBaseUrl()}/api/leads/unsubscribe?token=${encodeURIComponent(token)}`;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}

/** Eén groep als groot, editorial beeldblok — bedoeld om sfeer/gevoel op te roepen. */
function groupBlock(g: CampaignGroup): string {
  const img = g.imageUrl
    ? `<img src="${escapeHtml(g.imageUrl)}" width="548" alt="${escapeHtml(g.label)}" style="display:block;width:100%;height:260px;object-fit:cover;border-radius:14px" />`
    : `<div style="width:100%;height:260px;border-radius:14px;background:${COMPANY.sand}"></div>`;
  return `<a href="${escapeHtml(g.url)}" style="text-decoration:none;color:inherit;display:block;margin:22px 0">
    ${img}
    <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.2;color:${COMPANY.brown};margin-top:12px">${escapeHtml(g.label)}</div>
    <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${COMPANY.terracotta};margin-top:4px">Ontdek de collectie →</div>
  </a>`;
}

/** Toon maximaal 6 groepen zodat de mail elegant blijft. */
function groupBlocks(groups: CampaignGroup[]): string {
  return groups.slice(0, 6).map(groupBlock).join("");
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
  subject?: string | null;
  introText?: string | null;
  groups: CampaignGroup[];
  unsubToken: string;
  companyName?: string | null;
}): { html: string; text: string } {
  const unsubUrl = unsubscribeUrl(opts.unsubToken);
  const greeting = opts.companyName ? `Beste ${escapeHtml(opts.companyName)},` : "Beste,";
  const intro = opts.introText?.trim()
    ? escapeHtml(opts.introText.trim()).replace(/\n/g, "<br/>")
    : "Van warme travertijn en sfeervolle wandpanelen tot haarden die een ruimte tot leven brengen — bij Habitat One vindt u materialen met karakter, geselecteerd voor de mooiste projecten aan de Costa Blanca. We stelden een selectie voor u samen.";

  const html = `<div style="font-family:Helvetica,Arial,sans-serif;background:${COMPANY.cream};padding:28px 0">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;color:${COMPANY.charcoal}">
    <div style="background:${COMPANY.cream};padding:24px 30px">
      <img src="${COMPANY.logoUrl}" alt="${escapeHtml(COMPANY.name)}" height="44" style="display:block;height:44px;width:auto;border:0" />
      <div style="font-size:11px;letter-spacing:0.06em;color:${COMPANY.muted};margin-top:6px">${escapeHtml(COMPANY.tagline)}</div>
    </div>
    <div style="padding:26px 30px">
      <p style="margin:0 0 14px;font-size:15px">${greeting}</p>
      <p style="margin:0 0 6px;font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.55;color:${COMPANY.brown}">${intro}</p>
      ${groupBlocks(opts.groups)}
      <div style="text-align:center;margin:28px 0 6px">
        <a href="${WEBSITE}/account/aanvragen" style="background:${COMPANY.terracotta};color:#fff;padding:13px 26px;border-radius:10px;text-decoration:none;font-size:14px;letter-spacing:0.03em;display:inline-block">Bekijk prijzen — vraag een account aan</a>
      </div>
      <p style="margin:6px 0 0;text-align:center;font-size:13px"><a href="${WEBSITE}/products" style="color:${COMPANY.muted}">Of ontdek eerst de volledige collectie →</a></p>
      ${complianceFooter(unsubUrl)}
    </div>
  </div>
</div>`;

  const text = `${opts.companyName ? `Beste ${opts.companyName},` : "Beste,"}

${opts.introText?.trim() || "Graag stellen we een selectie uit onze productgroepen aan u voor."}

${opts.groups.map((g) => `• ${g.label}: ${g.url}`).join("\n")}

Bekijk prijzen — vraag een account aan: ${WEBSITE}/account/aanvragen
Volledige collectie: ${WEBSITE}/products

—
Deze e-mail bevat commerciële informatie (publicidad) van ${COMPANY.legalName}.
${COMPANY.addressStreet}, ${COMPANY.addressRegion} · ${COMPANY.phone} · ${COMPANY.email} · NIF ${COMPANY.vatNumber}
Afmelden: ${unsubUrl}
Privacybeleid: ${WEBSITE}/privacy`;

  return { html, text };
}
