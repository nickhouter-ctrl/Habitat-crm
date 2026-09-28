/**
 * Activatiemail voor het website-account (habitat-one.com).
 *
 * De taal volgt de aanvraag (locale van het aanvraagformulier) of, bij een
 * handmatig aangemaakt account, de voorkeurstaal van het contact. Onbekend →
 * Engels, net als de website zelf. De link krijgt het taalvoorvoegsel van de
 * website (Engels is daar de standaard zonder voorvoegsel).
 */
export type MailLanguage = "nl" | "en" | "es" | "de";

export function mailLanguage(...candidates: (string | null | undefined)[]): MailLanguage {
  for (const c of candidates) {
    if (c === "nl" || c === "en" || c === "es" || c === "de") return c;
  }
  return "en";
}

const MESSAGES: Record<MailLanguage, {
  subject: string;
  title: string;
  hello: string;
  fallbackName: string;
  body: (tier: string) => string;
  personal: string;
  business: string;
  button: string;
  expiry: string;
  copy: string;
  textBody: string;
}> = {
  nl: {
    subject: "Je Habitat One-account is klaar — stel je wachtwoord in",
    title: "Welkom bij Habitat One",
    hello: "Beste",
    fallbackName: "klant",
    body: (tier) => `Je ${tier} is aangemaakt. Stel hieronder je wachtwoord in om in te loggen en de prijzen te bekijken.`,
    personal: "account",
    business: "zakelijk account",
    button: "Wachtwoord instellen",
    expiry: "Deze link is 7 dagen geldig.",
    copy: "Werkt de knop niet? Kopieer:",
    textBody: "Je account is aangemaakt. Stel je wachtwoord in via:",
  },
  en: {
    subject: "Your Habitat One account is ready — set your password",
    title: "Welcome to Habitat One",
    hello: "Dear",
    fallbackName: "customer",
    body: (tier) => `Your ${tier} has been created. Set your password below to sign in and view the prices.`,
    personal: "account",
    business: "business account",
    button: "Set password",
    expiry: "This link is valid for 7 days.",
    copy: "Button not working? Copy this link:",
    textBody: "Your account has been created. Set your password here:",
  },
  es: {
    subject: "Tu cuenta de Habitat One está lista — crea tu contraseña",
    title: "Bienvenido a Habitat One",
    hello: "Hola",
    fallbackName: "cliente",
    body: (tier) => `Tu ${tier} se ha creado. Crea tu contraseña a continuación para iniciar sesión y ver los precios.`,
    personal: "cuenta",
    business: "cuenta de empresa",
    button: "Crear contraseña",
    expiry: "Este enlace es válido durante 7 días.",
    copy: "¿No funciona el botón? Copia este enlace:",
    textBody: "Tu cuenta se ha creado. Crea tu contraseña aquí:",
  },
  de: {
    subject: "Dein Habitat One-Konto ist bereit — Passwort festlegen",
    title: "Willkommen bei Habitat One",
    hello: "Hallo",
    fallbackName: "Kunde",
    body: (tier) => `Dein ${tier} wurde angelegt. Lege unten dein Passwort fest, um dich anzumelden und die Preise zu sehen.`,
    personal: "Konto",
    business: "Geschäftskonto",
    button: "Passwort festlegen",
    expiry: "Dieser Link ist 7 Tage gültig.",
    copy: "Funktioniert die Schaltfläche nicht? Kopiere diesen Link:",
    textBody: "Dein Konto wurde angelegt. Lege dein Passwort hier fest:",
  },
};

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Activatielink met het taalvoorvoegsel van de website (Engels zonder voorvoegsel). */
export function websiteActivationLink(baseUrl: string, token: string, language: MailLanguage) {
  const prefix = language === "en" ? "" : `/${language}`;
  return `${baseUrl}${prefix}/account/activeren?token=${encodeURIComponent(token)}`;
}

export function websiteActivationMail(opts: { name: string; token: string; tier: string; locale: string | null | undefined; baseUrl: string }) {
  const language = mailLanguage(opts.locale);
  const m = MESSAGES[language];
  const link = websiteActivationLink(opts.baseUrl, opts.token, language);
  const name = opts.name.trim() || m.fallbackName;
  const tierText = opts.tier === "aannemer" ? m.business : m.personal;
  return {
    subject: m.subject,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#2a2620;max-width:560px">
  <h2 style="color:#402419;margin:0 0 12px">${m.title}</h2>
  <p>${m.hello} ${escapeHtml(name)},</p>
  <p>${m.body(tierText)}</p>
  <p style="margin:22px 0"><a href="${link}" style="background:#b5532b;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-size:14px">${m.button}</a></p>
  <p style="font-size:12px;color:#7a6a58">${m.expiry} ${m.copy} ${link}</p>
</div>`,
    text: `${m.hello} ${name},\n\n${m.textBody}\n${link}\n\n${m.expiry}`,
  };
}
