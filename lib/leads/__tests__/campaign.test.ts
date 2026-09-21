import { describe, expect, it } from "vitest";

import { buildCampaignEmail, unsubscribeUrl, type CampaignLang } from "@/lib/leads/campaign";
import { COMPANY } from "@/lib/company";

const basis = {
  subject: "Novedades",
  introText: null,
  groups: [{ collection: "travertijn", label: "Travertino", url: "https://www.habitat-one.com/es/travertijn", imageUrl: null }],
  unsubToken: "tok-123",
  companyName: "Empresa Ejemplo S.L.",
};

const TALEN: CampaignLang[] = ["es", "nl", "de", "en"];

describe("campagnemail", () => {
  it("heeft drie manieren om te reageren: account, afspraak en rondkijken", () => {
    const { html, text } = buildCampaignEmail({ lang: "es", ...basis });
    // Prijzen zien (account aanvragen)
    expect(html).toContain("/account/aanvragen");
    // Een afspraak maken — de afsprakenmodule van de website
    expect(html).toContain("/showroom");
    expect(html).toContain("Reservar una cita");
    // En gewoon rondkijken
    expect(html).toContain("/products");
    // Alle drie ook in de platte-tekstversie, voor clients zonder HTML
    expect(text).toContain("/showroom");
    expect(text).toContain("/account/aanvragen");
    expect(text).toContain("/products");
  });

  it("zet de afspraakknop in elke taal, met de juiste taalprefix", () => {
    for (const lang of TALEN) {
      const { html } = buildCampaignEmail({ lang, ...basis });
      const verwacht = lang === "en" ? "/showroom" : `/${lang}/showroom`;
      expect(html, lang).toContain(verwacht);
    }
  });

  it("gebruikt een tabel voor de knoppen — Outlook doet niets met flexbox", () => {
    const { html } = buildCampaignEmail({ lang: "nl", ...basis });
    expect(html).toContain('role="presentation"');
    expect(html).not.toContain("display:flex");
  });

  it("houdt de verplichte gegevens en de afmeldlink erin", () => {
    const { html, text } = buildCampaignEmail({ lang: "es", ...basis });
    expect(html).toContain(COMPANY.vatNumber);
    expect(html).toContain("publicidad");
    expect(html).toContain(unsubscribeUrl("tok-123"));
    expect(text).toContain(unsubscribeUrl("tok-123"));
  });

  it("spreekt het bedrijf aan en nooit een persoon", () => {
    const { html } = buildCampaignEmail({ lang: "es", ...basis, companyName: "Estudio X" });
    expect(html).toContain("Estudio X");
    const zonder = buildCampaignEmail({ lang: "es", ...basis, companyName: null });
    expect(zonder.html).toContain("Estimados señores");
  });

  it("ontsnapt aan HTML in een bedrijfsnaam", () => {
    const { html } = buildCampaignEmail({ lang: "nl", ...basis, companyName: '<script>x</script> & Zn' });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&amp;");
  });
});

it("preserves approved bilingual copy with recipient unsubscribe and strips scripts", () => {
  const result = buildCampaignEmail({ ...basis, lang: "es", approvedMail: {
    html: '<section lang="es"><h2>Ventanas de aluminio</h2><p>App de medición</p></section><section lang="en">Aluminium windows</section><script>alert(1)</script>',
    text: 'ESPAÑOL\nVentanas de aluminio\nENGLISH\nAluminium windows',
  } });
  expect(result.html).toContain('lang="es"');
  expect(result.html).toContain('Aluminium windows');
  expect(result.html).not.toContain('<script');
  expect(result.html).toContain(unsubscribeUrl(basis.unsubToken));
  expect(result.text).toContain(unsubscribeUrl(basis.unsubToken));
  expect(result.html).not.toContain('/account/aanvragen');
});
