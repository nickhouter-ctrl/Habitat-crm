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

export type CampaignLang = "es" | "nl" | "de" | "en";

function localePrefix(lang: CampaignLang): string {
  return lang === "en" ? "" : `/${lang}`;
}

interface Copy {
  greeting: (name?: string | null) => string;
  defaultIntro: string;
  discover: string;
  cta: string;
  browse: string;
  notice: (legalName: string) => string;
  unsubscribe: string;
  privacy: string;
}

const TXT: Record<CampaignLang, Copy> = {
  es: {
    greeting: (n) => (n ? `Estimado equipo de ${n}:` : "Estimados señores:"),
    defaultIntro:
      "Desde el cálido travertino y los evocadores paneles de pared hasta chimeneas que dan vida a cada espacio: en Habitat One encontrará materiales con carácter, seleccionados para los proyectos más bellos de la Costa Blanca. Hemos preparado una selección para usted.",
    discover: "Descubra la colección →",
    cta: "Ver precios — solicite una cuenta",
    browse: "O descubra primero la colección completa →",
    notice: (l) =>
      `Este correo contiene información comercial (publicidad) de ${l}. Lo recibe porque su empresa, según fuentes públicas, podría estar interesada en nuestra oferta (comunicación entre empresas).`,
    unsubscribe: "Darse de baja / no recibir más correos",
    privacy: "Política de privacidad",
  },
  nl: {
    greeting: (n) => (n ? `Beste ${n},` : "Beste,"),
    defaultIntro:
      "Van warme travertijn en sfeervolle wandpanelen tot haarden die een ruimte tot leven brengen — bij Habitat One vindt u materialen met karakter, geselecteerd voor de mooiste projecten aan de Costa Blanca. We stelden een selectie voor u samen.",
    discover: "Ontdek de collectie →",
    cta: "Bekijk prijzen — vraag een account aan",
    browse: "Of ontdek eerst de volledige collectie →",
    notice: (l) =>
      `Deze e-mail bevat commerciële informatie (publicidad) van ${l}. U ontvangt deze omdat uw bedrijf, op basis van openbare bronnen, mogelijk interesse heeft in ons aanbod (zakelijke communicatie).`,
    unsubscribe: "Afmelden / geen e-mails meer ontvangen",
    privacy: "Privacybeleid",
  },
  de: {
    greeting: (n) => (n ? `Sehr geehrtes Team von ${n},` : "Sehr geehrte Damen und Herren,"),
    defaultIntro:
      "Von warmem Travertin über stimmungsvolle Wandpaneele bis zu Kaminen, die einen Raum zum Leben erwecken – bei Habitat One finden Sie Materialien mit Charakter, ausgewählt für die schönsten Projekte an der Costa Blanca. Wir haben eine Auswahl für Sie zusammengestellt.",
    discover: "Zur Kollektion →",
    cta: "Preise ansehen — Konto anfragen",
    browse: "Oder entdecken Sie zuerst die gesamte Kollektion →",
    notice: (l) =>
      `Diese E-Mail enthält kommerzielle Informationen (Werbung) von ${l}. Sie erhalten sie, weil Ihr Unternehmen laut öffentlichen Quellen an unserem Angebot interessiert sein könnte (Geschäftskommunikation).`,
    unsubscribe: "Abmelden / keine E-Mails mehr erhalten",
    privacy: "Datenschutz",
  },
  en: {
    greeting: (n) => (n ? `Dear ${n} team,` : "Dear Sir or Madam,"),
    defaultIntro:
      "From warm travertine and evocative wall panels to fireplaces that bring a space to life — at Habitat One you'll find materials with character, selected for the finest projects on the Costa Blanca. We've curated a selection for you.",
    discover: "Discover the collection →",
    cta: "See prices — request an account",
    browse: "Or explore the full collection first →",
    notice: (l) =>
      `This email contains commercial information (advertising) from ${l}. You received it because your company, based on public sources, may be interested in our offering (business-to-business communication).`,
    unsubscribe: "Unsubscribe / stop receiving emails",
    privacy: "Privacy policy",
  },
};

/** Eén groep als groot, editorial beeldblok — bedoeld om sfeer/gevoel op te roepen. */
function groupBlock(g: CampaignGroup, discover: string): string {
  const img = g.imageUrl
    ? `<img src="${escapeHtml(g.imageUrl)}" width="548" alt="${escapeHtml(g.label)}" style="display:block;width:100%;height:260px;object-fit:cover;border-radius:14px" />`
    : `<div style="width:100%;height:260px;border-radius:14px;background:${COMPANY.sand}"></div>`;
  return `<a href="${escapeHtml(g.url)}" style="text-decoration:none;color:inherit;display:block;margin:22px 0">
    ${img}
    <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.2;color:${COMPANY.brown};margin-top:12px">${escapeHtml(g.label)}</div>
    <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${COMPANY.terracotta};margin-top:4px">${escapeHtml(discover)}</div>
  </a>`;
}

/** Verplichte, meelezbare footer: identificatie + publicidad + herkomst + privacy + afmelden. */
function complianceFooter(unsubUrl: string, privacyUrl: string, t: Copy): string {
  return `<div style="margin-top:26px;border-top:1px solid ${COMPANY.sand};padding-top:16px;font-size:12px;color:${COMPANY.muted};line-height:1.7">
    <p style="margin:0 0 8px">${escapeHtml(t.notice(COMPANY.legalName))}</p>
    <div style="margin:0 0 8px">
      <span style="display:block;font-weight:600;color:${COMPANY.charcoal}">${escapeHtml(COMPANY.legalName)}</span>
      <span style="display:block">${escapeHtml(COMPANY.addressStreet)}</span>
      <span style="display:block">${escapeHtml(COMPANY.addressRegion)}</span>
      <span style="display:block">${escapeHtml(COMPANY.phone)} · ${escapeHtml(COMPANY.email)} · ${escapeHtml(WEBSITE)}</span>
      <span style="display:block">NIF ${escapeHtml(COMPANY.vatNumber)}</span>
    </div>
    <p style="margin:0">
      <a href="${unsubUrl}" style="color:${COMPANY.terracotta};font-weight:600">${escapeHtml(t.unsubscribe)}</a>
      &nbsp;·&nbsp;
      <a href="${privacyUrl}" style="color:${COMPANY.muted}">${escapeHtml(t.privacy)}</a>
    </p>
  </div>`;
}

/** Bouwt de volledige campagne-mail voor één ontvanger, in de gekozen taal. */
export function buildCampaignEmail(opts: {
  lang?: CampaignLang;
  subject?: string | null;
  introText?: string | null;
  groups: CampaignGroup[];
  unsubToken: string;
  companyName?: string | null;
}): { html: string; text: string } {
  const lang = opts.lang ?? "es";
  const t = TXT[lang];
  const site = WEBSITE + localePrefix(lang);
  const unsubUrl = unsubscribeUrl(opts.unsubToken);
  const privacyUrl = `${site}/privacy`;
  const accountUrl = `${site}/account/aanvragen`;
  const productsUrl = `${site}/products`;

  const greeting = t.greeting(opts.companyName ? escapeHtml(opts.companyName) : null);
  const intro = opts.introText?.trim() ? escapeHtml(opts.introText.trim()).replace(/\n/g, "<br/>") : escapeHtml(t.defaultIntro);
  const blocks = opts.groups.slice(0, 6).map((g) => groupBlock(g, t.discover)).join("");

  const html = `<div style="font-family:Helvetica,Arial,sans-serif;background:${COMPANY.cream};padding:28px 0">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;color:${COMPANY.charcoal}">
    <div style="background:${COMPANY.cream};padding:24px 30px">
      <img src="${COMPANY.logoUrl}" alt="${escapeHtml(COMPANY.name)}" height="44" style="display:block;height:44px;width:auto;border:0" />
      <div style="font-size:11px;letter-spacing:0.06em;color:${COMPANY.muted};margin-top:6px">${escapeHtml(COMPANY.tagline)}</div>
    </div>
    <div style="padding:26px 30px">
      <p style="margin:0 0 14px;font-size:15px">${greeting}</p>
      <p style="margin:0 0 6px;font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.55;color:${COMPANY.brown}">${intro}</p>
      ${blocks}
      <div style="text-align:center;margin:28px 0 6px">
        <a href="${accountUrl}" style="background:${COMPANY.terracotta};color:#fff;padding:13px 26px;border-radius:10px;text-decoration:none;font-size:14px;letter-spacing:0.03em;display:inline-block">${escapeHtml(t.cta)}</a>
      </div>
      <p style="margin:6px 0 0;text-align:center;font-size:13px"><a href="${productsUrl}" style="color:${COMPANY.muted}">${escapeHtml(t.browse)}</a></p>
      ${complianceFooter(unsubUrl, privacyUrl, t)}
    </div>
  </div>
</div>`;

  const text = `${t.greeting(opts.companyName ?? null)}

${opts.introText?.trim() || t.defaultIntro}

${opts.groups.map((g) => `• ${g.label}: ${g.url}`).join("\n")}

${t.cta}: ${accountUrl}
${productsUrl}

—
${t.notice(COMPANY.legalName)}
${COMPANY.addressStreet}, ${COMPANY.addressRegion} · ${COMPANY.phone} · ${COMPANY.email} · NIF ${COMPANY.vatNumber}
${t.unsubscribe}: ${unsubUrl}
${t.privacy}: ${privacyUrl}`;

  return { html, text };
}
